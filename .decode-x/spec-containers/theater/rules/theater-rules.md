# Spec Container — THE-001 (영화관/극장/공연장 합성 도메인)

**Skill ID**: THE-001
**Domain**: Theater (영화관/극장/공연장 산업 — 극장seat한도/patrondailyattendance한도/입장batchatomic/seat상태전환/만료withdrawnseat일괄/seat환불atomic)
**Source**: SYNTHETIC — 세션 306 후속3 F535, withRuleId 재사용 67번째 도메인 PoC (Amusement 다음 산업, 56번째 신규) 🏆 67번째 도메인 마일스톤
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (TH-001 ~ TH-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| TH-001 | 신규 seat 예매 요청 시 | `theater.active_seats < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_ACTIVE_SEATS_PER_THEATER) | seat 예매 허용 + theater.active_seats 증가 | `E422-THEATER-CAPACITY-EXCEEDED` |
| TH-002 | 관람객 attendance 요청 시 | `contract.attendance_used + attendance < dailyAttendanceLimit` (var-vs-var, `limit` keyword) | attendance 적용 + attendance_used 증가 | `E422-DAILY-ATTENDANCE-LIMIT-EXCEEDED` |
| TH-003 | 공연 입장 atomic 요청 시 | `performance_schedules.status = 'booked'` | atomic: seats INSERT + performance_schedules UPDATE + seat_payments INSERT | `E404-SCHEDULE` |
| TH-004 | seat 상태 전환 (booked → seated → updated → ended / withdrawn / cancelled) | 허용 매트릭스 충족 | `performance_schedules.status` UPDATE | `E404-SCHEDULE`, `E409-SCHEDULE` |
| TH-005 | withdrawn seat 일괄 만료 처리 | `seats.status = 'withdrawn'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| TH-006 | seat 환불 (withdrawn) atomic 요청 시 | `seats.status = 'withdrawn'` | atomic: seat_refund_records INSERT + seat_refunds INSERT + seat_refund_records UPDATE | `E404-WITHDRAWN-SEAT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `theaters` | active_seats 증가 (TH-001) | bookSeat |
| `performance_schedules` | INSERT (TH-001), status 갱신 (TH-003/TH-004) | bookSeat / processShowAdmission / transitionSeatStatus |
| `patron_contracts` | attendance_used 증가 (TH-002) | applyAttendanceLimit |
| `seats` | INSERT (TH-003), batch expire (TH-005) | processShowAdmission / expireWithdrawnSeatBatch |
| `seat_payments` | INSERT (TH-003) | processShowAdmission |
| `seat_refund_records` | INSERT + status='refunded' (TH-006) | processShowRefund |
| `seat_refunds` | INSERT (TH-006) | processShowRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_ACTIVE_SEATS_PER_THEATER = 2000` (TH-001 극장별 동시 active seat 기본 한도, 대형 멀티플렉스 1관 1000~2000석)
- `dailyAttendanceLimit = patron_contracts.attendance_limit` (TH-002 관람객 등급별 일일 attendance 한도, 멤버십 무제한권자 정책 연계)

---

## 상태 머신

```
performance_schedules: booked → seated (TH-003 atomic)
performance_schedules: seated ↔ updated (TH-004 transition, 좌석 변경)
performance_schedules: seated|updated → ended (TH-004 transition, 정상 공연 종료)
performance_schedules: booked|seated → withdrawn (TH-004 transition, 공연 취소/관객 환불)
performance_schedules: booked|seated → cancelled (TH-004 transition)

seats: seated → updated → ended (정상 종료)
seats: withdrawn → expired (TH-005 batch — 데이터 보관 기간 만료)
seats: seated → withdrawn (공연 긴급 취소, TH-006 seat 환불 대상)

seat_refund_records: pending → calculated → refunded (TH-006 atomic)
```

---

## 의존 함수 (theater.ts)

| BL | 함수 | detector |
|----|------|----------|
| TH-001 | `bookSeat` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| TH-002 | `applyAttendanceLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| TH-003 | `processShowAdmission` | AtomicTransaction (`db.transaction(...)`) |
| TH-004 | `transitionSeatStatus` | StatusTransition (matrix) |
| TH-005 | `expireWithdrawnSeatBatch` | StatusTransition (batch) |
| TH-006 | `processShowRefund` | AtomicTransaction (`db.transaction(...)`) |
