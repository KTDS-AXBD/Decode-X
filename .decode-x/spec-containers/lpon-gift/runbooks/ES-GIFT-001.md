# ES-GIFT-001: 선물 만료 처리 — 운영 가이드

**Related BL (F504 cross-ref)**: BL-G004, BL-G002

**Empty Slot ID**: ES-GIFT-001
**대상**: 운영팀 / 백엔드 개발자

---

## 선물 미복원 민원 대응

### 감지 조건
- 이용자 "선물 발송 후 잔액이 돌아오지 않음" 민원
- 모니터링 `GiftExpired` 이벤트 미발생, `gift_transactions.status = 'pending'` 상태 과다

### 조치 절차

1. 해당 선물 건 조회
   ```sql
   SELECT gift_id, sender_user_id, receiver_user_id, amount, status, expires_at
   FROM gift_transactions
   WHERE sender_user_id = '<민원_userId>'
     AND created_at > NOW() - INTERVAL 30 DAY
   ORDER BY created_at DESC;
   ```

2. `status = 'pending'` + `expires_at < NOW()` 확인 → 만료 처리 누락
   - 원인: 배치 스케줄러 장애 또는 누락
   - 조치: 수동 만료 처리 트리거

3. 수동 만료 처리
   ```sql
   -- 트랜잭션 내 실행
   UPDATE gift_transactions SET status = 'expired' WHERE gift_id = '<giftId>' AND status = 'pending';
   INSERT INTO gift_ledger_entries (gift_id, entry_type, amount) VALUES ('<giftId>', 'refund_sender', <amount>);
   UPDATE vouchers SET balance = balance + <amount> WHERE user_id = '<senderId>';
   ```

4. 잔액 복원 확인
   ```sql
   SELECT balance FROM vouchers WHERE user_id = '<senderId>';
   ```

5. 인시던트 로그
   ```
   incident_id: INC-{YYYYMMDD}-{SEQ}
   type: GIFT_EXPIRY_MISSED
   gift_id: <값>
   resolution: manual_expiry_processed
   ```

---

## 배치 스케줄러 장애 점검

- 배치 주기: 1시간
- 점검: `gift_transactions WHERE status='pending' AND expires_at < NOW()-INTERVAL 2 HOUR` 건수 > 0이면 배치 지연
- 복구: 배치 재실행 (`SKIP LOCKED` 적용으로 중복 처리 안전)

---

## SLA
- 만료 선물 잔액 복원: 배치 주기(1시간) 이내
- 민원 수동 처리: 4시간 이내
