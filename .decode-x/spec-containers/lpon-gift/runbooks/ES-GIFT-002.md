# ES-GIFT-002: 선물 발송 취소 — 운영 가이드

**Related BL (F504 cross-ref)**: BL-G005, BL-G002

**Empty Slot ID**: ES-GIFT-002
**대상**: 운영팀 / 고객센터

---

## 취소 불가 민원 대응 (수락 후 취소 요청)

### 감지 조건
- 이용자 "선물 보냈는데 취소하고 싶어요" + 수신자가 이미 수락한 경우

### 조치 절차

1. 선물 상태 확인
   ```sql
   SELECT gift_id, status, accepted_at, amount, sender_user_id, receiver_user_id
   FROM gift_transactions
   WHERE gift_id = '<giftId>';
   ```

2. `status = 'accepted'` 확인 → 수신자 이미 수락
   - 정책: 수락 후 취소 불가 (BL-G005)
   - 고객 안내: "선물이 이미 수락되어 취소가 불가합니다. 수신자에게 직접 반환 요청 또는 고객센터 수기 처리를 통해 진행할 수 있습니다."

3. 예외적 수기 처리 (강성 민원, 관리자 승인 필요)
   - 수신자 동의 확인 필수
   - 관리자 권한으로 `gift_transactions.status = 'refunded_manually'` 처리
   - `gift_ledger_entries`에 역분개 삽입
   - 감사 로그 기록 필수

---

## 취소 처리 실패 점검

- 취소 요청 후 `status = 'canceled'` 미전환 → DB 트랜잭션 실패
- 점검: `gift_transactions WHERE status='pending' AND updated_at < NOW()-INTERVAL 1 HOUR` 장기 pending 건 확인
- 재처리: 해당 `gift_id`로 취소 API 재호출 (멱등성 보장)

---

## SLA
- pending 선물 취소 처리: 즉시 (실시간)
- 수기 취소 처리(수락 후): 영업일 1일 이내 (관리자 승인 필요)
