# Spec Container — POL-LPON-PURCHASE-001 (온누리상품권 구매)

**Skill ID**: POL-LPON-PURCHASE-001
**Domain**: LPON 상품권 구매 (Voucher Purchase / Initial Issuance)
**Source**: AI Foundry 역공학 추출 — BL-024(구매 후 환불), vouchers.purchased_at, FN-005 + 추론
**Version**: 1.0.0
**Status**: draft

---

## 도메인 설명

이용자 또는 회사가 온누리상품권을 최초 구매(발행)하는 프로세스.
`lpon-charge`(기존 잔액 충전)와 구분되며, 신규 `vouchers` 레코드를 생성하는 최초 진입점이다.

- **구매**: 이용자가 플랫폼에서 대금을 납부하고 신규 상품권을 발행받는 행위
- **충전**: 기존 상품권의 잔액을 추가로 올리는 행위 (lpon-charge 도메인)

---

## 비즈니스 룰 (BP-001 ~ BP-005)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| BP-001 | 이용자가 상품권 구매를 요청하는 경우 | 구매 금액 > 0 AND 구매 금액 ≤ 1회 구매 한도 | 결제 처리 진행 후 신규 상품권(`vouchers`) 발행 | 한도 초과 시 E422 반환 |
| BP-002 | 구매 결제가 정상 완료된 경우 | 결제 프로세스가 에러 없이 종료됨 | 상품권 발행 (`vouchers` INSERT, purchased_at 설정, expires_at = purchased_at + 유효기간) | 결제 실패 시 상품권 미발행 |
| BP-003 | 이용자의 월별 구매 한도 검증 시 | 해당 월 누적 구매 금액 + 신규 금액 ≤ 월 구매 한도 | 구매 허용 진행 | 한도 초과 시 E422 MONTHLY_LIMIT_EXCEEDED |
| BP-004 | 동일 구매 요청이 재전송된 경우 | `purchaseRequestId`가 `purchase_transactions`에 이미 존재하고 `status = 'completed'` | 기존 voucher_id를 반환 (이중 발행 방지) | `status = 'processing'` 시 HTTP 409 + PURCHASE_IN_PROGRESS |
| BP-005 | 구매 완료 후 7일 이내 미사용 환불 요청 시 | 상품권 잔액 = 액면가 (미사용) AND 구매일로부터 7일 이내 | 전액 환불 처리 (BL-024 연동, lpon-charge 취소 흐름 준용) | 7일 초과 또는 일부 사용 시 환불 불가 |

---

## 데이터 영향

- **신규 테이블**: `purchase_transactions` (구매 거래 원장)
- **변경 테이블**: `vouchers` (발행), 월 구매 집계용 조회
- **이벤트 발행**: `VoucherPurchased`, `VoucherIssued`, `PurchaseRefunded`

## 엣지 케이스

- 구매 결제 성공 후 `vouchers` INSERT 실패 → 결제 취소 + 구매 트랜잭션 FAILED (ES-PURCHASE-001)
- 월 한도와 1회 한도 중복 체크 순서: 1회 한도 → 월 한도 순으로 검증
- 유효기간 설정: 구매일로부터 몇 개월인지 정책에 따라 상이 → ES-PURCHASE-003

## API 연동

- 상품권 구매: `POST /api/v1/vouchers/purchase`
- 구매 내역 조회: `GET /api/v1/vouchers/purchase-history`
- 구매 취소(7일 이내): `POST /api/v1/vouchers/{id}/purchase-cancel`
