# ES-PURCHASE-002: 월별 구매 한도 (Monthly Purchase Limit)

**Empty Slot ID**: ES-PURCHASE-002
**유형**: E1 (Limit / Boundary)
**우선순위**: Medium
**Sprint**: 214a (Fill 완성)
**선행 시드**: `반제품-스펙/pilot-lpon-cancel/01-business-logic.md §BL-005` (이용자 충전 한도 패턴)

---

## 빈 슬롯 설명

BL-005("이용자가 충전을 요청하는 경우 — 충전 가능 금액 한도")는 단건 충전 한도를
정의하지만, 상품권 구매에 적용되는 **월별 누적 구매 한도**가 정의되지 않았다.

온누리상품권은 정책상 1인당 월 구매 한도가 설정되어 있으므로
이를 검증하는 비즈니스 룰이 필요하다.

**위험**: 월 한도 미검증 → 과도한 구매 허용 → 정책 위반.

---

## 규칙 정의

### condition (When)
이용자가 상품권 구매를 요청하는 경우.

### criteria (If)
해당 월의 누적 구매 금액 + 신규 구매 금액 ≤ 월 구매 한도 (`MONTHLY_PURCHASE_LIMIT` 설정값).

### outcome (Then)
구매를 허용하고 누적 금액을 갱신한다.

### exception (Else)
`누적 + 신규 > 한도`이면:
- HTTP 422 + 에러코드 `MONTHLY_LIMIT_EXCEEDED`
- 응답에 `thisMonthUsed`, `monthlyLimit`, `available` 포함

---

## 구현 힌트

```sql
-- 해당 월 누적 구매 금액 조회
SELECT COALESCE(SUM(face_amount), 0) AS monthly_used
FROM purchase_transactions
WHERE user_id = :userId
  AND status = 'completed'
  AND strftime('%Y-%m', purchased_at) = strftime('%Y-%m', 'now');
```

- `MONTHLY_PURCHASE_LIMIT`는 Workers KV 또는 D1 설정 테이블에 저장 (하드코딩 금지)
- 조회와 INSERT 사이의 TOCTOU는 `purchase_transactions` UNIQUE 제약 + 멱등성 키로 해소
- 월 초 갱신: 별도 배치 불필요 (동적 집계 쿼리 사용)
