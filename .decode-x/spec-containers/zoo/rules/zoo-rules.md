# Spec Container — ZOO-001 (동물원 합성 도메인)

**Skill ID**: ZOO-001
**Domain**: Zoo (동물원 산업 — 동물원visit한도/visitordailyzone한도/입장batchatomic/visit상태전환/만료closedvisit일괄/visit환불atomic)
**Source**: SYNTHETIC — 세션 307 F542, withRuleId 재사용 74번째 도메인 PoC (Aquarium 다음 산업, 63번째 신규) 🦁 단일 클러스터 5 도메인 첫 사례 마일스톤
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (ZO-001 ~ ZO-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| ZO-001 | 신규 방문 예약 요청 시 | `zoo.active_visits < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_ACTIVE_VISITS_PER_ZOO) | 방문 예약 허용 + zoo.active_visits 증가 | `E422-ZOO-CAPACITY-EXCEEDED` |
| ZO-002 | 방문객 관람 구역 요청 시 | `pass.zone_used + zone < zoneLimit` (var-vs-var, `limit` keyword) | 구역 적용 + zone_used 증가 | `E422-DAILY-ZONE-LIMIT-EXCEEDED` |
| ZO-003 | 관람 입장 atomic 요청 시 | `exhibit_schedules.status = 'reserved'` | atomic: zoo_visits INSERT + exhibit_schedules UPDATE + visit_payments INSERT | `E404-SCHEDULE` |
| ZO-004 | 방문 상태 전환 (reserved → visited → updated → ended / closed / cancelled) | 허용 매트릭스 충족 | `exhibit_schedules.status` UPDATE | `E404-SCHEDULE`, `E409-SCHEDULE` |
| ZO-005 | closed 방문 일괄 만료 처리 | `zoo_visits.status = 'closed'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| ZO-006 | 방문 환불 (closed) atomic 요청 시 | `zoo_visits.status = 'closed'` | atomic: visit_refund_records INSERT + visit_refunds INSERT + visit_refund_records UPDATE | `E404-CLOSED-VISIT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `zoos` | active_visits 증가 (ZO-001) | bookVisit |
| `exhibit_schedules` | INSERT (ZO-001), status 갱신 (ZO-003/ZO-004) | bookVisit / processExhibitEntry / transitionVisitStatus |
| `visitor_passes` | zone_used 증가 (ZO-002) | applyZoneLimit |
| `zoo_visits` | INSERT (ZO-003), batch expire (ZO-005) | processExhibitEntry / expireClosedVisitBatch |
| `visit_payments` | INSERT (ZO-003) | processExhibitEntry |
| `visit_refund_records` | INSERT + status='refunded' (ZO-006) | processVisitRefund |
| `visit_refunds` | INSERT (ZO-006) | processVisitRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_ACTIVE_VISITS_PER_ZOO = 15000` (ZO-001 동물원별 동시 active 입장 기본 한도, 대형 동물원 일일 동시 관람 가능 인원 — 서울대공원/에버랜드급)
- `zoneLimit = visitor_passes.zone_limit` (ZO-002 방문객 등급별 일일 관람 구역 한도, 연간권자 정책 연계)

---

## 상태 머신

```
exhibit_schedules: reserved → visited (ZO-003 atomic)
exhibit_schedules: visited ↔ updated (ZO-004 transition, 관람 루트 변경)
exhibit_schedules: visited|updated → ended (ZO-004 transition, 정상 관람 종료)
exhibit_schedules: reserved|visited → closed (ZO-004 transition, 동물원 긴급 폐쇄/동물 점검)
exhibit_schedules: reserved|visited → cancelled (ZO-004 transition)

zoo_visits: visited → updated → ended (정상 종료)
zoo_visits: closed → expired (ZO-005 batch — 데이터 보관 기간 만료)
zoo_visits: visited → closed (동물원 긴급 폐쇄, ZO-006 방문 환불 대상)

visit_refund_records: pending → calculated → refunded (ZO-006 atomic)
```

---

## 의존 함수 (zoo.ts)

| BL | 함수 | detector |
|----|------|----------|
| ZO-001 | `bookVisit` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| ZO-002 | `applyZoneLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| ZO-003 | `processExhibitEntry` | AtomicTransaction (`db.transaction(...)`) |
| ZO-004 | `transitionVisitStatus` | StatusTransition (matrix) |
| ZO-005 | `expireClosedVisitBatch` | StatusTransition (batch) |
| ZO-006 | `processVisitRefund` | AtomicTransaction (`db.transaction(...)`) |
