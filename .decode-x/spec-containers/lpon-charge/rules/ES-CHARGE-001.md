# ES-CHARGE-001: 충전 멱등성 규칙 (충전 중복 요청 방지)

**Empty Slot ID**: ES-CHARGE-001
**유형**: E4 (Exception Handling)
**우선순위**: High
**Sprint**: 2 (Fill 완성)
**선행 시드**: `docs/poc/sprint-1-fill-seed-01.md`

---

## 빈 슬롯 설명

BL-002("출금 완료 시 충전 확정")는 정상 흐름만 정의하며,
동일 요청이 재전송(retry/network duplicate)될 때의 중복 방지 규칙이 없다.

**위험**: 클라이언트 재시도 + 네트워크 중복 배달 → 이중 충전 + 이중 출금.

---

## 규칙 정의

### condition (When)
동일한 `chargeRequestId`로 충전 요청이 2회 이상 수신된 경우.

### criteria (If)
`charge_transactions` 테이블에 동일 `chargeRequestId`가 이미 존재하면서
`status IN ('processing', 'completed')`.

### outcome (Then)
기존 트랜잭션의 결과를 그대로 반환한다.
새 출금 요청(`withdrawal_transactions`)을 발생시키지 않는다.
응답 HTTP 200 + 기존 `chargeId` 반환.

### exception (Else)
`chargeRequestId`가 없거나 `status = 'failed'`이면 신규 처리한다.
처리 중(`processing`)인 경우 HTTP 409 + `CHARGE_IN_PROGRESS` 에러 반환,
10초 후 재시도 권고.

---

## 구현 힌트

```sql
-- 멱등성 체크 쿼리
SELECT chargeId, status, completedAt
FROM charge_transactions
WHERE chargeRequestId = :chargeRequestId
  AND status IN ('processing', 'completed')
LIMIT 1;
```

- `chargeRequestId`는 클라이언트가 생성하는 UUID (X-Request-Id 또는 body field)
- DB 유니크 인덱스: `(chargeRequestId, status)` 필터 인덱스 권장
- 분산 환경: Redis/D1 락 불필요 — DB 조회 + 응답으로 충분 (조회→결과 간 gap은 허용)
