# Spec Container — HOSPITALITY-001 (숙박 산업 합성 도메인)

**Skill ID**: HOSPITALITY-001
**Domain**: Hospitality (숙박 산업 — 객실예약/취소/체크인/체크아웃/하우스키핑/오버부킹)
**Source**: SYNTHETIC — Sprint 290 F456, withRuleId 재사용 20번째 도메인 PoC (Logistics 다음 산업, 9번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (HO-001 ~ HO-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| HO-001 | 객실 예약 요청 시 | `requestedRooms ≤ availableRooms` AND `requestedRooms > 0` | `bookings` INSERT (status='pending') | `E422-RM-MAX`, `E422-RM-MIN` |
| HO-002 | 예약 취소 환불 정책 적용 시 | `booking.status='pending' or 'confirmed'` AND `hoursUntilCheckIn > cancellationLimitHours` | 전액 환불 처리 | `E404-BK`, `E409-BK`, `E422-CANCEL-EXP` |
| HO-003 | 체크인 처리 시 | `booking.status='confirmed'` AND 배정 가능 객실 존재 | atomic: `bookings.status='checked_in'` + `rooms.status='occupied'` | `E404-BK`, `E409-BK`, `E409-RM` |
| HO-004 | 예약 상태 전환 (pending → confirmed → checked_in → checked_out) | 허용 매트릭스 충족 | `bookings.status` UPDATE | `E404-BK`, `E409-TR` |
| HO-005 | 하우스키핑 일괄 완료 처리 (정기 batch) | `rooms.housekeeping_status='dirty'` | `housekeeping_status='clean'` 일괄 UPDATE | 대상 없으면 markedCount=0 |
| HO-006 | 오버부킹 보상 트랜잭션 | `booking.status='pending'` AND `availableRooms=0` | atomic: `overbooking_log` INSERT + `bookings.status='cancelled'` + 보상 처리 | `E404-BK`, `E409-OB` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `bookings` | INSERT (HO-001) / status 전환 (HO-003/004/006) | bookRoom / processCheckIn / transitionBookingStatus / handleOverbookingCompensation |
| `rooms` | status 'available'→'occupied' (HO-003) / housekeeping_status (HO-005) | processCheckIn / markHousekeepingComplete |
| `overbooking_log` | INSERT (HO-006) | handleOverbookingCompensation |

---

## 임계값 / 상수

- `MAX_ROOMS_PER_BOOKING = 10` (HO-001 최대 객실 수)
- `CANCELLATION_WINDOW_HOURS = 24` (HO-002 취소 허용 시간 — 체크인 24시간 전까지)

---

## 상태 머신

```
booking: [bookRoom] → pending
booking: pending → confirmed (HO-004 직접 전환)
booking: confirmed → checked_in (HO-003 체크인)
booking: checked_in → checked_out (HO-004)
booking: pending → cancelled (HO-006 오버부킹)

rooms: available → occupied (HO-003 체크인)
rooms.housekeeping_status: dirty → clean (HO-005 batch)
```

---

## 권한

- **bookRoom**: 투숙객 또는 프런트데스크
- **applyCancellationPolicy**: 투숙객 또는 프런트데스크
- **processCheckIn**: 프런트데스크 또는 SYSTEM
- **transitionBookingStatus**: 프런트데스크 또는 SYSTEM
- **markHousekeepingComplete**: 하우스키핑 SYSTEM
- **handleOverbookingCompensation**: SYSTEM

---

## 관련 문서

- `rules/HO-001.md` ~ `rules/HO-006.md` — 개별 BL detail
- `runbooks/HO-001.md` ~ `runbooks/HO-006.md` — operational runbooks
- `tests/HO-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/hospitality.ts` — 합성 source
