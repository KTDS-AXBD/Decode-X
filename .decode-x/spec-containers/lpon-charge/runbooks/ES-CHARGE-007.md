# ES-CHARGE-007: 외부 API 장애 시 재시도 — 운영 가이드

**Empty Slot ID**: ES-CHARGE-007
**대상**: 운영팀 / 백엔드 개발자

---

## FAILED_RETRY_EXHAUSTED 건 수동 처리

### 감지 조건

- `#charge-ops` Slack 채널에 `FAILED_RETRY_EXHAUSTED` 알림 수신
- `charge_transactions` 테이블 조회:
  ```sql
  SELECT chargeId, chargeRequestId, orgId, amount, status, updatedAt
  FROM charge_transactions
  WHERE status = 'FAILED_RETRY_EXHAUSTED'
    AND updatedAt > datetime('now', '-1 hour')
  ORDER BY updatedAt DESC;
  ```

### 처리 절차

1. 외부 API 상태 확인 (머니플랫폼 Status Page / 운영팀 연락)
2. API 복구 확인 후 수동 재처리:
   ```
   POST /admin/charges/{chargeId}/retry
   X-Admin-Token: <관리자_토큰>
   ```
3. 재처리 성공 시 트랜잭션 상태 확인:
   ```sql
   SELECT status FROM charge_transactions WHERE chargeId = '<chargeId>';
   -- 기대값: 'SUCCESS'
   ```
4. 재처리 실패 시 → 고객센터 수기 처리 대기열 이관

### 인시던트 기록

```
incident_id: INC-{YYYYMMDD}-RETRY-{SEQ}
type: RETRY_EXHAUSTED
chargeRequestId: <값>
orgId: <값>
amount: <값>
externalApiError: <HTTP 코드 + 메시지>
resolution: <수동재처리|취소|이관>
```

---

## 재시도 파라미터 조정 (코드 변경 필요)

| 파라미터 | 기본값 | 조정 가이드 |
|----------|--------|------------|
| maxRetries | 3 | API SLA < 1분 시 5로 상향 |
| backoffBase | 1초 | 네트워크 지연 큰 경우 2초로 상향 |
| timeout | 10초 | API 응답 지연 패턴 확인 후 조정 |

---

## SLA

- `FAILED_RETRY_EXHAUSTED` 알림 → 확인: 15분 이내
- 수동 재처리 완료: 2시간 이내
- 외부 API 복구 후 자동 재처리 (수동 트리거): 1시간 이내
