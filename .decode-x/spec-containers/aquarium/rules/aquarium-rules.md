# Spec Container — AQU-001 (수족관/해양생물 합성 도메인)

**Skill ID**: AQU-001
**Domain**: Aquarium (수족관/해양생물 산업 — 수족관admit한도/guestdailytour한도/입장batchatomic/admit상태전환/만료closedadmit일괄/tour환불atomic)
**Source**: SYNTHETIC — 세션 306 후속9 F541, withRuleId 재사용 73번째 도메인 PoC (Surfing 다음 산업, 62번째 신규) 🏆🏆🏆 1세션 10 Sprint 신기록 도전
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (AQ-001 ~ AQ-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| AQ-001 | 신규 admit 예약 요청 시 | `aquarium.active_admits < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_ACTIVE_ADMITS_PER_AQUARIUM) | admit 예약 허용 + aquarium.active_admits 증가 | `E422-AQUARIUM-CAPACITY-EXCEEDED` |
| AQ-002 | 관람객 tour 요청 시 | `contract.tour_used + tour < dailyTourLimit` (var-vs-var, `limit` keyword) | tour 적용 + tour_used 증가 | `E422-DAILY-TOUR-LIMIT-EXCEEDED` |
| AQ-003 | 관람 입장 atomic 요청 시 | `tour_schedules.status = 'reserved'` | atomic: admits INSERT + tour_schedules UPDATE + admit_payments INSERT | `E404-SCHEDULE` |
| AQ-004 | admit 상태 전환 (reserved → toured → updated → ended / closed / cancelled) | 허용 매트릭스 충족 | `tour_schedules.status` UPDATE | `E404-SCHEDULE`, `E409-SCHEDULE` |
| AQ-005 | closed admit 일괄 만료 처리 | `admits.status = 'closed'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| AQ-006 | tour 환불 (closed) atomic 요청 시 | `admits.status = 'closed'` | atomic: admit_refund_records INSERT + admit_refunds INSERT + admit_refund_records UPDATE | `E404-CLOSED-ADMIT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `aquariums` | active_admits 증가 (AQ-001) | bookAdmit |
| `tour_schedules` | INSERT (AQ-001), status 갱신 (AQ-003/AQ-004) | bookAdmit / processAdmitEntry / transitionAdmitStatus |
| `guest_contracts` | tour_used 증가 (AQ-002) | applyTourLimit |
| `admits` | INSERT (AQ-003), batch expire (AQ-005) | processAdmitEntry / expireClosedAdmitBatch |
| `admit_payments` | INSERT (AQ-003) | processAdmitEntry |
| `admit_refund_records` | INSERT + status='refunded' (AQ-006) | processTourRefund |
| `admit_refunds` | INSERT (AQ-006) | processTourRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_ACTIVE_ADMITS_PER_AQUARIUM = 8000` (AQ-001 수족관별 동시 active admit 기본 한도, 대형 수족관 일일 동시 관람 가능 인원 — 코엑스/롯데월드 아쿠아리움급)
- `dailyTourLimit = guest_contracts.tour_limit` (AQ-002 관람객 등급별 일일 tour 한도, 연간권자 정책 연계)

---

## 상태 머신

```
tour_schedules: reserved → toured (AQ-003 atomic)
tour_schedules: toured ↔ updated (AQ-004 transition, 관람 루트 변경)
tour_schedules: toured|updated → ended (AQ-004 transition, 정상 관람 종료)
tour_schedules: reserved|toured → closed (AQ-004 transition, 수족관 긴급 폐쇄/생물 점검)
tour_schedules: reserved|toured → cancelled (AQ-004 transition)

admits: toured → updated → ended (정상 종료)
admits: closed → expired (AQ-005 batch — 데이터 보관 기간 만료)
admits: toured → closed (수족관 긴급 폐쇄, AQ-006 tour 환불 대상)

admit_refund_records: pending → calculated → refunded (AQ-006 atomic)
```

---

## 의존 함수 (aquarium.ts)

| BL | 함수 | detector |
|----|------|----------|
| AQ-001 | `bookAdmit` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| AQ-002 | `applyTourLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| AQ-003 | `processAdmitEntry` | AtomicTransaction (`db.transaction(...)`) |
| AQ-004 | `transitionAdmitStatus` | StatusTransition (matrix) |
| AQ-005 | `expireClosedAdmitBatch` | StatusTransition (batch) |
| AQ-006 | `processTourRefund` | AtomicTransaction (`db.transaction(...)`) |
