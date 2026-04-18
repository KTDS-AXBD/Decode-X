# ES-CHARGE-007: 외부 머니플랫폼 출금 API 장애 시 재시도 정책

**Empty Slot ID**: ES-CHARGE-007
**유형**: E4 (Exception Handling)
**우선순위**: Med
**Sprint**: 4 (Fill 완성)
**발견 근거**: BL-003 "에러 반환 후 중단"만 있고, 재시도 횟수·인터벌·멱등성 키 미정의

---

## 빈 슬롯 설명

BL-003은 외부 출금 API 실패 시 단순히 "에러 반환"만 명시한다. 실제 운영에서는 일시적 네트워크 오류나 API 과부하로 인한 5xx가 자주 발생하며, 재시도 없이 실패 처리 시 사용자 불만과 수동 재처리 부담이 발생한다.

**위험**: 재시도 정책 없음 → 일시적 장애 시 과도한 실패 건 + 수기처리 급증.

---

## 규칙 정의

### condition (When)
외부 머니플랫폼 출금 API 호출 결과가 실패(오류 응답 또는 타임아웃)일 때.

### criteria (If)
| 응답 유형 | 재시도 가능 여부 | 근거 |
|-----------|:---------------:|------|
| 5xx (서버 오류) | ✅ 가능 | 서버 측 일시 오류 |
| Timeout (≥ 10s) | ✅ 가능 | 네트워크 일시 장애 |
| 4xx (클라이언트 오류) | ❌ 불가 | 요청 자체 오류 (재시도 무의미) |
| 429 (Rate Limit) | ✅ 가능 | `Retry-After` 헤더 대기 후 재시도 |

### outcome (Then)
**재시도 가능 오류**:
- Exponential Backoff: 1초 → 2초 → 4초 (최대 3회)
- 각 시도마다 멱등성 키(`chargeRequestId`) 포함 → 외부 API 중복 방지
- 3회 모두 실패 시:
  - `charge_transactions.status = 'FAILED_RETRY_EXHAUSTED'`
  - 운영팀 알림 발송 (PagerDuty/Slack `#charge-ops`)
  - 자동 수기처리 대기열 등록 (`manual_process_queue`)

**재시도 불가 오류**:
- 즉시 실패 처리: `status = 'FAILED_CLIENT_ERROR'`
- 에러 코드 + 사유를 응답에 포함

### exception (Else)
- Workers 30초 타임아웃 근접(25초) → 재시도 중단, 현재 시도 결과로 상태 기록
- `ctx.waitUntil()`을 사용해 재시도를 백그라운드로 이관 (응답 반환 후 계속 시도)

---

## 구현 힌트

```typescript
async function callWithRetry(
  url: string,
  body: unknown,
  chargeRequestId: string,
  maxRetries = 3,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "X-Idempotency-Key": chargeRequestId },
      body: JSON.stringify(body),
    });
    if (res.ok) return res;
    if (res.status >= 400 && res.status < 500) throw new Error(`CLIENT_ERROR:${res.status}`);
    lastError = new Error(`SERVER_ERROR:${res.status}`);
  }
  throw lastError ?? new Error("RETRY_EXHAUSTED");
}
```

- `chargeRequestId`를 멱등성 키로 사용 → 외부 API 이중 출금 방지
- Workers 타임아웃 고려: 재시도 총 대기 시간 ≤ 7초 (1+2+4=7s)
- `ctx.waitUntil()` 활용: 응답 반환 후 알림 발송 비동기 처리
