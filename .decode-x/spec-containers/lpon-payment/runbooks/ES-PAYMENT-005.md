# ES-PAYMENT-005: 탈퇴 회원 결제취소 AP06 실패 — 운영 가이드

**Empty Slot ID**: ES-PAYMENT-005
**대상**: 운영팀 / 정산팀

---

## AP06 실패 수기처리 절차

### 감지 조건
- `cancel_transactions.status = 'AP06_FAILED'` 에스컬레이션 티켓 수신
- `incident_type = 'WITHDRAW_MEMBER_CANCEL_AP06_FAILED'`

### 조치 절차 (P2, 4시간 SLA)

1. 대상 건 확인
   ```sql
   SELECT ct.id, ct.paymentId, ct.userId, ct.amount, ct.ap06Error, ct.createdAt
   FROM cancel_transactions ct
   WHERE ct.status = 'AP06_FAILED'
   ORDER BY ct.createdAt;
   ```

2. AP06 시스템 상태 확인 (소진공 AP06 포털)

3. 장애 해소 시 수동 API 재호출
   ```bash
   curl -X POST https://ap06.api/cancel \
     -H "Authorization: Bearer <AP06_TOKEN>" \
     -d '{"paymentId": "<paymentId>", "amount": <amount>}'
   ```

4. 성공 시 DB 업데이트
   ```sql
   UPDATE cancel_transactions
   SET status = 'COMPLETED', completedAt = now(), manualProcessedBy = '<담당자>'
   WHERE id = '<cancel_id>';
   ```

5. 인시던트 종료 및 로그 기록
   ```
   incident_id: INC-AP06-{YYYYMMDD}-{SEQ}
   resolution: manual_retry_success | still_pending
   processedBy: <담당자>
   ```

### 탈퇴 회원 주의사항
- 탈퇴 회원이므로 앱 알림 불가 → 처리 완료 후 별도 기록만 유지
- 환불 계좌 정보가 삭제된 경우: 소진공 측에 환불 계좌 확인 요청
