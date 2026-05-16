# Spec Container — EXH-001 (박람회/컨벤션 합성 도메인)

**Skill ID**: EXH-001
**Domain**: Exhibition (박람회/컨벤션 산업 — venueadmission한도/exhibitordailyvisitor한도/개장batchatomic/booth상태전환/만료withdrawnadmission일괄/booth환불atomic)
**Source**: SYNTHETIC — 세션 306 후속5 F537, withRuleId 재사용 69번째 도메인 PoC (Skiing 다음 산업, 58번째 신규) 🏆 69번째 도메인 마일스톤
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (EX-001 ~ EX-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| EX-001 | 신규 booth 예약 요청 시 | `venue.active_admissions < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_ACTIVE_ADMISSIONS_PER_VENUE) | booth 예약 허용 + venue.active_admissions 증가 | `E422-VENUE-CAPACITY-EXCEEDED` |
| EX-002 | 전시업체 visitor 요청 시 | `contract.visitor_used + visitor < dailyVisitorLimit` (var-vs-var, `limit` keyword) | visitor 적용 + visitor_used 증가 | `E422-DAILY-VISITOR-LIMIT-EXCEEDED` |
| EX-003 | 부스 개장 atomic 요청 시 | `booth_schedules.status = 'booked'` | atomic: admissions INSERT + booth_schedules UPDATE + booth_payments INSERT | `E404-SCHEDULE` |
| EX-004 | booth 상태 전환 (booked → exhibited → updated → closed / withdrawn / cancelled) | 허용 매트릭스 충족 | `booth_schedules.status` UPDATE | `E404-SCHEDULE`, `E409-SCHEDULE` |
| EX-005 | withdrawn admission 일괄 만료 처리 | `admissions.status = 'withdrawn'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| EX-006 | booth 환불 (withdrawn) atomic 요청 시 | `admissions.status = 'withdrawn'` | atomic: admission_refund_records INSERT + admission_refunds INSERT + admission_refund_records UPDATE | `E404-WITHDRAWN-ADMISSION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `venues` | active_admissions 증가 (EX-001) | bookBooth |
| `booth_schedules` | INSERT (EX-001), status 갱신 (EX-003/EX-004) | bookBooth / processBoothOpening / transitionBoothStatus |
| `exhibitor_contracts` | visitor_used 증가 (EX-002) | applyVisitorLimit |
| `admissions` | INSERT (EX-003), batch expire (EX-005) | processBoothOpening / expireWithdrawnAdmissionBatch |
| `booth_payments` | INSERT (EX-003) | processBoothOpening |
| `admission_refund_records` | INSERT + status='refunded' (EX-006) | processBoothRefund |
| `admission_refunds` | INSERT (EX-006) | processBoothRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_ACTIVE_ADMISSIONS_PER_VENUE = 10000` (EX-001 venue별 동시 active admission 기본 한도, 대형 전시장 1일 동시 입장 가능 인원)
- `dailyVisitorLimit = exhibitor_contracts.visitor_limit` (EX-002 전시업체 등급별 일일 visitor 한도, B2B/B2C 정책 연계)

---

## 상태 머신

```
booth_schedules: booked → exhibited (EX-003 atomic)
booth_schedules: exhibited ↔ updated (EX-004 transition, 부스 정보 갱신)
booth_schedules: exhibited|updated → closed (EX-004 transition, 정상 전시 종료)
booth_schedules: booked|exhibited → withdrawn (EX-004 transition, 전시업체 철수)
booth_schedules: booked|exhibited → cancelled (EX-004 transition)

admissions: exhibited → updated → closed (정상 종료)
admissions: withdrawn → expired (EX-005 batch — 데이터 보관 기간 만료)
admissions: exhibited → withdrawn (전시업체 긴급 철수, EX-006 booth 환불 대상)

admission_refund_records: pending → calculated → refunded (EX-006 atomic)
```

---

## 의존 함수 (exhibition.ts)

| BL | 함수 | detector |
|----|------|----------|
| EX-001 | `bookBooth` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| EX-002 | `applyVisitorLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| EX-003 | `processBoothOpening` | AtomicTransaction (`db.transaction(...)`) |
| EX-004 | `transitionBoothStatus` | StatusTransition (matrix) |
| EX-005 | `expireWithdrawnAdmissionBatch` | StatusTransition (batch) |
| EX-006 | `processBoothRefund` | AtomicTransaction (`db.transaction(...)`) |
