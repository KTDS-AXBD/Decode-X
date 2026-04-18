# Spec Container — POL-LPON-CHARGE-001 (온누리상품권 충전 규칙)

**Skill ID**: POL-LPON-CHARGE-001
**Domain**: LPON 충전 (Top-up)
**Source**: AI Foundry 역공학 추출 — pilot-lpon-cancel/01-business-logic.md §시나리오1
**Version**: 1.0.0
**Status**: draft

---

## 비즈니스 룰 (BL-001 ~ BL-008)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| BL-001 | 충전 요청 시 출금계좌에서 출금을 시도하는 경우 | 출금계좌 잔액 ≥ 충전 요청 금액 | 출금 처리를 진행한다 | 잔액 부족 시 출금 실패 에러를 반환한다 |
| BL-002 | 출금이 정상적으로 완료된 경우 | 출금 프로세스가 에러 없이 종료됨 | 충전 완료 처리한다 | — |
| BL-003 | 출금이 실패한 경우 | 출금 프로세스에서 오류 발생 | 에러를 반환하고 충전 프로세스를 중단한다 | — |
| BL-004 | 출금 요청 후 응답이 타임아웃된 경우 | 출금 요청 후 응답 대기 시간 > 타임아웃 기준 | 5분 후 출금상태조회 API를 호출하여 처리 결과를 확인하고 후속 처리를 진행한다 | — |
| BL-005 | 이용자가 충전을 요청하는 경우 | 충전 요청 금액 ≤ 충전 가능 금액 한도 | 충전 확정 처리를 진행한다 | 한도 초과 시 충전 거부 |
| BL-006 | 회사가 충전을 요청하는 경우 | 충전 요청 금액 ≤ 회사별 충전 한도 | 충전 원장 처리를 진행한다 | 한도 초과 시 충전 거부 |
| BL-007 | 이용자가 포인트 충전을 요청한 경우 | 포인트 충전 요청이 유효하고 한도 내 | 포인트 충전 확정 처리한다 | 유효하지 않거나 한도 초과 시 거부 |
| BL-008 | 자동충전 금액이 설정될 때 | blceCondAmt(잔액 조건), ymdCondAmt(일자 조건), condSmAmt(복합 조건) 중 하나 이상 충족 | 조건에 따라 자동충전 금액(stngAmt)이 산정되어 적용된다 | 조건 미충족 시 자동충전 미실행 |

---

## 데이터 영향

- **변경 테이블**: `charge_transactions`, `vouchers` (잔액 증가), `withdrawal_transactions`
- **이벤트 발행**: `ChargeCompleted`, `ChargeFailed`, `WithdrawalTimeout`

## 엣지 케이스

- 출금 타임아웃 후 5분 뒤 상태조회에서도 미확인 → 수기처리 에스컬레이션
- 자동충전: 잔액 조건 + 일자 조건 동시 충족 시 중복 충전 방지 (한 번만 실행)
- 회사/개인 충전 한도 별도 관리

## API 연동

- 출금: `/money/withdraw`
- 출금상태조회: `/money/withdrawStatus`
- 충전취소: `/money/chargeCancel`
