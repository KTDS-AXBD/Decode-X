# ES-REFUND-003: 환불계좌 오류 재처리 플로우

**Empty Slot ID**: ES-REFUND-003
**유형**: E4 (Exception Handling)
**우선순위**: High
**Sprint**: 214b

---

## 빈 슬롯 설명

BL-027("계좌 오류로 환불 실패 시 재등록 또는 고객센터 수기 접수")에서
재등록 후 자동 재처리 여부, 재처리 기간 제한, CS 수기 접수 이후 처리 흐름이 정의되어 있지 않다.

**위험**: 환불계좌 오류 → 환불 실패 → 재처리 기준 없음 → 금액 소멸 또는 무기한 대기.

---

## 규칙 정의

### condition (When)
`DepositApi.requestDeposit()` 호출 실패 — 특히 `accountId` 오류 (계좌번호 불일치, 해지 계좌 등).

### criteria (If)
에러 코드가 `ACCOUNT_NOT_FOUND` 또는 `ACCOUNT_CLOSED` 또는 `ACCOUNT_FROZEN`.

### outcome (Then)
1. `refund_transactions.status = 'DEPOSIT_ACCOUNT_ERROR'`
2. 사용자에게 알림: "환불 계좌 오류로 입금이 실패했습니다. 환불 계좌를 재등록해 주세요."
3. 재등록 링크 제공: `PUT /api/v1/users/refund-account`

재등록 완료 시:
- 7일 이내 자동 재처리 스케줄링
- 7일 초과 시: `refund_transactions.status = 'EXPIRED_ACCOUNT_ERROR'` → CS 수기 접수 큐

CS 수기 접수 이후:
- CS 담당자가 수동으로 입금 처리 후 `refund_transactions.status = 'COMPLETED'` 업데이트
- SLA: P2 (4시간)

### exception (Else)
계좌 오류가 아닌 입금 API 장애 → ES-REFUND-003 적용 안 됨 (ES-REFUND-001의 BL-023 경로).

---

## 계좌 재등록 자동 재처리 타임라인

```
입금 실패 → status='DEPOSIT_ACCOUNT_ERROR'
  │
  └─→ 사용자 알림 발송 (앱 푸시 + SMS)
      │
      └─→ 7일 대기
          ├─ 재등록 완료 → 자동 재처리 → 성공 시 COMPLETED
          └─ 7일 초과 미등록 → EXPIRED_ACCOUNT_ERROR → CS 수기 접수
```
