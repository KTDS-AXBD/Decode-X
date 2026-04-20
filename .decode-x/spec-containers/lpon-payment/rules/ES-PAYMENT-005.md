# ES-PAYMENT-005: 탈퇴 회원 결제취소 AP06 API 실패 처리

**Empty Slot ID**: ES-PAYMENT-005
**유형**: E4 (Exception Handling)
**우선순위**: High
**Sprint**: 214b

---

## 빈 슬롯 설명

BL-019("탈퇴 회원 결제/매입 취소 시 AP06 API 처리")에서 AP06 API 실패 시
"수기처리"라고만 명시되어 있고, 수기처리의 기준, 담당자, SLA, 재시도 여부가 정의되어 있지 않다.

**위험**: AP06 API 장애 → 탈퇴회원 취소 처리 불가 → 무기한 미처리 방치 위험.

---

## 규칙 정의

### condition (When)
탈퇴 회원에 대한 결제취소 요청에서 AP06 API 호출이 실패한 경우.

### criteria (If)
`ap06Client.cancelPayment()` → HTTP 4xx/5xx/timeout.

### outcome (Then)
1. `cancel_transactions` INSERT with `status='AP06_FAILED'`
2. 에스컬레이션 티켓 생성:
   - `incident_type: WITHDRAW_MEMBER_CANCEL_AP06_FAILED`
   - `priority: P2` (4시간 SLA)
   - payload: `{paymentId, userId, amount, ap06Error, requestedAt}`
3. 운영팀 수기처리 큐에 등록
4. API 응답: HTTP 202 Accepted + `status: 'PENDING_MANUAL'`
   - 취소 결과는 비동기 callback 또는 수기 처리 완료 후 상태 업데이트

재시도 정책:
- 자동 재시도 1회 (2분 후, 네트워크 오류 한정)
- 2회 실패 시 에스컬레이션으로 즉시 전환

### exception (Else)
일반 회원 결제취소 → 이 규칙 적용 안 됨 (BL-014 표준 흐름 사용).

---

## 수기처리 체크리스트 (운영팀 용)

1. `cancel_transactions` WHERE `status='AP06_FAILED'` 조회
2. AP06 API 장애 여부 확인 (AP06 상태 페이지)
3. 장애 해소 시: 수동으로 `ap06Client.cancelPayment()` 재호출
4. 성공 시: `cancel_transactions.status = 'COMPLETED'` 수동 업데이트
5. 인시던트 로그 기록 (`MANUAL_AP06_CANCEL_INC-{DATE}-{SEQ}`)
