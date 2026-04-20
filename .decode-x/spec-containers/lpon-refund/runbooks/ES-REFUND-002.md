# ES-REFUND-002: 캐시백 환불불가 — 운영 가이드

**Empty Slot ID**: ES-REFUND-002
**대상**: 운영팀 / CS팀

---

## 캐시백 환불 불가 민원 처리

### 감지 조건
- CS 채널: "캐시백 상품권 현금 환불 요청"

### 대응 스크립트

1. 사유 안내:
   "캐시백/할인보전 상품권은 현금 환불이 불가하며, 포인트로 전환하실 수 있습니다."

2. 포인트 전환 안내:
   "통합 포인트로 전환하시면 온누리상품권 앱에서 사용하실 수 있습니다. 전환 후 1년간 유효합니다."

3. 강성 민원 시:
   - ES-REFUND-004 강제환불 절차 검토 (권한 있는 ADMIN만 처리 가능)
   - 강제환불 조건(만료 1년 이내, 연간 한도 3건) 확인

### 포인트 전환 수동 처리
```sql
-- 대상 확인
SELECT id, type, balance FROM vouchers WHERE id = '<voucherId>' AND type IN ('CASHBACK', 'DISCOUNT');

-- 포인트 이관 (ADMIN 권한)
CALL sp_convert_voucher_to_points('<voucherId>', '<adminId>');
```
