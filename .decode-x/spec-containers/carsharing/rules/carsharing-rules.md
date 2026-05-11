# Spec Container — CSG-001 (카쉐어링 합성 도메인)

**Skill ID**: CSG-001
**Domain**: Car Sharing (카쉐어링 산업 — fleet정원/거리한도/픽업atomic/예약상태전환/연체배치/운영자정산atomic)
**Source**: SYNTHETIC — 세션 297 F500, withRuleId 재사용 48번째 도메인 PoC (Parking 다음 산업, 37번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (CS-001 ~ CS-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| CS-001 | 차량 예약 요청 시 | `pool.active_vehicles < total_vehicles` (UPPERCASE fallback MAX_FLEET_VEHICLES) | 예약 허용 + pool.active_vehicles 증가 | `E422-FLEET-CAPACITY-EXCEEDED` (fleet 정원 초과) |
| CS-002 | 거리 사용 요청 시 | `pass.distance_used + distance < distanceLimit` (var-vs-var, `limit` keyword 매칭) | 거리 사용 허용 + distance_used 증가 | `E422-DISTANCE-LIMIT-EXCEEDED` (거리 한도 초과) |
| CS-003 | 차량 픽업 atomic 요청 시 | `vehicle_reservations.status = 'confirmed'` | atomic: rental_sessions INSERT + vehicle_reservations UPDATE + rental_payments INSERT | `E404-RESERVATION` |
| CS-004 | 예약 상태 전환 (pending → confirmed → picked_up → returned → cancelled) | 허용 매트릭스 충족 | `vehicle_reservations.status` UPDATE | `E404-RESERVATION`, `E409-RESERVATION` |
| CS-005 | 연체 반납 일괄 처리 | `rental_sessions.status = 'active'` AND `picked_up_at <= now` | `status='overdue'` 일괄 UPDATE | 대상 없으면 overdueCount=0 |
| CS-006 | 운영자 정산 요청 시 | `rental_sessions.status = 'returned'` | atomic: operator_billing_records INSERT + operator_payouts INSERT + operator_billing_records UPDATE | `E404-RETURNED-RENTAL-SESSION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `vehicle_pool` | active_vehicles 증가 (CS-001) | reserveSharingVehicle |
| `vehicle_reservations` | INSERT (CS-001), status 갱신 (CS-003/CS-004) | reserveSharingVehicle / confirmPickup / transitionRentalStatus |
| `member_passes` | distance_used 증가 (CS-002) | applyDistanceLimit |
| `rental_sessions` | INSERT (CS-003), batch overdue (CS-005) | confirmPickup / markOverdueReturnBatch |
| `rental_payments` | INSERT (CS-003) | confirmPickup |
| `operator_billing_records` | INSERT + status='settled' (CS-006) | processOperatorBilling |
| `operator_payouts` | INSERT (CS-006) | processOperatorBilling |

---

## 임계값 / 상수

- `MAX_FLEET_VEHICLES = 200` (CS-001 카쉐어링 fleet 차량 정원 기본 한도, 대)
- `distanceLimit = member_passes.distance_limit` (CS-002 회원 등급별 거리 한도, km)

---

## 상태 머신

```
vehicle_reservations: pending → confirmed (CS-004 transition)
vehicle_reservations: confirmed → picked_up (CS-003 atomic)
vehicle_reservations: picked_up → returned (CS-004 transition)
vehicle_reservations: pending|confirmed → cancelled (CS-004 transition)

rental_sessions: active → returned (정상 반납)
rental_sessions: active → overdue (CS-005 batch)

operator_billing_records: pending → calculated → settled (CS-006 atomic)
```

---

## 의존 함수 (carsharing.ts)

| BL | 함수 | detector |
|----|------|----------|
| CS-001 | `reserveSharingVehicle` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| CS-002 | `applyDistanceLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| CS-003 | `confirmPickup` | AtomicTransaction (`db.transaction(...)`) |
| CS-004 | `transitionRentalStatus` | StatusTransition (matrix) |
| CS-005 | `markOverdueReturnBatch` | StatusTransition (batch) |
| CS-006 | `processOperatorBilling` | AtomicTransaction (`db.transaction(...)`) |
