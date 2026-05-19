# Spec Container — PARK-001 (자연공원 합성 도메인)

**Skill ID**: PARK-001
**Domain**: Park (자연공원/국립공원 산업 — 동시방문한도/회원일일trail한도/트레일입장atomic/방문상태전환/closed방문일괄만료/방문환불atomic)
**Source**: SYNTHETIC — 세션 307 후속4 F546, withRuleId 재사용 78번째 도메인 PoC (Library 다음 산업, 67번째 신규) 🌲 단일 클러스터 9 도메인 첫 사례 마일스톤
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (PA-001 ~ PA-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| PA-001 | 신규 공원 방문 예약 요청 시 | `park.active_visits < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_VISITS_PER_PARK) | 방문 예약 허용 + park.active_visits 증가 | `E422-PARK-VISIT-LIMIT-EXCEEDED` |
| PA-002 | 회원 trail 요청 시 | `pass.trail_used + trails < trailLimit` (var-vs-var, `limit` keyword) | trail 적용 + trail_used 증가 | `E422-DAILY-TRAIL-LIMIT-EXCEEDED` |
| PA-003 | 트레일 입장 atomic 요청 시 | `park_visits.status = 'reserved'` | atomic: trail_schedules INSERT + park_visits UPDATE + visit_payments INSERT | `E404-VISIT` |
| PA-004 | 방문 상태 전환 (reserved → entered → exited → ended / closed / cancelled) | 허용 매트릭스 충족 | `park_visits.status` UPDATE | `E404-VISIT`, `E409-VISIT` |
| PA-005 | closed 방문 일괄 만료 처리 | `park_visits.status = 'closed'` AND `scheduled_at <= now` | `status='ended'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| PA-006 | 방문 환불 atomic 요청 시 | `park_visits.status = 'cancelled'` | atomic: cancelled_fee_records INSERT + visit_refunds INSERT + cancelled_fee_records UPDATE | `E404-CANCELLED-VISIT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `parks` | active_visits 증가 (PA-001) | reserveVisit |
| `park_visits` | INSERT (PA-001), status 갱신 (PA-003/PA-004/PA-005) | reserveVisit / processTrailEntry / transitionVisitStatus / expireClosedVisitBatch |
| `member_passes` | trail_used 증가 (PA-002) | applyTrailLimit |
| `trail_schedules` | INSERT (PA-003) | processTrailEntry |
| `visit_payments` | INSERT (PA-003) | processTrailEntry |
| `cancelled_fee_records` | INSERT + status='refunded' (PA-006) | processVisitRefund |
| `visit_refunds` | INSERT (PA-006) | processVisitRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_VISITS_PER_PARK = 300` (PA-001 공원별 동시 active 방문 기본 한도, 자연공원 300인 기준)
- `trailLimit = member_passes.trail_limit` (PA-002 회원 등급별 일일 trail 한도, 멤버십 정책 연계)

---

## 상태 머신

```
park_visits: reserved → entered (PA-003 atomic)
park_visits: entered → exited (PA-004 transition, 트레일 완료)
park_visits: exited → ended (PA-004 transition, 정산 완료)
park_visits: entered → closed (PA-004 transition, 공원 운영 종료)
park_visits: reserved|entered → cancelled (PA-004 transition)

trail_schedules: active → completed (정상 완료)
trail_schedules: active → cancelled (취소)

park_visits: closed → ended (PA-005 batch — 운영 종료 후 자동 처리)

cancelled_fee_records: pending → calculated → refunded (PA-006 atomic)
```

---

## PA 차별성 (AM 놀이공원과 분리)

| 항목 | AM (Amusement) | PA (Park) |
|------|----------------|-----------|
| 모델 | 어트랙션/티켓팅 | 트레일/캠핑/가이드 투어 |
| 한도 | 좌석/수용인원 | 동시 방문 인원 |
| 핵심 활동 | 놀이기구 탑승 | 트레일 코스 입장 |
| 상태 종료 | ended | closed → ended (PA-005 batch) |

---

## 의존 함수 (park.ts)

| BL | 함수 | detector |
|----|------|----------|
| PA-001 | `reserveVisit` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| PA-002 | `applyTrailLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| PA-003 | `processTrailEntry` | AtomicTransaction (`db.transaction(...)`) |
| PA-004 | `transitionVisitStatus` | StatusTransition (matrix) |
| PA-005 | `expireClosedVisitBatch` | StatusTransition (batch) |
| PA-006 | `processVisitRefund` | AtomicTransaction (`db.transaction(...)`) |
