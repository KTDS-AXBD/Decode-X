# Spec Container — AVIATION-001 (항공 산업 합성 도메인)

**Skill ID**: AVIATION-001
**Domain**: Aviation (항공 산업 — 탑승한도/연료한도/운항atomic/비행상태전환/승무원배치/수하물atomic)
**Source**: SYNTHETIC — Sprint 304 F470, withRuleId 재사용 34번째 도메인 PoC (Public Transport 다음 산업, 23번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (AV-001 ~ AV-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| AV-001 | 승객 탑승 요청 시 | `passengerCount < MAX_PASSENGER_CAPACITY` (UPPERCASE 상수, 400명) AND flight.status='boarding' | 탑승 허용 + passengers INSERT | `E422-CAPACITY-LIMIT` (탑승 한도 초과) |
| AV-002 | 연료 할당 시 | `requiredFuel <= fuelQuotaLimit` (var-vs-var, `limit` keyword 매칭) | 연료 허용 + fuel_allocations INSERT | `E422-FUEL-EXCEEDED` (연료 한도 초과) |
| AV-003 | 비행 운항 dispatch 시 | `flight.status = 'boarding'` | atomic: `dispatch_records` INSERT + `flight_clearances` INSERT + `flights.status` 갱신 + `crew_schedules.status` 갱신 | `E404-FLIGHT`, `E409-FLIGHT` |
| AV-004 | 비행 상태 전환 (scheduled → boarding → departed → in_flight → landed → completed) | 허용 매트릭스 충족 | `flights.status` UPDATE + 타임스탬프 기록 | `E404-FLIGHT`, `E409-FLIGHT` |
| AV-005 | 승무원 일괄 교대 (배치) | `crew_schedules.assigned_at <= rotationBefore` AND `status = 'on_duty'` AND `rotation_due = 1` | `status='rotated', rotated_at=NOW()` 일괄 UPDATE | 대상 없으면 rotatedCount=0 |
| AV-006 | 수하물 클레임 처리 시 | `baggage.damage_status != 'intact'` | atomic: `baggage_claims` INSERT + `damage_assessments` INSERT + `compensation_records` INSERT + `baggage_claim_filed` UPDATE | `E404-BAGGAGE`, `E409-BAGGAGE` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `passengers` | INSERT (AV-001) | boardPassenger |
| `flights` | current_passengers 갱신 / status 전환 / 타임스탬프 (AV-001/AV-003/AV-004) | boardPassenger / dispatchFlight / transitionFlightStatus |
| `fuel_allocations` | INSERT (AV-002) | allocateFuel |
| `dispatch_records` | INSERT (AV-003) | dispatchFlight |
| `flight_clearances` | INSERT (AV-003) | dispatchFlight |
| `crew_schedules` | status='on_duty' 갱신 / status='rotated' 일괄 갱신 (AV-003/AV-005) | dispatchFlight / rotateCrewSchedule |
| `baggage_claims` | INSERT (AV-006) | processBaggageClaim |
| `damage_assessments` | INSERT (AV-006) | processBaggageClaim |
| `compensation_records` | INSERT (AV-006) | processBaggageClaim |

---

## 임계값 / 상수

- `MAX_PASSENGER_CAPACITY = 400` (AV-001 최대 항공기 탑승 한도, 승객 수)
- `fuelQuotaLimit = 25000/80000/8000/2500` (AV-002 항공기 종류별 최대 연료 할당, kg — narrow_body/wide_body/regional/turboprop)

---

## 상태 머신

```
flights: scheduled → boarding (AV-004 transition)
flights: boarding → departed (AV-004 transition)
flights: departed → in_flight (AV-004 transition)
flights: in_flight → landed (AV-004 transition)
flights: landed → completed (AV-004 transition)

crew_schedules: [assigned] → on_duty (AV-003 dispatch)
crew_schedules: [on_duty] rotation_due=1 → rotated (AV-005 batch)

dispatch_records: [created] — AV-003 atomic 생성 (불변)
flight_clearances: [created] — AV-003 atomic 생성 (status='approved')

baggage_claims: [created] — AV-006 atomic 생성 (status='compensated')
damage_assessments: [created] — AV-006 atomic 생성 (불변)
compensation_records: [created] — AV-006 atomic 생성 (불변)
```

---

## 권한

- **boardPassenger**: 탑승관리 SYSTEM / 지상운영요원
- **allocateFuel**: 연료관리 SYSTEM
- **dispatchFlight**: 운항관리 SYSTEM (captain 필수)
- **transitionFlightStatus**: 비행관리 SYSTEM
- **rotateCrewSchedule**: 승무원관리 SYSTEM (배치)
- **processBaggageClaim**: 고객서비스 / 수하물처리 SYSTEM

---

## 관련 문서

- `rules/AV-001.md` ~ `rules/AV-006.md` — 개별 BL detail
- `runbooks/AV-001.md` ~ `runbooks/AV-006.md` — operational runbooks
- `tests/AV-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/aviation.ts` — 합성 source
