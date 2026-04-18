# ES-CHARGE-008: 이중 출금 감지 — 운영 가이드

**Empty Slot ID**: ES-CHARGE-008
**대상**: 운영팀 / 결제 인프라 팀

---

## 이중 출금 발생 시 수동 조치

### 감지 조건
- `withdrawal_transactions`에 `status = 'DUPLICATE_BLOCKED'` 기록
- `status = 'UNCERTAIN'` 기록 + 미해소 에스컬레이션 티켓
- 고객센터 이중 출금 민원 (카드사 이중 차감)

### 조치 절차

1. 내부 기록 조회
   ```sql
   SELECT withdrawal_id, withdrawal_request_id, status, external_tx_id,
          amount, created_at, updated_at
   FROM withdrawal_transactions
   WHERE withdrawal_request_id = '<민원_requestId>'
   ORDER BY created_at;
   ```

2. 외부 은행 상태 확인 (은행 대사 시스템 또는 직접 조회)
   ```
   GET /withdrawal/status/<withdrawal_request_id>
   → 응답: { status: "PROCESSED"|"NOT_PROCESSED", txId, amount, processedAt }
   ```

3. 이중 출금 확인 시 환불 처리
   - 은행 팀에 이중 차감 취소 요청
   - `POST /money/withdrawalRefund` with `{ withdrawalId: "<중복건>", reason: "DUPLICATE_WITHDRAWAL" }`

4. UNCERTAIN 건 처리 (외부 API 타임아웃으로 상태 불명)
   - 은행 대사 시스템에서 수동 확인
   - 처리됨 확인 시 → DUPLICATE_BLOCKED로 갱신 + 환불
   - 미처리 확인 시 → FAILED로 갱신 + 신규 출금 허용

5. 인시던트 기록
   ```
   incident_id: INC-{YYYYMMDD}-WD-{SEQ}
   type: DUPLICATE_WITHDRAWAL | UNCERTAIN_WITHDRAWAL
   withdrawalRequestId: <값>
   externalTxIds: [<원본txId>, <중복txId>]
   resolution: <환불|수동확인|정상>
   ```

---

## UNCERTAIN 에스컬레이션 SLA

| 단계 | 담당 | 시한 |
|------|------|------|
| 에스컬레이션 티켓 수신 | 운영팀 | 즉시 |
| 은행 대사 조회 요청 | 결제인프라팀 | 2시간 |
| 상태 확정 + D1 갱신 | 개발팀 | 4시간 |
| 고객 잔액 조정 완료 | 운영팀 | 24시간 |

---

## 예방 조치 (개발팀)

- 모든 출금 요청에 `withdrawalRequestId` UUID 발급 (재호출 시 동일 값 재사용)
- 타임아웃 감지 → 즉시 외부 상태 조회 수행 (재호출 전 선조회)
- 외부 API 조회 타임아웃 상한: 10초 (은행 SLA 기준)
- `UNCERTAIN` 상태 기록 후 Slack #alert-payment 채널 자동 알림

---

## 모니터링 쿼리 (일별 정기 확인)

```sql
-- 금일 이중 출금 감지 건 집계
SELECT status, COUNT(*) AS cnt
FROM withdrawal_transactions
WHERE date(created_at) = date('now')
  AND status IN ('DUPLICATE_BLOCKED', 'UNCERTAIN')
GROUP BY status;
```
