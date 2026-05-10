---
id: AIF-DSGN-101
sprint: 303
feature: F469
title: Public Transport 33번째 도메인 설계 (대중교통 산업, 22번째 신규 산업)
status: active
created: 2026-05-10
related: [AIF-PLAN-101]
---

# F469 Design — AIF-DSGN-101

## §1 개요

Sprint 302 (F468 Maritime) 동일 패턴으로 Public Transport(대중교통) 합성 도메인을 신규 추가한다.
33번째 도메인, 22번째 신규 산업. 공공서비스 + transit 인프라 영역.

## §2 BL 정의 (6종)

| BL | 함수 | Detector | 상세 |
|----|------|----------|------|
| TS-001 | `checkRouteCapacity()` | Threshold (Path A, UPPERCASE) | `passengerCount >= MAX_ROUTE_CAPACITY` — 노선 정원 한도 검증 |
| TS-002 | `computeFare()` | Threshold (Path B, var-vs-var) | `zoneFare > fareZoneLimit` — `limit` keyword 매칭 |
| TS-003 | `processTransfer()` | Atomic | 환승 + 잔액 차감 + 통합권 발급 트랜잭션 |
| TS-004 | `transitionTripStatus()` | Status | boarded → in_transit → transferred → completed |
| TS-005 | `markSeasonPassRenewal()` | Status | 정기권 일괄 갱신 (batch — CC-005 22번째 재사용) |
| TS-006 | `processSuspensionRefund()` | Atomic | 운행 중단 + 환불 + 보상 트랜잭션 |

## §3 파일 매핑

### 생성 파일

| 파일 | 역할 |
|------|------|
| `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/transit.ts` | 도메인 소스 (~280 lines) |
| `.decode-x/spec-containers/transit/provenance.yaml` | provenance |
| `.decode-x/spec-containers/transit/rules/transit-rules.md` | 메인 rules.md |
| `.decode-x/spec-containers/transit/rules/TS-001.md` | BL-001 detail |
| `.decode-x/spec-containers/transit/rules/TS-002.md` | BL-002 detail |
| `.decode-x/spec-containers/transit/rules/TS-003.md` | BL-003 detail |
| `.decode-x/spec-containers/transit/rules/TS-004.md` | BL-004 detail |
| `.decode-x/spec-containers/transit/rules/TS-005.md` | BL-005 detail |
| `.decode-x/spec-containers/transit/rules/TS-006.md` | BL-006 detail |
| `.decode-x/spec-containers/transit/runbooks/TS-001.md` | runbook-001 |
| `.decode-x/spec-containers/transit/runbooks/TS-002.md` | runbook-002 |
| `.decode-x/spec-containers/transit/runbooks/TS-003.md` | runbook-003 |
| `.decode-x/spec-containers/transit/runbooks/TS-004.md` | runbook-004 |
| `.decode-x/spec-containers/transit/runbooks/TS-005.md` | runbook-005 |
| `.decode-x/spec-containers/transit/runbooks/TS-006.md` | runbook-006 |
| `.decode-x/spec-containers/transit/tests/TS-001.yaml` | test scenarios |

### 수정 파일

| 파일 | 변경 |
|------|------|
| `scripts/divergence/domain-source-map.ts` | DOMAIN_MAP 33번째 entry 추가 |
| `packages/utils/src/divergence/bl-detector.ts` | TS-001~006 registry 추가 |
| `packages/utils/src/divergence/rules-parser.ts` | TS prefix BL_ID_PATTERN 추가 |
| `packages/utils/test/bl-detector.test.ts` | TS-001~006 PRESENCE 단위 테스트 6건 + 177→183 count 갱신 |

## §4 상태 머신

```
trips: boarded → in_transit → transferred → completed
season_passes: [active] expired=0 → renewed=1 (batch)
transfers: [initiated] → completed (processTransfer atomic)
suspension_refunds: [initiated] → processed (processSuspensionRefund atomic)
```

## §5 DoD 체크리스트

- [ ] transit.ts ~280 lines, 6 함수 + TransitError
- [ ] spec-container/transit 15 sub-files (provenance + rules×7 + runbooks×6 + tests×1)
- [ ] DOMAIN_MAP 33번째 entry (container='transit')
- [ ] parser regex TS prefix (longer match first — TR보다 앞에 위치)
- [ ] REGISTRY TS-001~006 (withRuleId 31 Sprint 연속 정점)
- [ ] utils 177+6 = 183 PASS
- [ ] typecheck PASS (--force)
- [ ] detect-bl 33 containers, TS 0 ABSENCE
- [ ] write-provenance --apply 0 changes
