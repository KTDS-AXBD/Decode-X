---
id: sprint-214a
title: "Design — Sprint 214a: lpon-budget + lpon-purchase spec-container"
req: AIF-REQ-035
sprint: 214a
status: IN_PROGRESS
created: 2026-04-20
---

# Design — Sprint 214a

## §1 도메인 분석

### 1.1 lpon-budget (예산 관리)

LPON 시스템에서 회사(기업)가 직원 복지용 온누리상품권을 배포하기 위한
예산을 관리하는 도메인.

**관련 BL**: BL-006(회사 충전 한도), BL-031(충전/환불 집계)
**데이터 원장**: `calculations`, `charge_transactions`(company_id 필드)

#### 핵심 Empty Slots (발굴)

| Slot | 유형 | 설명 |
|------|------|------|
| ES-BUDGET-001 | E1 (Limit) | 예산 배정 한도 초과 시 처리 규칙 미정의 |
| ES-BUDGET-002 | E4 (Exception) | 예산 차감 후 충전 실패 시 예산 복구 규칙 미정의 |
| ES-BUDGET-003 | E2 (Lifecycle) | 기간 말 미사용 예산 이월/소멸 정책 미정의 |

### 1.2 lpon-purchase (상품권 구매)

이용자 또는 회사가 온누리상품권을 최초 구매(발행)하는 도메인.
충전(lpon-charge)은 기존 상품권 잔액을 올리는 것이고,
구매(lpon-purchase)는 신규 상품권 발행을 의미한다.

**관련 BL**: BL-024(구매 후 7일 이내 환불), BL-005(이용자 충전 한도)
**데이터 원장**: `vouchers`(purchased_at, face_amount), `charge_transactions`

#### 핵심 Empty Slots (발굴)

| Slot | 유형 | 설명 |
|------|------|------|
| ES-PURCHASE-001 | E4 (Idempotency) | 구매 중복 요청 방지 규칙 미정의 |
| ES-PURCHASE-002 | E1 (Limit) | 월별 구매 한도 규칙 미정의 |
| ES-PURCHASE-003 | E2 (Lifecycle) | 상품권 유효기간 산정 규칙 미정의 |

## §2 비즈니스 룰 상세

### 2.1 lpon-budget BL 목록

| ID | condition | criteria | outcome | exception |
|----|-----------|----------|---------|-----------|
| BB-001 | 회사가 예산을 배정 요청하는 경우 | 배정 금액 > 0 AND 배정 금액 ≤ 회사 최대 한도 | 예산 원장에 배정 기록 생성 | 한도 초과 시 거부 |
| BB-002 | 직원이 상품권 충전 요청 시 예산 차감 | 해당 직원의 예산 잔액 ≥ 충전 요청 금액 | 예산에서 차감하고 충전 진행 | 예산 부족 시 충전 거부 |
| BB-003 | 예산 잔액이 임계치 이하로 감소 시 | 예산 잔액 ≤ 배정 금액의 10% | 담당자에게 소진 임박 알림 발송 | 알림 미설정 시 미발송 |
| BB-004 | 예산 기간이 종료되는 경우 | 이월 정책이 'Y'로 설정됨 | 미사용 잔액을 다음 기간으로 이월 | 이월 정책 'N' 시 잔액 소멸 처리 |
| BB-005 | 예산 차감 후 충전이 실패한 경우 | 외부 API 오류 또는 충전 확정 실패 | 차감된 예산을 원복(복구) | 복구 실패 시 수기처리 에스컬레이션 |

### 2.2 lpon-purchase BL 목록

| ID | condition | criteria | outcome | exception |
|----|-----------|----------|---------|-----------|
| BP-001 | 이용자가 상품권 구매 요청 시 | 구매 금액 > 0 AND 구매 금액 ≤ 1회 구매 한도 | 결제 처리 진행 후 상품권 발행 | 한도 초과 시 거부 |
| BP-002 | 구매 결제가 정상 완료된 경우 | 결제 프로세스 에러 없이 종료 | 상품권 발행 (유효기간 설정) | [미정의] |
| BP-003 | 월별 구매 한도 검증 시 | 월 누적 구매 금액 + 신규 금액 ≤ 월 한도 | 구매 허용 | 한도 초과 시 거부 |
| BP-004 | 동일 구매 요청이 재전송된 경우 | purchaseRequestId가 이미 존재하고 status=completed | 기존 결과 반환 (이중 발행 방지) | status=processing 시 409 반환 |
| BP-005 | 구매 완료 후 7일 이내 환불 요청 | 상품권 미사용(잔액 = 액면가) | 전액 환불 처리 (BL-024 연동) | 7일 초과 시 환불 불가 |

## §3 AI-Ready 6기준 충족 계획

| 기준 | lpon-budget | lpon-purchase |
|------|:-----------:|:-------------:|
| 1. 명확한 condition | ✅ BB-001~005 | ✅ BP-001~005 |
| 2. 검증 가능한 criteria | ✅ 수치 기준 명시 | ✅ 수치 기준 명시 |
| 3. 확정적 outcome | ✅ 트리플 완비 | ✅ 트리플 완비 |
| 4. 예외 처리 | ✅ Else 명시 | ✅ Else 명시 |
| 5. 출처 추적성 | ✅ provenance.yaml | ✅ provenance.yaml |
| 6. 테스트 계약 | ✅ contract yaml | ✅ contract yaml |

## §4 파일 매핑 (Worker 없음, 문서 생성만)

| 생성 파일 | 경로 |
|----------|------|
| lpon-budget provenance | `.decode-x/spec-containers/lpon-budget/provenance.yaml` |
| lpon-budget rules | `.decode-x/spec-containers/lpon-budget/rules/budget-rules.md` |
| lpon-budget ES-001~003 rules | `.decode-x/spec-containers/lpon-budget/rules/ES-BUDGET-{001..003}.md` |
| lpon-budget ES-001~003 tests | `.decode-x/spec-containers/lpon-budget/tests/ES-BUDGET-{001..003}.yaml` |
| lpon-budget contract | `.decode-x/spec-containers/lpon-budget/tests/contract/budget-contract.yaml` |
| lpon-budget runbooks | `.decode-x/spec-containers/lpon-budget/runbooks/ES-BUDGET-{001..003}.md` |
| lpon-purchase provenance | `.decode-x/spec-containers/lpon-purchase/provenance.yaml` |
| lpon-purchase rules | `.decode-x/spec-containers/lpon-purchase/rules/purchase-rules.md` |
| lpon-purchase ES-001~003 rules | `.decode-x/spec-containers/lpon-purchase/rules/ES-PURCHASE-{001..003}.md` |
| lpon-purchase ES-001~003 tests | `.decode-x/spec-containers/lpon-purchase/tests/ES-PURCHASE-{001..003}.yaml` |
| lpon-purchase contract | `.decode-x/spec-containers/lpon-purchase/tests/contract/purchase-contract.yaml` |
| lpon-purchase runbooks | `.decode-x/spec-containers/lpon-purchase/runbooks/ES-PURCHASE-{001..003}.md` |

## §5 완결성 체크리스트 (KPI)

- [ ] 각 BL condition-criteria-outcome 완비 (완결성 ≥95%)
- [ ] AI-Ready 6기준 모두 체크 (≥70%)
- [ ] provenance.yaml 출처 필드 100% 작성
- [ ] 각 Empty Slot에 대한 테스트 시나리오 ≥2건
- [ ] 운영 runbook 각 ES별 1건
