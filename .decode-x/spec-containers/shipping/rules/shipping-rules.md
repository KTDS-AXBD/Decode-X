# Spec Container — SHP-001 (해운/선적 합성 도메인)

**Skill ID**: SHP-001
**Domain**: Shipping (해운/선적 산업 — 컨테이너슬롯한도/운임수수료한도/화물적재atomic/항해예약상태전환/만료화물일괄/체선료환불atomic)
**Source**: SYNTHETIC — 세션 301 F511, withRuleId 재사용 52번째 도메인 PoC (Music 다음 산업, 41번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (SH-001 ~ SH-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| SH-001 | 신규 항해 예약 요청 시 | `vessel.active_bookings < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_BOOKINGS_PER_VESSEL) | 예약 허용 + vessel.active_bookings 증가 | `E422-VESSEL-CAPACITY-EXCEEDED` (선박 컨테이너 슬롯 정원 초과) |
| SH-002 | 운임 수수료 사용 요청 시 | `contract.fee_used + fee < freightPaymentLimit` (var-vs-var, `limit` keyword 매칭) | 수수료 적용 + fee_used 증가 | `E422-FREIGHT-PAYMENT-LIMIT-EXCEEDED` (운임 수수료 한도 초과) |
| SH-003 | 화물 적재 atomic 요청 시 | `voyage_bookings.status = 'confirmed'` | atomic: cargo_loads INSERT + voyage_bookings UPDATE + freight_payments INSERT | `E404-BOOKING` |
| SH-004 | 항해 예약 상태 전환 (booked → confirmed → loading → departed → arrived/aborted) | 허용 매트릭스 충족 | `voyage_bookings.status` UPDATE | `E404-BOOKING`, `E409-BOOKING` |
| SH-005 | arrived 화물 일괄 만료 처리 | `cargo_loads.status = 'arrived'` AND `loaded_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| SH-006 | 체선료 환불 atomic 요청 시 | `cargo_loads.status = 'arrived'` | atomic: demurrage_refund_records INSERT + demurrage_refunds INSERT + demurrage_refund_records UPDATE | `E404-ARRIVED-CARGO` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `vessels` | active_bookings 증가 (SH-001) | bookVoyage |
| `voyage_bookings` | INSERT (SH-001), status 갱신 (SH-003/SH-004) | bookVoyage / loadCargo / transitionBookingStatus |
| `freight_contracts` | fee_used 증가 (SH-002) | applyFreightTier |
| `cargo_loads` | INSERT (SH-003), batch expire (SH-005) | loadCargo / expireCargoLoadBatch |
| `freight_payments` | INSERT (SH-003) | loadCargo |
| `demurrage_refund_records` | INSERT + status='refunded' (SH-006) | processDemurrageRefund |
| `demurrage_refunds` | INSERT (SH-006) | processDemurrageRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_BOOKINGS_PER_VESSEL = 200` (SH-001 선박별 동시 컨테이너 슬롯 정원 기본 한도, TEU)
- `freightPaymentLimit = freight_contracts.fee_limit` (SH-002 화주 등급별 운임 수수료 한도, USD)

---

## 상태 머신

```
voyage_bookings: booked → confirmed (SH-004 transition)
voyage_bookings: confirmed → loading (SH-003 atomic)
voyage_bookings: loading → departed (SH-004 transition)
voyage_bookings: departed → arrived (SH-004 transition)
voyage_bookings: booked|confirmed|loading → aborted (SH-004 transition)

cargo_loads: loading → departed → arrived (정상 항해)
cargo_loads: arrived → expired (SH-005 batch — 장기 미수령 항만 보관 만료)

demurrage_refund_records: pending → calculated → refunded (SH-006 atomic)
```

---

## 의존 함수 (shipping.ts)

| BL | 함수 | detector |
|----|------|----------|
| SH-001 | `bookVoyage` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| SH-002 | `applyFreightTier` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| SH-003 | `loadCargo` | AtomicTransaction (`db.transaction(...)`) |
| SH-004 | `transitionBookingStatus` | StatusTransition (matrix) |
| SH-005 | `expireCargoLoadBatch` | StatusTransition (batch) |
| SH-006 | `processDemurrageRefund` | AtomicTransaction (`db.transaction(...)`) |
