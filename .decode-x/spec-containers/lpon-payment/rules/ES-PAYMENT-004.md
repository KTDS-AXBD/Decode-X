# ES-PAYMENT-004: SMS 발송 실패 비즈니스 영향 정의

**Empty Slot ID**: ES-PAYMENT-004
**유형**: E2 (Non-Critical Exception)
**우선순위**: Medium
**Sprint**: 214b

---

## 빈 슬롯 설명

BL-015("결제금액 ≥ 50,000원 시 SMS 발송")에서 SMS 발송 실패 시 결제 전체를 롤백할지,
또는 결제는 성공으로 처리하고 SMS만 재발송할지 정의되어 있지 않다.

**위험**: SMS 발송 외부 서비스 장애 → 결제 전체 실패로 처리 시 사용자 피해.

---

## 규칙 정의

### condition (When)
결제 금액 ≥ 50,000원, 결제(PAID) 처리 완료 후 `NotificationService.sendPaymentSms()` 실패.

### criteria (If)
`sendPaymentSms()` throws 또는 타임아웃(3초 초과).

### outcome (Then)
결제 자체는 성공으로 유지:
- `payments.status = 'PAID'` 그대로 유지
- `vouchers.balance -= amount` 차감 유지
- SMS 발송 실패 로그 기록: `payment_notifications.status = 'FAILED'`
- 재발송 스케줄링: 5분 후 1회 재시도
- 응답은 HTTP 200 성공 (SMS 실패 여부 미노출)

재발송도 실패 시:
- `payment_notifications.status = 'DELIVERY_FAILED'`
- 운영 알림 (Slack/이메일, P3 우선순위)

### exception (Else)
결제 금액 < 50,000원 → SMS 발송 대상 아님, 이 규칙 적용 안 됨.

---

## 설계 근거

SMS는 부가 서비스이며 결제 원장의 신뢰성이 더 중요하다.
SMS 장애로 인한 결제 롤백은 과도한 비즈니스 영향을 초래한다.
이는 별-fire 패턴(best-effort notification)에 해당한다.
