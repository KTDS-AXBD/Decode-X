# ES-CHARGE-003: 충전 한도 초과 시 분할 충전 가이드

**Empty Slot ID**: ES-CHARGE-003
**유형**: E5 (Tacit — 암묵적 운영 관행)
**우선순위**: High
**Sprint**: 2 (Fill 완성)

---

## 빈 슬롯 설명

BL-005("충전 요청 금액 ≤ 충전 가능 한도 → 진행, 초과 → 거부")는 거부만 정의하며,
이용자에게 분할 충전 방법을 안내하는 규칙이 없다.
현재 운영팀이 암묵적으로 고객 문의 시 구두로 안내하는 관행이 있다.

**위험**: 한도 초과 시 단순 거부 → 이용자 혼란 → CS 콜 증가 → 운영 비용.

---

## 규칙 정의

### condition (When)
이용자의 충전 요청 금액이 일일/월간 충전 한도를 초과한 경우.

### criteria (If)
```
잔여 한도 = 한도 - 오늘 충전 누계
잔여 한도 > 0  → 분할 충전 가능
잔여 한도 ≤ 0  → 오늘 충전 불가 (한도 소진)
```

### outcome (Then)
거부 응답에 분할 충전 안내 포함:
```json
{
  "error": "CHARGE_LIMIT_EXCEEDED",
  "availableAmount": 200000,
  "requestedAmount": 500000,
  "limitResetAt": "2026-04-20T00:00:00+09:00",
  "message": "오늘 충전 가능한 금액은 200,000원입니다. 분할 충전을 이용하시거나 내일 다시 시도해 주세요.",
  "splitChargeAllowed": true
}
```

### exception (Else)
잔여 한도 ≤ 0이면:
```json
{
  "error": "CHARGE_LIMIT_EXHAUSTED",
  "availableAmount": 0,
  "limitResetAt": "2026-04-20T00:00:00+09:00",
  "message": "오늘 충전 한도가 모두 소진되었습니다. 내일 00:00 이후 다시 충전할 수 있습니다.",
  "splitChargeAllowed": false
}
```

---

## 분할 충전 흐름

```
이용자 요청: 50만원 충전
         ↓
한도 확인: 잔여 20만원
         ↓
응답: "20만원 분할 충전 가능"
         ↓
이용자 확인: YES → 20만원으로 충전 진행
            NO  → 취소
```

## 구현 힌트

- `limit_reset_at` = 다음 날 00:00 KST (한도 초기화 시각)
- 잔여 한도 조회: `charge_limits` 테이블 또는 캐시 (KV)
- UI: 분할 충전 확인 팝업 제공 (명시적 동의 필수)
