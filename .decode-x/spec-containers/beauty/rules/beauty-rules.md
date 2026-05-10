# Spec Container — BEAUTY-001 (미용실 합성 도메인)

**Skill ID**: BEAUTY-001
**Domain**: Beauty Salon (미용실 산업 — 좌석정원/로열티한도/예약atomic/상태전환/재고배치/수수료atomic)
**Source**: SYNTHETIC — Sprint 313 F479, withRuleId 재사용 43번째 도메인 PoC (Fitness 다음 산업, 32번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (BT-001 ~ BT-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| BT-001 | 좌석 예약 요청 시 | `seat.booked_count < capacity` (UPPERCASE fallback MAX_SEAT_CAPACITY) | 예약 허용 + seat_bookings INSERT | `E422-SEAT-CAPACITY-EXCEEDED` (정원 초과) |
| BT-002 | 로열티 할인 적용 요청 시 | `membership.loyalty_usage < loyaltyTierLimit` (var-vs-var, `limit` keyword 매칭) | 할인 허용 + loyalty_usage 증가 | `E422-LOYALTY-TIER-LIMIT-EXCEEDED` (로열티 한도 초과) |
| BT-003 | 미용 예약 확정 요청 시 | `stylists.status = 'available'` | atomic: appointments INSERT + stylists UPDATE + appointment_payments INSERT | `E404-STYLIST` |
| BT-004 | 예약 상태 전환 (booked → confirmed → in_service → completed → reviewed) | 허용 매트릭스 충족 | `appointments.status` UPDATE | `E404-APPOINTMENT`, `E409-APPOINTMENT` |
| BT-005 | 재고 재입고 일괄 처리 | `inventory_items.status = 'depleted'` AND `restocked_at <= restockedBefore` | `status='restocked'` 일괄 UPDATE | 대상 없으면 markedCount=0 |
| BT-006 | 수수료 정산 요청 시 | `appointments.status = 'completed'` | atomic: commission_records INSERT + settlements INSERT + commission_records UPDATE | `E404-COMPLETED-APPOINTMENT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `seat_bookings` | INSERT (BT-001) | bookSeat |
| `beauty_seats` | booked_count 증가 (BT-001) | bookSeat |
| `loyalty_memberships` | loyalty_usage 증가 (BT-002) | applyLoyaltyDiscount |
| `appointments` | INSERT (BT-003), status 갱신 (BT-004) | confirmAppointment / transitionAppointmentStatus |
| `stylists` | status='booked' (BT-003) | confirmAppointment |
| `appointment_payments` | INSERT (BT-003) | confirmAppointment |
| `inventory_items` | status='restocked' (BT-005) | markInventoryRestockBatch |
| `commission_records` | INSERT + status='settled' (BT-006) | processCommission |
| `settlements` | INSERT (BT-006) | processCommission |

---

## 임계값 / 상수

- `MAX_SEAT_CAPACITY = 20` (BT-001 좌석 정원 기본 한도, 인원)
- `loyaltyTierLimit = loyalty_memberships.loyalty_tier_limit` (BT-002 멤버십별 로열티 할인 한도)

---

## 상태 머신

```
seat_bookings: booked → confirmed → in_service → completed (운영 전환)
seat_bookings: * → cancelled (운영 취소)

appointments: booked → confirmed (BT-004 transition)
appointments: confirmed → in_service (BT-004 transition)
appointments: in_service → completed (BT-004 transition)
appointments: completed → reviewed (BT-004 transition)

inventory_items: depleted → restocked (BT-005 batch)
commission_records: pending → calculated → settled (BT-006 atomic)
stylists: available → booked (BT-003 atomic)
```

---

## 권한

- **bookSeat**: 예약 SYSTEM / 고객 본인
- **applyLoyaltyDiscount**: 멤버십관리 SYSTEM
- **confirmAppointment**: 예약 SYSTEM (결제 연동)
- **transitionAppointmentStatus**: 스타일리스트 / 예약관리 SYSTEM
- **markInventoryRestockBatch**: 재고관리 SYSTEM (배치)
- **processCommission**: 정산 SYSTEM

---

## 관련 문서

- `rules/BT-001.md` ~ `rules/BT-006.md` — 개별 BL detail
- `runbooks/BT-001.md` ~ `runbooks/BT-006.md` — operational runbooks
- `tests/BT-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/beauty.ts` — 합성 source
