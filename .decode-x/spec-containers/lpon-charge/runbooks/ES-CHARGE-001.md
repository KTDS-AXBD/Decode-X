# ES-CHARGE-001: 충전 멱등성 — 운영 가이드

**Empty Slot ID**: ES-CHARGE-001
**대상**: 운영팀 / 백엔드 개발자

---

## 이중 충전 발생 시 수동 조치

### 감지 조건
- 고객센터 이중 출금 민원
- 모니터링 `ChargeCompleted` 이벤트 동일 `chargeRequestId`로 2건 이상 감지

### 조치 절차

1. `charge_transactions`에서 동일 `chargeRequestId` 건 조회
   ```sql
   SELECT chargeId, status, amount, createdAt
   FROM charge_transactions
   WHERE chargeRequestId = '<민원_requestId>'
   ORDER BY createdAt;
   ```

2. 두 건 모두 `completed` 상태이면 → 후발 건 취소
   - `POST /money/chargeCancel` with `{chargeId: "<후발_chargeId>", reason: "DUPLICATE_CHARGE"}`

3. 이용자 잔액 차이 확인
   - 실제 잔액 = 예상 잔액 → 정상
   - 불일치 시 수기 조정 (잔액 차감 또는 환불)

4. 인시던트 로그 기록
   ```
   incident_id: INC-{YYYYMMDD}-{SEQ}
   type: DUPLICATE_CHARGE
   chargeRequestId: <값>
   chargeIds: [<원본>, <중복>]
   resolution: <취소|조정|정상>
   ```

---

## 예방 조치 (개발팀)

- 모든 충전 API 호출에 `X-Request-Id` 헤더 필수 (클라이언트 생성 UUID)
- `charge_transactions.chargeRequestId` 컬럼 유니크 인덱스 적용
- 재시도 로직: `status=processing` → 409 → 10초 대기 → 재조회

---

## SLA
- 이중 충전 감지 후 취소까지: 4시간 이내
- 잔액 조정 완료: 24시간 이내
