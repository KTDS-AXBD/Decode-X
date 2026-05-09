---
id: AIF-DSGN-089
sprint: 291
feature: F457
title: Travel 21번째 도메인 신규 — Design
status: active
created: 2026-05-09
plan: AIF-PLAN-089
---

# F457 Design — AIF-DSGN-089

## §1 변경 파일 매핑

| 파일 | 변경 | 목적 |
|------|------|------|
| `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/travel.ts` | 신규 | 21번째 도메인 source (TR-001~006) |
| `.decode-x/spec-containers/travel/provenance.yaml` | 신규 | Travel 도메인 provenance |
| `.decode-x/spec-containers/travel/rules/travel-rules.md` | 신규 | BL 규칙 테이블 |
| `.decode-x/spec-containers/travel/rules/TR-001.md` ~ `TR-006.md` | 신규 (6) | 개별 BL detail |
| `.decode-x/spec-containers/travel/runbooks/TR-001.md` ~ `TR-006.md` | 신규 (6) | Operational runbooks |
| `.decode-x/spec-containers/travel/tests/TR-001.yaml` | 신규 | 대표 test scenarios |
| `scripts/divergence/domain-source-map.ts` | 수정 | DOMAIN_MAP travel 21번째 entry |
| `packages/utils/src/divergence/rules-parser.ts` | 수정 | BL_ID_PATTERN TR prefix 추가 |
| `packages/utils/src/divergence/bl-detector.ts` | 수정 | REGISTRY TR-001~006 추가 |
| `packages/utils/test/bl-detector.test.ts` | 수정 | 105→111, +6 PRESENCE 테스트 |

## §2 BL 설계

| BL | Detector | 함수 | 패턴 |
|----|----------|------|------|
| TR-001 | ThresholdCheck (Path A) | `bookFlight()` | `seatsRequested > MAX_SEATS_PER_BOOKING` |
| TR-002 | ThresholdCheck (Path B) | `upgradeFareClass()` | `requiredMilesLimit > availableMiles` (var-vs-var, `limit` keyword) |
| TR-003 | AtomicTransaction | `confirmItinerary()` | `db.transaction()` (예약+결제+PNR) |
| TR-004 | StatusTransition | `transitionTripStatus()` | `pending→confirmed→checked_in→completed` |
| TR-005 | StatusTransition (batch) | `markDisruptedTrips()` | batch status update, CC-005 10번째 재사용 |
| TR-006 | AtomicTransaction | `processCancellationRefund()` | `db.transaction()` (취소+환불+마일리지) |

## §3 travel.ts 구조 (~280 lines)

```typescript
// TravelError class (code-in-message 표준)
// 상수: MAX_SEATS_PER_BOOKING = 9, FARE_UPGRADE_MILES_LIMIT = 100000
// bookFlight() — TR-001 ThresholdCheck Path A
// upgradeFareClass() — TR-002 ThresholdCheck Path B (requiredMilesLimit)
// confirmItinerary() — TR-003 AtomicTransaction
// transitionTripStatus() — TR-004 StatusTransition
// markDisruptedTrips() — TR-005 StatusTransition batch
// processCancellationRefund() — TR-006 AtomicTransaction
```

## §4 spec-container/travel 15 sub-files

- `provenance.yaml` (1)
- `rules/travel-rules.md` (1)
- `rules/TR-001.md` ~ `TR-006.md` (6)
- `runbooks/TR-001.md` ~ `TR-006.md` (6)
- `tests/TR-001.yaml` (1)

## §5 검증 기준

- `pnpm --force typecheck` PASS
- `vitest` 200→206 PASS (회귀 0)
- `detect-bl --all-domains` 21 containers, coverage ≥ 86.5%
- `write-provenance --apply --resolved-by` → 0/21 changes (PRESENCE 자동 입증)
