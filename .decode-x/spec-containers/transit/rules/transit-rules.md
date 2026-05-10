# Spec Container — TRANSIT-001 (대중교통 산업 합성 도메인)

**Skill ID**: TRANSIT-001
**Domain**: Public Transport (대중교통 산업 — 정원한도/요금한도/환승atomic/트립상태전환/정기권배치/운행중단atomic)
**Source**: SYNTHETIC — Sprint 303 F469, withRuleId 재사용 33번째 도메인 PoC (Maritime 다음 산업, 22번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (TS-001 ~ TS-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| TS-001 | 노선 탑승 요청 시 | `passengerCount < MAX_ROUTE_CAPACITY` (UPPERCASE 상수, 1,200명) AND route.status='active' | 탑승 허용 + trips INSERT | `E422-CAPACITY-LIMIT` (정원 한도 초과) |
| TS-002 | 요금 계산 시 | `zoneFare <= fareZoneLimit` (var-vs-var, `limit` keyword 매칭) | 요금 허용 + fare_records INSERT | `E422-FARE-EXCEEDED` (요금 한도 초과) |
| TS-003 | 환승 처리 시 | `trip.status = 'in_transit'` AND 승객 ID 일치 | atomic: `transfers` INSERT + `integrated_passes` INSERT + `trips.status` 갱신 + 신규 `trips` INSERT | `E404-TRIP`, `E409-TRIP`, `E403-TRIP` |
| TS-004 | 트립 상태 전환 (boarded → in_transit → transferred → completed) | 허용 매트릭스 충족 | `trips.status` UPDATE + 타임스탬프 기록 | `E404-TRIP`, `E409-TRIP` |
| TS-005 | 정기권 일괄 갱신 (배치) | `season_passes.valid_until <= expiryBefore` AND `renewed = 0` AND `status = 'active'` | `renewed=1, renewed_at=NOW()` 일괄 UPDATE | 대상 없으면 renewedCount=0 |
| TS-006 | 운행 중단 환불 처리 시 | `route.status = 'suspended'` | atomic: `suspension_refunds` INSERT + `refund_records` INSERT + `routes.suspension_refund_issued` UPDATE | `E404-ROUTE`, `E409-ROUTE` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `trips` | status 전환 / boarded_at / in_transit_at / transferred_at / completed_at (TS-001/TS-003/TS-004) | checkRouteCapacity / processTransfer / transitionTripStatus |
| `routes` | current_passengers 갱신 / suspension_refund_issued (TS-001/TS-006) | checkRouteCapacity / processSuspensionRefund |
| `fare_records` | INSERT (TS-002) | computeFare |
| `transfers` | INSERT (TS-003) | processTransfer |
| `integrated_passes` | INSERT (TS-003) | processTransfer |
| `season_passes` | renewed=1, renewed_at 갱신 (TS-005) | markSeasonPassRenewal |
| `suspension_refunds` | INSERT (TS-006) | processSuspensionRefund |
| `refund_records` | INSERT (TS-006) | processSuspensionRefund |

---

## 임계값 / 상수

- `MAX_ROUTE_CAPACITY = 1_200` (TS-001 최대 노선 정원 한도, 승객 수)
- `fareZoneLimit = 1500/1800/2100/2500` (TS-002 구간별 최대 단일 요금 한도, KRW — zone_1/zone_2/zone_3/zone_4)

---

## 상태 머신

```
trips: boarded → in_transit (TS-004 transition)
trips: in_transit → transferred (TS-004 transition)
trips: in_transit → completed (TS-004 transition)
trips: transferred → completed (TS-004 transition)

season_passes: [active] renewed=0 → renewed=1 (TS-005 batch)

transfers: [created] — TS-003 atomic 생성 (status='completed')
integrated_passes: [created] — TS-003 atomic 생성 (불변)

suspension_refunds: [created] — TS-006 atomic 생성 (status='processed')
refund_records: [created] — TS-006 atomic 생성 (불변)
```

---

## 권한

- **checkRouteCapacity**: 승객 / 탑승관리 SYSTEM
- **computeFare**: 운임계산 SYSTEM
- **processTransfer**: 환승 SYSTEM
- **transitionTripStatus**: 트립관리 SYSTEM
- **markSeasonPassRenewal**: 정기권관리 SYSTEM (배치)
- **processSuspensionRefund**: 고객서비스 / 환불처리 SYSTEM

---

## 관련 문서

- `rules/TS-001.md` ~ `rules/TS-006.md` — 개별 BL detail
- `runbooks/TS-001.md` ~ `runbooks/TS-006.md` — operational runbooks
- `tests/TS-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/transit.ts` — 합성 source
