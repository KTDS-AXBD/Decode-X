# ES-PAYMENT-002: CARD 카드사 승인 실패 재시도 정책

**Empty Slot ID**: ES-PAYMENT-002
**유형**: E4 (Exception Handling)
**우선순위**: High
**Sprint**: 214b

---

## 빈 슬롯 설명

BL-016("결제취소 요청 시 카드사에 취소 요청 전달")에서 실패 시 재시도에 대한 언급은 있으나,
최초 결제(CardApi.authorize) 실패 시 재시도 횟수, 간격, 최종 실패 처리가 정의되어 있지 않다.

**위험**: 카드사 일시 장애 → 재시도 없이 즉시 실패 → 사용자 결제 불가 경험 + 잔액은 이미 차감 시도.

---

## 규칙 정의

### condition (When)
method=CARD 결제에서 `CardApi.authorize()` 호출이 503/504/timeout으로 실패한 경우.

### criteria (If)
| 기준 | 조건 |
|------|------|
| 네트워크 오류 (재시도 대상) | HTTP 503, 504, connection timeout |
| 즉시 실패 (재시도 불가) | HTTP 400, 401, 402 (잔액부족, 카드한도 등) |

### outcome (Then)
재시도 대상이면:
- 최대 3회 재시도 (지수 백오프: 0.5s → 1s → 2s)
- 3회 후에도 실패 시: `payments` INSERT with `status='CARD_AUTH_FAILED'`
- 응답 HTTP 502 + `CARD_AUTHORIZATION_FAILED` 에러 코드
- 잔액 차감(`vouchers.balance -=`) 없음

재시도 불가이면:
- 즉시 HTTP 402 + 카드사 에러 코드 전달 (e.g., `CARD_LIMIT_EXCEEDED`)

### exception (Else)
HTTP 200 카드 승인 성공 → 정상 결제 흐름 진행.

---

## 재시도 타임라인

```
T+0ms   CardApi.authorize() 호출
T+500ms 1차 재시도 (503/504/timeout 시)
T+1500ms 2차 재시도
T+3500ms 3차 재시도
T+3500ms+ 최종 실패 → status='CARD_AUTH_FAILED', HTTP 502
```
