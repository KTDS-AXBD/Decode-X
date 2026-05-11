# ES-GIFT-003: 선물 잔액 이전 원자성 장애 — 운영 가이드

**Related BL (F504 cross-ref)**: BL-G006, BL-G002

**Empty Slot ID**: ES-GIFT-003
**대상**: 백엔드 개발자 / SRE

---

## GiftTransferFailed 이벤트 대응

### 감지 조건
- `GiftTransferFailed` 이벤트 발생
- 이용자 "선물 수락했는데 잔액이 없어요" 민원
- `gift_transactions.status = 'pending'` 상태에서 장시간 유지 (수락 시도 후 실패)

### 조치 절차

1. 잔액 상태 확인
   ```sql
   -- 발송자 잔액 (발송 시 차감됨)
   SELECT balance FROM vouchers WHERE user_id = '<senderId>';
   
   -- 수신자 잔액 (증가 안 됨)
   SELECT balance FROM vouchers WHERE user_id = '<receiverId>';
   
   -- 원장 항목 확인
   SELECT entry_type, amount, executed_at
   FROM gift_ledger_entries
   WHERE gift_id = '<giftId>';
   ```

2. `debit_sender` 존재 + `credit_receiver` 부재 → 부분 실패 (롤백 미완료)
   - 긴급: 수동 `credit_receiver` 삽입 + 수신자 잔액 증가

   ```sql
   -- 트랜잭션 내 실행
   INSERT INTO gift_ledger_entries (gift_id, entry_type, amount, executed_at)
   VALUES ('<giftId>', 'credit_receiver', <amount>, NOW());
   UPDATE vouchers SET balance = balance + <amount> WHERE user_id = '<receiverId>';
   UPDATE gift_transactions SET status = 'accepted', accepted_at = NOW()
   WHERE gift_id = '<giftId>' AND status = 'pending';
   ```

3. 양쪽 원장 항목 없음 → 정상 롤백
   - `status = 'pending'` 상태 → 수신자에게 재수락 안내

4. 인시던트 로그
   ```
   type: GIFT_TRANSFER_PARTIAL_FAILURE
   gift_id: <값>
   sender_id: <값>
   receiver_id: <값>
   resolution: manual_credit_applied | reaccept_required
   ```

---

## 예방 점검

- Cloudflare D1 `batch()` API 트랜잭션 사용 여부 코드 검토
- `gift_ledger_entries (gift_id, entry_type)` UNIQUE 인덱스 존재 확인
- `GiftTransferFailed` 이벤트 알림: PagerDuty 연동 권장

---

## SLA
- `GiftTransferFailed` 감지 후 수신자 잔액 복원: 4시간 이내
