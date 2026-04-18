# ES-CHARGE-009: 출금계좌 잔액 조회 캐시 무효화 기준

**Empty Slot ID**: ES-CHARGE-009
**유형**: E3 (Reconcile)
**우선순위**: Med
**Sprint**: 4 (Fill 완성)
**발견 근거**: 잔액 조회가 실시간인지 캐시인지, 무효화 트리거 완전 미정의

---

## 빈 슬롯 설명

충전 전 사전 검증으로 출금계좌 잔액을 확인하지만, 조회가 실시간 API인지 캐시인지 정의되어 있지 않다. 잔액이 변경된 직후 캐시를 참조하면 충전 가능 판정이 잘못되어 출금 실패로 이어진다.

**위험**: 캐시 stale → 잔액 부족 상태에서 충전 시도 → 출금 실패 → 트랜잭션 롤백 비용.

---

## 규칙 정의

### condition (When)
충전 처리 전 출금계좌 잔액 사전 확인 요청 시, 또는 잔액 무효화 이벤트 발생 시.

### criteria (If)
**캐시 조회 정책**:
| 상황 | 처리 |
|------|------|
| 캐시 존재 + TTL 이내(60초) | 캐시 반환 (KV `balance:<accountId>`) |
| 캐시 없음 또는 TTL 초과 | 외부 잔액 API 실시간 조회 후 캐시 갱신 |
| 캐시 무효화 트리거 발생 | 즉시 KV 삭제 → 다음 조회 시 실시간 호출 |

**무효화 트리거 이벤트**:
- `CHARGE_SUCCESS` — 충전 완료 (잔액 감소 확정)
- `CHARGE_FAILED` — 출금 실패 (잔액 복구 가능성)
- `CHARGE_CANCELLED` — 충전 취소 (잔액 복구)
- `ACCOUNT_CHANGED` — 출금계좌 변경 (계좌 전환)

### outcome (Then)
- **정상 캐시 히트**: `{ balance: <값>, cached: true, cachedAt: <ISO8601> }` 반환
- **실시간 조회**: 외부 API 호출 → KV에 60초 TTL로 저장 → 결과 반환
- **무효화 트리거**: `await env.KV.delete("balance:" + accountId)` 즉시 실행

### exception (Else)
- 외부 잔액 API 장애 시: 캐시 stale 허용 (최대 TTL 5분으로 연장) + 응답에 `stale: true` 플래그
- stale 상태 충전 진행 시: 출금 API에서 최종 잔액 확인 (2단계 검증)

---

## 구현 힌트

```typescript
async function getAccountBalance(
  accountId: string,
  env: Env,
): Promise<{ balance: number; cached: boolean }> {
  const cacheKey = `balance:${accountId}`;
  const cached = await env.KV.get(cacheKey, "json") as { balance: number } | null;
  if (cached) return { balance: cached.balance, cached: true };

  const res = await fetch(`${env.MONEY_PLATFORM_URL}/accounts/${accountId}/balance`, {
    headers: { Authorization: `Bearer ${env.MONEY_API_TOKEN}` },
  });
  if (!res.ok) {
    // 장애 시 stale 캐시 조회 (TTL 무시)
    const stale = await env.KV.getWithMetadata(cacheKey, "json");
    if (stale.value) return { balance: (stale.value as { balance: number }).balance, cached: true };
    throw new Error("BALANCE_API_UNAVAILABLE");
  }
  const data = await res.json() as { balance: number };
  await env.KV.put(cacheKey, JSON.stringify(data), { expirationTtl: 60 });
  return { balance: data.balance, cached: false };
}

// 무효화 함수 (충전 완료/실패/취소 이벤트 후 호출)
async function invalidateBalanceCache(accountId: string, env: Env): Promise<void> {
  await env.KV.delete(`balance:${accountId}`);
}
```

- TTL 60초: 충전 소요 시간(평균 3~5초) 대비 충분한 신선도
- stale 최대 5분: 외부 API 장애 SLA(5분 내 복구 목표) 기준
- 2단계 검증: svc-ingestion → svc-policy 간 잔액 재확인으로 stale 위험 완화
