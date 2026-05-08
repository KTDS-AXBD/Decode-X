# Spec Container — POL-MIRAEASSET-PENSION-001 (미래에셋 퇴직연금 관리)

**Skill ID**: POL-MIRAEASSET-PENSION-001
**Domain**: Miraeasset 퇴직연금 (Retirement Pension Management)
**Source**: AI Foundry 역공학 추출 — D1 production 2,827 policies + chunks 2건 PoC (세션 265)
**Version**: 1.0.0
**Status**: draft

---

## 도메인 설명

미래에셋 퇴직연금(IRP 포함) 가입·적립·중도인출·수령·해지 프로세스를 관리한다.
가입자의 근속 기간, 적립 한도, 수령 시기 등 법정 기준을 검증하고, 원리금 지급 시 원자성을 보장한다.
F418 신규 inference exception 자연 채움 production scale 검증 도메인.

---

## 비즈니스 룰 (P-001 ~ P-007)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| P-001 | 가입자가 퇴직연금 가입을 신청하는 경우 | 근속기간 ≥ 1년 AND 연령 ≥ 18세 AND 고용 상태 = 재직 중 | 가입 승인 후 계좌 개설 처리 | 조건 미충족 시 가입 거부 (E422-INELIGIBLE) |
| P-002 | 가입자가 연간 적립 요청을 하는 경우 | 요청 적립 금액 > 0 AND (기적립 + 요청액) ≤ 연간 법정 한도(1,800만원) | 적립 원장(`pension_ledger`) 갱신 및 적립 완료 처리 | 한도 초과 시 적립 거부 (E422-LIMIT_EXCEEDED) |
| P-003 | 가입자가 중도인출을 요청하는 경우 | 인출 사유가 법정 허용 사유(주택 구입·전세·의료비·재난 등)에 해당 | 중도인출 요청 상태를 '심사 중'으로 전환 후 처리 진행 | 허용 사유 미해당 시 인출 거부 (E403-INVALID_REASON) |
| P-004 | 가입자가 연금 수령 개시를 신청하는 경우 | 신청자 연령 ≥ 55세 AND 가입 기간 ≥ 5년 | 수령 개시 상태로 전환 및 수령 스케줄 생성 | 조건 미충족 시 수령 개시 거부 (E422-AGE_NOT_MET) |
| P-005 | 가입자의 연간 납입액에 세액공제를 적용하는 경우 | 세액공제 대상 납입액 ≤ 연간 세액공제 한도(900만원) | 세액공제 한도 이내 납입액에 대해 세액공제 처리 | 한도 초과분은 세액공제 제외, 초과 납입 기록 유지 |
| P-006 | 가입자가 중도 해지를 요청하는 경우 | 해지 요청 상태 = 'PENDING' AND 해지 사유 코드 유효 | 계좌 상태를 'TERMINATED'로 전환하고 잔여 원리금 환급 | 진행 중인 중도인출 건 존재 시 해지 보류 (E409-WITHDRAWAL_IN_PROGRESS) |
| P-007 | 원리금 지급(만기 수령·중도인출·해지 환급)을 처리하는 경우 | 원금과 이자가 모두 정상 계산된 상태 | 원금 차감 + 이자 지급 + 지급 이력 기록을 하나의 트랜잭션으로 처리 | 이자 계산 오류 또는 원금 부족 시 전체 롤백 (ES-PENSION-003) |

---

## 데이터 영향

- **관련 테이블**: `pension_accounts` (신규), `pension_ledger` (신규), `pension_withdrawals` (신규), `pension_payouts` (신규)
- **이벤트 발행**: `PensionEnrolled`, `PensionAccumulated`, `EarlyWithdrawalRequested`, `ReceiptInitiated`, `TaxBenefitApplied`, `PensionTerminated`, `PrincipalInterestDisbursed`

## 엣지 케이스

- 동시 중도인출+해지 요청 시 선행 요청 우선 처리 (P-006 E409 방어)
- 연간 적립 한도는 역년(1/1~12/31) 기준 — 연말 일괄 처리 시 경계값 체크 필요
- IRP 계좌는 퇴직급여 수령 후 자동 이전 처리 — `pension_accounts.type = 'IRP'` 구분

## API 연동

- 가입 신청: `POST /api/v1/pension/enroll`
- 적립 요청: `POST /api/v1/pension/{accountId}/accumulate`
- 중도인출 요청: `POST /api/v1/pension/{accountId}/withdraw/early`
- 수령 개시: `POST /api/v1/pension/{accountId}/receipt/initiate`
- 세액공제 적용: `POST /api/v1/pension/{accountId}/tax-benefit`
- 해지: `POST /api/v1/pension/{accountId}/terminate`
- 원리금 지급: `POST /api/v1/pension/{accountId}/disburse`
