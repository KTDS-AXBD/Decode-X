# Wedding Hall 합성 비즈니스 룰 — WB-001~WB-006

**도메인**: WB Wedding hall (예식장 산업, 73번째 신규 산업)
**Sprint**: 381 | **F-item**: F553 | **Session**: 세션 309

---

## WB-001: 예식장 동시 active ceremony 한도 검증

**Rule**: 예식장별 동시 active ceremony 수가 `MAX_CONCURRENT_CEREMONIES_PER_HALL`을 초과하면 신규 예약 불가.

```
IF wedding_halls.active_ceremonies >= MAX_CONCURRENT_CEREMONIES_PER_HALL
THEN throw WeddingHallError(E422-HALL-CEREMONY-LIMIT-EXCEEDED)
```

- ThresholdCheck (Path A: var-vs-UPPERCASE constant)
- MAX_CONCURRENT_CEREMONIES_PER_HALL = 3 (예식장 홀 수 제한)

---

## WB-002: 회원 hall 예약 한도 검증

**Rule**: 회원의 당일 hall 예약 사용량이 멤버십 한도(`hallLimit`)를 초과하면 추가 예약 불가.

```
IF hall_memberships.hall_used + halls >= hallLimit
THEN throw WeddingHallError(E422-HALL-LIMIT-EXCEEDED)
```

- ThresholdCheck (Path B: var-vs-var, `hallLimit` keyword)
- 멤버십 유형별 한도: standard=1, premium=2, vip=3

---

## WB-003: 예식 예약 atomic 트랜잭션

**Rule**: 예식 예약 시 hall_schedules + wedding_ceremonies + ceremony_payments를 단일 트랜잭션으로 처리.

```
BEGIN TRANSACTION
  INSERT INTO hall_schedules (schedule_id, hall_id, ceremony_id, slot_time, guest_count, ceremony_type)
  UPDATE wedding_ceremonies SET status='ongoing', schedule_id=?, payment_id=? WHERE id=?
  INSERT INTO ceremony_payments (payment_id, ceremony_id, schedule_id, amount, status='paid')
COMMIT
```

- AtomicTransaction detector
- reserved 상태 ceremony만 예약 가능

---

## WB-004: 예식 상태 전환 규칙

**Rule**: ceremony 상태 전환은 정의된 경로만 허용.

```
허용 전환:
  reserved → ongoing      (예식 시작)
  ongoing  → ended        (예식 정상 완료)
  ongoing  → closed       (예식 조기 종료)
  reserved → cancelled    (예약 취소)
  ongoing  → cancelled    (진행 중 취소)

금지 전환: 그 외 모든 경우 → E409-CEREMONY
```

- StatusTransition detector

---

## WB-005: closed ceremony 일괄 만료 처리

**Rule**: status='closed'이고 scheduled_at이 현재 시각 이전인 ceremony를 일괄 'ended'로 전환.

```
UPDATE wedding_ceremonies
SET status = 'ended'
WHERE status = 'closed' AND scheduled_at <= NOW()
```

- StatusTransition detector (batch 패턴)
- SF-005/KP-005/.../CV-005 73번째 도메인 동일 패턴 재사용

---

## WB-006: 예식 환불 atomic 트랜잭션 (강한 계약금/위약금 모델)

**Rule**: 취소된 예식 환불 시 위약금 계산 + cancelled_fee_records + ceremony_refunds를 단일 트랜잭션으로 처리.

```
cancellation_amount = ceremony_cost × cancellation_rate

BEGIN TRANSACTION
  INSERT INTO cancelled_fee_records (fee_record_id, member_id, ceremony_id, ceremony_cost, cancellation_rate, cancellation_amount, status='calculated')
  INSERT INTO ceremony_refunds (refund_id, fee_record_id, member_id, amount, status='refunded')
  UPDATE cancelled_fee_records SET status='refunded' WHERE id=fee_record_id
COMMIT
```

- AtomicTransaction detector
- cancelled 상태 ceremony만 환불 가능
- 강한 계약금/위약금: 취소 시점별 차등 비율 적용 (예식 30일 전 10%, 7일 전 50%, 당일 100%)
