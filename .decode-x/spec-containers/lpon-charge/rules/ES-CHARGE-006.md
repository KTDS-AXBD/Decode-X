# ES-CHARGE-006: 대량 충전 요청 Rate Limiting 정책

**Empty Slot ID**: ES-CHARGE-006
**유형**: E1 (Surge)
**우선순위**: High
**Sprint**: 4 (Fill 완성)
**발견 근거**: Long-list B-3 — 초당 N건 초과 충전 요청 시 처리 방법 완전 미정의

---

## 빈 슬롯 설명

충전 API에 Rate Limiting 규칙이 없다. 대량 배치 충전(급여일, 명절 상품권 배포)이나 장애 후 재시도 폭주 시 시스템 전체가 마비될 수 있다.

**위험**: 단일 회사의 배치 충전이 전체 시스템 처리량을 독점 → 다른 회사 충전 지연/실패.

---

## 규칙 정의

### condition (When)
단일 회사 또는 시스템 전체에서 충전 요청이 단위 시간 임계치를 초과할 때.

### criteria (If)
| 구분 | 임계치 | 측정 창 |
|------|--------|---------|
| 회사 단위 | 10 req/s | 슬라이딩 윈도우 1초 |
| 배치 단위 (단일 회사 bulk) | 100 req/min | 슬라이딩 윈도우 60초 |
| 시스템 전체 | 1,000 req/min | 슬라이딩 윈도우 60초 |

임계치는 KV `rate_limit_config:<orgId>` 에 저장하여 운영 중 조정 가능.

### outcome (Then)
- **회사/배치 임계치 초과**: HTTP 429 반환
  ```
  { "error": "RATE_LIMIT_EXCEEDED", "retryAfter": 5 }
  ```
  `Retry-After: 5` 헤더 포함. 대기열 삽입 가능(Cloudflare Queue push).
- **시스템 임계치 초과**: Circuit Breaker Open → 모든 신규 요청 즉시 503 반환, 30초 후 Half-Open 전환.

### exception (Else)
- 임계치 조회 실패(KV 장애) → fail-open: 요청 허용 + 로그 기록(`RATE_LIMIT_CONFIG_MISSING`)
- 정부/긴급 충전 요청 (`X-Priority: EMERGENCY` 헤더) → Rate Limit 면제

---

## 구현 힌트

```typescript
// KV 기반 슬라이딩 윈도우 카운터
const key = `rate:charge:${orgId}:${Math.floor(Date.now() / 1000)}`;
const count = await env.KV.get(key);
if (Number(count) >= COMPANY_LIMIT_PER_SEC) {
  return new Response(JSON.stringify({ error: "RATE_LIMIT_EXCEEDED", retryAfter: 5 }), {
    status: 429,
    headers: { "Retry-After": "5", "Content-Type": "application/json" },
  });
}
await env.KV.put(key, String(Number(count ?? 0) + 1), { expirationTtl: 2 });
```

- KV atomic write: Cloudflare KV는 단순 카운터 용도로 적합 (초단위 TTL)
- Durable Object 대안: 높은 정밀도 필요 시 DO 카운터 사용 (추가 비용)
- Circuit Breaker 상태: KV `circuit_breaker:charge:status` = OPEN/HALF_OPEN/CLOSED
