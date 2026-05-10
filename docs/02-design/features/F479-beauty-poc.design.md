---
id: AIF-DESIGN-111
sprint: 313
feature: F479
title: Beauty Salon 43번째 도메인 신규 Design
status: active
created: 2026-05-10
related: [AIF-PLAN-111]
---

# F479 Design — AIF-DESIGN-111

## §1 개요

미용실(Beauty Salon) 도메인을 43번째 합성 spec-container로 추가한다. Fitness(FT) 패턴을 그대로 복제하며 신규 detector는 0개 (withRuleId 재사용 41 Sprint 연속 정점).

## §2 BL 설계

| BL | 함수 | Detector | Pattern |
|----|------|----------|---------|
| BT-001 | `bookSeat()` | ThresholdCheck (Path A) | `seatCount >= MAX_SEAT_CAPACITY` |
| BT-002 | `applyLoyaltyDiscount()` | ThresholdCheck (Path B) | `usage >= loyaltyTierLimit` |
| BT-003 | `confirmAppointment()` | AtomicTransaction | `db.transaction()` — appointments+stylist+payment |
| BT-004 | `transitionAppointmentStatus()` | StatusTransition | booked→confirmed→in_service→completed→reviewed |
| BT-005 | `markInventoryRestockBatch()` | StatusTransition (batch) | no_show/restock 일괄 |
| BT-006 | `processCommission()` | AtomicTransaction | revenue+commission+settlement |

## §3 파일 변경 목록

### 신규 생성 (16 파일)
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/beauty.ts` (~280 lines)
- `.decode-x/spec-containers/beauty/provenance.yaml`
- `.decode-x/spec-containers/beauty/rules/beauty-rules.md`
- `.decode-x/spec-containers/beauty/rules/BT-001.md` ~ `BT-006.md` (6 파일)
- `.decode-x/spec-containers/beauty/runbooks/BT-001.md` ~ `BT-006.md` (6 파일)
- `.decode-x/spec-containers/beauty/tests/BT-001.yaml`

### 수정 (4 파일)
- `scripts/divergence/domain-source-map.ts` — beauty 43번째 DOMAIN_MAP 항목 추가
- `packages/utils/src/divergence/rules-parser.ts` — BT prefix 추가 (BL_ID_PATTERN)
- `packages/utils/src/divergence/bl-detector.ts` — BT-001~006 REGISTRY 항목 추가
- `packages/utils/test/bl-detector.test.ts` — BT-001~006 테스트 + 237→243 detector 수 갱신

## §4 테스트 계약

- BT-001 PRESENCE: `seatCount >= MAX_SEAT_CAPACITY` threshold (UPPERCASE constant)
- BT-002 PRESENCE: `usage >= loyaltyTierLimit` (var-vs-var, limit keyword)
- BT-003 PRESENCE: `db.transaction()` in confirmAppointment (atomic)
- BT-004 PRESENCE: status transition booked→confirmed→in_service→completed→reviewed
- BT-005 PRESENCE: batch restock status update (StatusTransition batch)
- BT-006 PRESENCE: `db.transaction()` in processCommission (atomic)
- detector count: 237 → 243
- total tests: 340 → 346

## §5 Worker 파일 매핑

단일 작업 — Claude가 직접 모든 파일 생성 (Worker 매핑 없음)
