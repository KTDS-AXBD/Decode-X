# ES-REFUND-004: 강제환불 권한 및 감사 로그

**Empty Slot ID**: ES-REFUND-004
**유형**: E4 (Exception Handling / Compliance)
**우선순위**: High
**Sprint**: 214b

---

## 빈 슬롯 설명

BL-029("유효기간 만료 상품권 → 강제환불 기능 활용")에서 강제환불의
적용 조건, 승인 권한, 감사 로그 기록 방식이 정의되어 있지 않다.

**위험**: 강제환불 남용 → 재무 손실 + 규정 위반 + 감사 불가.

---

## 규칙 정의

### condition (When)
`voucher.expiredAt < now()` 이고 사용자가 환불을 강력히 요구하는 경우 (강성 민원).

### criteria (If)
강제환불 허용 조건 (ALL 충족 필요):
1. ADMIN 계정의 `forcedRefundApproval = true` 권한 보유
2. 강제환불 사유 코드 (`FORCED_REFUND_REASON`) 기재 필수
3. 만료일 기준 최대 1년 이내 (만료 1년 초과 → 강제환불 불가)
4. 1인당 연간 강제환불 한도: 3건

### outcome (Then)
강제환불 처리:
1. `refund_transactions` INSERT with `forceRefund = true`
2. 강제환불 감사 로그 기록:
   ```json
   {
     "auditType": "FORCED_REFUND",
     "refundId": "<uuid>",
     "voucherId": "<uuid>",
     "approvedBy": "<adminId>",
     "reason": "<FORCED_REFUND_REASON>",
     "expiredAt": "<만료일>",
     "processedAt": "<처리일>",
     "amount": <환불금액>
   }
   ```
3. 관리자 이메일 알림 (`refund.admin@lpon.co.kr`)
4. 월간 강제환불 집계 보고서에 포함

### exception (Else)
권한 없는 ADMIN → HTTP 403 + `FORCED_REFUND_NOT_AUTHORIZED`
한도 초과 → HTTP 422 + `FORCED_REFUND_ANNUAL_LIMIT_EXCEEDED`
만료 1년 초과 → HTTP 422 + `FORCED_REFUND_EXPIRED_BEYOND_LIMIT`

---

## 감사 보존 정책

강제환불 감사 로그는 5년 보존 (금융감독원 규정).
`force_refund_audit_logs` 테이블, 분기별 외부 감사 시 제출 가능 형식 유지.
