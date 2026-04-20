# ES-REFUND-001: rfndPsbltyYn 판정 오류 — 운영 가이드

**Empty Slot ID**: ES-REFUND-001
**대상**: 운영팀 / 백엔드 개발자

---

## rfndPsbltyYn 불일치 발생 시 수동 조치

### 감지 조건
- 고객 CS: 환불 가능한데 거부됨 또는 환불 불가한데 허용됨

### 조치 절차

1. 실제 판정 기준 확인
   ```sql
   SELECT v.id, v.type, v.status, v.expiredAt, v.balance,
          r.status as refundStatus
   FROM vouchers v
   LEFT JOIN refund_transactions r ON r.voucher_id = v.id
   WHERE v.id = '<voucherId>';
   ```

2. ES-REFUND-001 우선순위 규칙과 대조하여 올바른 판정값 확인

3. 잘못된 판정으로 환불 거부된 경우: ADMIN 권한으로 수동 환불 신청 처리
   ```
   POST /api/v1/admin/refunds/force
   { voucherId: "<id>", reason: "SYSTEM_MISJUDGMENT", approvedBy: "<adminId>" }
   ```

4. 판정 로직 버그 여부 확인 → Jira 이슈 등록
