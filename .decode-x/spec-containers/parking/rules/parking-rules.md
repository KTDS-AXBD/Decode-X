# Spec Container — PKG-001 (주차 관리 합성 도메인)

**Skill ID**: PKG-001
**Domain**: Parking (주차 관리 산업 — 슬롯정원/월회원한도/입차atomic/예약상태전환/무단출차배치/운영자정산atomic)
**Source**: SYNTHETIC — 세션 296 F494, withRuleId 재사용 47번째 도메인 PoC (Gym 다음 산업, 36번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (PK-001 ~ PK-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| PK-001 | 슬롯 예약 요청 시 | `lot.occupied_slots < total_slots` (UPPERCASE fallback MAX_PARKING_SLOTS) | 예약 허용 + lot.occupied_slots 증가 | `E422-LOT-CAPACITY-EXCEEDED` (주차장 정원 초과) |
| PK-002 | 월회원 슬롯 사용 요청 시 | `pass.slot_used < slotLimit` (var-vs-var, `limit` keyword 매칭) | 슬롯 사용 허용 + slot_used 증가 | `E422-PASS-LIMIT-EXCEEDED` (월회원 한도 초과) |
| PK-003 | 입차 atomic 요청 시 | `slot_reservations.status = 'confirmed'` | atomic: parking_sessions INSERT + slot_reservations UPDATE + parking_payments INSERT | `E404-RESERVATION` |
| PK-004 | 예약 상태 전환 (pending → confirmed → checked_in → completed → cancelled) | 허용 매트릭스 충족 | `slot_reservations.status` UPDATE | `E404-RESERVATION`, `E409-RESERVATION` |
| PK-005 | 무단 출차 일괄 처리 | `parking_sessions.status = 'active'` AND `entered_at <= now` | `status='unauthorized'` 일괄 UPDATE | 대상 없으면 unauthorizedCount=0 |
| PK-006 | 운영자 정산 요청 시 | `parking_sessions.status = 'completed'` | atomic: operator_billing_records INSERT + operator_payouts INSERT + operator_billing_records UPDATE | `E404-COMPLETED-PARKING-SESSION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `lots` | occupied_slots 증가 (PK-001) | reserveParkingSlot |
| `slot_reservations` | INSERT (PK-001), status 갱신 (PK-003/PK-004) | reserveParkingSlot / confirmEntry / transitionReservationStatus |
| `monthly_passes` | slot_used 증가 (PK-002) | applyMonthlyPassLimit |
| `parking_sessions` | INSERT (PK-003), batch unauthorized (PK-005) | confirmEntry / markUnauthorizedExitBatch |
| `parking_payments` | INSERT (PK-003) | confirmEntry |
| `operator_billing_records` | INSERT + status='settled' (PK-006) | processOperatorBilling |
| `operator_payouts` | INSERT (PK-006) | processOperatorBilling |

---

## 임계값 / 상수

- `MAX_PARKING_SLOTS = 500` (PK-001 주차장 슬롯 정원 기본 한도, 대)
- `slotLimit = monthly_passes.slot_limit` (PK-002 월회원 등급별 슬롯 한도)

---

## 상태 머신

```
slot_reservations: pending → confirmed (PK-004 transition)
slot_reservations: confirmed → checked_in (PK-003 atomic)
slot_reservations: checked_in → completed (PK-004 transition)
slot_reservations: pending|confirmed → cancelled (PK-004 transition)

parking_sessions: active → completed (정상 출차)
parking_sessions: active → unauthorized (PK-005 batch)

operator_billing_records: pending → calculated → settled (PK-006 atomic)
```

---

## 의존 함수 (parking.ts)

| BL | 함수 | detector |
|----|------|----------|
| PK-001 | `reserveParkingSlot` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| PK-002 | `applyMonthlyPassLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| PK-003 | `confirmEntry` | AtomicTransaction (`db.transaction(...)`) |
| PK-004 | `transitionReservationStatus` | StatusTransition (matrix) |
| PK-005 | `markUnauthorizedExitBatch` | StatusTransition (batch) |
| PK-006 | `processOperatorBilling` | AtomicTransaction (`db.transaction(...)`) |
