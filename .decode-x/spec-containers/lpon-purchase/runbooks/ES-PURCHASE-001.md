# ES-PURCHASE-001: 이중 구매 발생 — 운영 가이드

**Empty Slot ID**: ES-PURCHASE-001
**대상**: 운영팀 / 백엔드 개발자

---

## 이중 상품권 발행 발생 시 조치

### 감지 조건
- 고객센터 "상품권이 두 개 생성됐다" 문의
- `purchase_transactions` 동일 `purchase_request_id` 2건 이상 `status=completed`

### 조치 절차

1. 중복 건 조회
   ```sql
   SELECT id, voucher_id, status, created_at
   FROM purchase_transactions
   WHERE purchase_request_id = '<문제_requestId>'
   ORDER BY created_at;
   ```

2. 후발 상품권 비활성화 (잔액 = 액면가 = 미사용 확인 필수)
   ```sql
   -- 사용 여부 확인 먼저
   SELECT id, balance, face_amount, status FROM vouchers WHERE id = '<후발_voucherId>';
   -- 미사용 확인 후
   UPDATE vouchers SET status = 'REFUNDED' WHERE id = '<후발_voucherId>';
   ```

3. 환불 처리 (결제 게이트웨이 취소)
   - 후발 구매 건의 결제 취소 API 호출

4. 인시던트 기록
   ```
   incident_id: INC-{YYYYMMDD}-{SEQ}
   type: DUPLICATE_PURCHASE
   purchase_request_id, voucher_ids, resolution
   ```

### SLA
- 이중 발행 감지 후 조치: 4시간 이내
