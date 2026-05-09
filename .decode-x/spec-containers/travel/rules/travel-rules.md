# Spec Container — TRAVEL-001 (여행 산업 합성 도메인)

**Skill ID**: TRAVEL-001
**Domain**: Travel (여행 산업 — 항공예약/운임업그레이드/여정확정/상태전환/결항배치/취소환불)
**Source**: SYNTHETIC — Sprint 291 F457, withRuleId 재사용 21번째 도메인 PoC (Hospitality 다음 산업, 10번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (TR-001 ~ TR-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| TR-001 | 항공 예약 요청 시 | `seatsRequested ≤ availableSeats` AND `seatsRequested > 0` | `itineraries` INSERT (status='pending') | `E422-ST-MAX`, `E422-ST-MIN`, `E422-ST-AVAIL` |
| TR-002 | 운임 등급 업그레이드 요청 시 | `availableMiles ≥ requiredMilesLimit` | `fare_class` UPDATE + miles 차감 | `E404-IT`, `E409-IT`, `E422-MILES` |
| TR-003 | 여정 확정 처리 시 | `itinerary.status='pending'` AND 결제 금액 유효 | atomic: `itineraries.status='confirmed'` + PNR 발급 + `trips` INSERT | `E404-IT`, `E409-IT` |
| TR-004 | 여행 상태 전환 (pending → confirmed → checked_in → completed) | 허용 매트릭스 충족 | `trips.status` UPDATE | `E404-TR`, `E409-TR` |
| TR-005 | 결항 여행 일괄 취소 처리 (시스템 배치) | `trips.status IN ('pending','confirmed')` AND flight cancelled | `trips.status='cancelled'` 일괄 UPDATE + `disruption_log` INSERT | 대상 없으면 markedCount=0 |
| TR-006 | 취소 환불 + 마일리지 복구 트랜잭션 | `itinerary.status IN ('pending','confirmed')` | atomic: `itineraries.status='cancelled'` + `refund_log` INSERT | `E404-IT`, `E409-IT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `itineraries` | INSERT (TR-001) / fare_class UPDATE (TR-002) / status 전환 (TR-003/006) | bookFlight / upgradeFareClass / confirmItinerary / processCancellationRefund |
| `trips` | INSERT (TR-003) / status 전환 (TR-004/005) | confirmItinerary / transitionTripStatus / markDisruptedTrips |
| `disruption_log` | INSERT (TR-005) | markDisruptedTrips |
| `refund_log` | INSERT (TR-006) | processCancellationRefund |

---

## 임계값 / 상수

- `MAX_SEATS_PER_BOOKING = 9` (TR-001 1회 최대 좌석 수)
- `FARE_UPGRADE_MILES_LIMIT = 100000` (TR-002 업그레이드 마일리지 상한)

---

## 상태 머신

```
itinerary: [bookFlight] → pending
itinerary: pending → confirmed (TR-003 여정 확정)
itinerary: confirmed → cancelled (TR-006 취소 환불)
itinerary: pending → cancelled (TR-006)

trip: [confirmItinerary] → pending
trip: pending → confirmed (TR-004)
trip: confirmed → checked_in (TR-004)
trip: checked_in → completed (TR-004)
trip: pending/confirmed → cancelled (TR-005 batch)
```

---

## 권한

- **bookFlight**: 승객 또는 여행사
- **upgradeFareClass**: 승객
- **confirmItinerary**: 승객 또는 여행사
- **transitionTripStatus**: 항공사 SYSTEM
- **markDisruptedTrips**: 항공사 SYSTEM (결항 감지)
- **processCancellationRefund**: 승객 또는 여행사

---

## 관련 문서

- `rules/TR-001.md` ~ `rules/TR-006.md` — 개별 BL detail
- `runbooks/TR-001.md` ~ `runbooks/TR-006.md` — operational runbooks
- `tests/TR-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/travel.ts` — 합성 source
