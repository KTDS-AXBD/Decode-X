# Spec Container — GARDEN-001 (식물원/수목원 합성 도메인)

**Skill ID**: GARDEN-001
**Domain**: Garden (식물원/수목원 산업 — 동시방문한도/zone입장한도/zone입장atomic/방문상태전환/closed방문일괄만료/방문환불atomic)
**Source**: SYNTHETIC — 세션 307 후속6 F548, withRuleId 재사용 80번째 도메인 PoC (Festival 다음 산업, 69번째 신규) 🌷 단일 클러스터 11 도메인 첫 사례 마일스톤
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (GR-001 ~ GR-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| GR-001 | 신규 garden visit 예약 요청 시 | `garden.active_visits < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_GARDEN_VISITS) | 방문 예약 허용 + garden.active_visits 증가 | `E422-GARDEN-VISIT-LIMIT-EXCEEDED` |
| GR-002 | 멤버 zone 입장 요청 시 | `membership.zone_used + zones < zoneLimit` (var-vs-var, `limit` keyword) | zone 적용 + zone_used 증가 | `E422-ZONE-LIMIT-EXCEEDED` |
| GR-003 | zone 입장 atomic 요청 시 | `garden_visits.status = 'reserved'` | atomic: zone_sessions INSERT + garden_visits UPDATE + visit_payments INSERT | `E404-VISIT` |
| GR-004 | 방문 상태 전환 (reserved → entered → exited → ended / closed / cancelled) | 허용 매트릭스 충족 | `garden_visits.status` UPDATE | `E404-VISIT`, `E409-VISIT` |
| GR-005 | closed 방문 일괄 만료 처리 | `garden_visits.status = 'closed'` AND `scheduled_at <= now` | `status='ended'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| GR-006 | 방문 환불 atomic 요청 시 | `garden_visits.status = 'cancelled'` | atomic: cancelled_fee_records INSERT + visit_refunds INSERT + cancelled_fee_records UPDATE | `E404-CANCELLED-VISIT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `gardens` | active_visits 증가 (GR-001) | reserveVisit |
| `garden_visits` | INSERT (GR-001), status 갱신 (GR-003/GR-004/GR-005) | reserveVisit / processGardenEntry / transitionVisitStatus / expireClosedVisitBatch |
| `garden_memberships` | zone_used 증가 (GR-002) | applyZoneLimit |
| `zone_sessions` | INSERT (GR-003) | processGardenEntry |
| `visit_payments` | INSERT (GR-003) | processGardenEntry |
| `cancelled_fee_records` | INSERT + status='refunded' (GR-006) | processVisitRefund |
| `visit_refunds` | INSERT (GR-006) | processVisitRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_GARDEN_VISITS = 3000` (GR-001 식물원별 동시 active 방문 기본 한도, 중대형 식물원 3000인 기준 — PA 2000보다 크고 FE 5000보다 작음)
- `zoneLimit = garden_memberships.zone_limit` (GR-002 멤버십 유형별 zone 한도, day/seasonal/annual 멤버십 정책 연계)

---

## 상태 머신

```
garden_visits: reserved → entered (GR-003 atomic)
garden_visits: entered → exited (GR-004 transition, zone 완료)
garden_visits: exited → ended (GR-004 transition, 정산 완료)
garden_visits: entered → closed (GR-004 transition, 식물원 운영 종료)
garden_visits: reserved|entered → cancelled (GR-004 transition)

zone_sessions: active → completed (정상 완료)
zone_sessions: active → cancelled (취소)

garden_visits: closed → ended (GR-005 batch — 운영 종료 후 자동 처리)

cancelled_fee_records: pending → calculated → refunded (GR-006 atomic)
```

---

## GR 차별성 (PA 자연공원, MS 박물관과 분리)

| 항목 | PA (자연공원) | MS (박물관) | GR (식물원/수목원) |
|------|-------------|------------|-----------------|
| 핵심 활동 | 트레일/캠핑/가이드 투어 | 전시물 관람 | 구역별 식물 관찰/온실 투어 |
| 입장 구조 | 공원 전체 | 전시 구역 | zone 분리 구역 (온실/수목원/특별전시) |
| 멤버십 | 시즌 패스 | 연간 패스 | 계절권 (seasonal) |
| 핵심 한도 | 동시 방문자 2000 | 동시 방문자 1500 | 동시 방문자 3000 + zone별 한도 |
| 예약 단위 | 활동 슬롯 | 전시 관람 | garden visit + zone 예약 |

---

## 의존 함수 (garden.ts)

| BL | 함수 | detector |
|----|------|----------|
| GR-001 | `reserveVisit` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| GR-002 | `applyZoneLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| GR-003 | `processGardenEntry` | AtomicTransaction (`db.transaction(...)`) |
| GR-004 | `transitionVisitStatus` | StatusTransition (matrix) |
| GR-005 | `expireClosedVisitBatch` | StatusTransition (batch) |
| GR-006 | `processVisitRefund` | AtomicTransaction (`db.transaction(...)`) |
