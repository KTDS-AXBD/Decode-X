# ES-CHARGE-008: 이중 출금 감지 (타임아웃 후 재호출 시)

**Empty Slot ID**: ES-CHARGE-008
**유형**: E2 (Fraud/Anomaly Detection)
**우선순위**: High
**Sprint**: 3 (Fill 완성)
**발견 근거**: BL-004 재호출 경로에서 외부 API 이중 차감 방지 규칙 완전 누락

---

## 빈 슬롯 설명

BL-004는 출금 API 타임아웃 후 재호출을 허용하나,
외부 은행 API가 첫 호출을 이미 처리한 경우 재호출이 이중 출금을 유발한다.
이를 감지하여 차단하는 규칙이 전혀 없다.

**위험**: 타임아웃 후 재호출 → 외부 이미 처리됨 → 이중 출금 → 고객 잔액 손실.

---

## 규칙 정의

### condition (When)
출금 API 호출이 타임아웃(`>30s`) 후 재호출될 때.

### criteria (If)
재호출 전 이중 출금 여부 판정 (2단계):
1. **내부 조회**: `withdrawal_transactions`에 동일 `withdrawalRequestId`로 `status IN ('processing', 'completed')` 건 존재
2. **외부 조회** (내부 미확인 시): 은행 API `GET /withdrawal/status/{withdrawalRequestId}` 호출 → `PROCESSED` 여부 확인

### outcome (Then)
- **이중 출금 확인** (내부 또는 외부 `PROCESSED`):
  - 신규 출금 요청 차단
  - `withdrawal_transactions`에 `status='DUPLICATE_BLOCKED'` 기록
  - 에스컬레이션 티켓 자동 생성 (중요도: HIGH)
  - HTTP 409 + `WITHDRAWAL_DUPLICATE_DETECTED` 에러 반환
- **미처리 확인** (내·외부 모두 미처리):
  - 신규 출금 허용 + 새 `withdrawalRequestId` 생성 권장 (기존 재사용 허용 단 로그 필수)

### exception (Else)
- 외부 API 조회 자체 타임아웃 → `UNCERTAIN` 상태로 기록 + 에스컬레이션 (자동 재시도 금지)
- `UNCERTAIN` 건은 운영팀 수동 확인 필수 (SLA: 4시간)

---

## 구현 힌트

```sql
-- withdrawal_transactions 이중 출금 감지 쿼리
SELECT withdrawal_id, status, external_tx_id, created_at
  FROM withdrawal_transactions
 WHERE withdrawal_request_id = :withdrawalRequestId
   AND status IN ('processing', 'completed', 'DUPLICATE_BLOCKED')
 ORDER BY created_at DESC
 LIMIT 1;
```

```typescript
// 외부 은행 API 상태 조회 (svc-policy 내)
async function checkExternalWithdrawal(
  requestId: string,
  bankApiUrl: string,
): Promise<'PROCESSED' | 'NOT_PROCESSED' | 'UNCERTAIN'> {
  try {
    const res = await fetch(`${bankApiUrl}/withdrawal/status/${requestId}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return 'UNCERTAIN';
    const data = await res.json() as { status: string };
    return data['status'] === 'PROCESSED' ? 'PROCESSED' : 'NOT_PROCESSED';
  } catch {
    return 'UNCERTAIN';
  }
}
```

- `withdrawalRequestId`: 최초 호출 시 생성한 UUID, 재호출 시 동일 값 전달
- 외부 조회 TTL: 10초 (은행 API SLA 기준)
- `UNCERTAIN` 에스컬레이션: `escalation_tickets` 테이블 INSERT + Slack 알림
