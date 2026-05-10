---
id: AIF-DESIGN-102
sprint: 304
feature: F470
plan: AIF-PLAN-102
title: Aviation 34번째 도메인 신규 — Design
status: active
created: 2026-05-10
---

# F470 Design — AIF-DESIGN-102

## §1 개요

Sprint 303 (F469 Transit) 동일 패턴으로 Aviation 합성 도메인을 추가한다.

- **34번째 도메인**, 23번째 신규 산업
- 신규 detector 0개 — withRuleId 재사용 32 Sprint 연속 정점
- 6 BL: Threshold × 2 + Atomic × 2 + Status × 2

## §2 BL 설계

| BL | 함수 | Detector | 패턴 |
|----|------|----------|------|
| AV-001 | `boardPassenger()` | ThresholdCheck | Path A UPPERCASE `MAX_PASSENGER_CAPACITY` |
| AV-002 | `allocateFuel()` | ThresholdCheck | Path B var-vs-var `fuelQuotaLimit` (`limit` keyword) |
| AV-003 | `dispatchFlight()` | AtomicTransaction | schedule+crew+fuel+clearance |
| AV-004 | `transitionFlightStatus()` | StatusTransition | scheduled→boarding→departed→in_flight→landed→completed |
| AV-005 | `rotateCrewSchedule()` | StatusTransition | batch (CC-005 23번째 재사용) |
| AV-006 | `processBaggageClaim()` | AtomicTransaction | baggage_claims+damage_assessments+compensation_records |

## §3 파일 매핑

| 파일 | 변경 유형 |
|------|---------|
| `반제품-스펙/.../src/domain/aviation.ts` | 신규 (281 lines) |
| `.decode-x/spec-containers/aviation/` | 신규 (15 sub-files) |
| `scripts/divergence/domain-source-map.ts` | 수정 (+1 entry, DOMAIN_MAP 34번째) |
| `packages/utils/src/divergence/rules-parser.ts` | 수정 (BL_ID_PATTERN에 AV 추가) |
| `packages/utils/src/divergence/bl-detector.ts` | 수정 (REGISTRY AV-001~AV-006 추가) |
| `packages/utils/test/bl-detector.test.ts` | 수정 (+6 tests, 183→189) |

## §4 spec-container 구조 (15 sub-files)

```
.decode-x/spec-containers/aviation/
├── provenance.yaml                  (1)
├── rules/
│   ├── aviation-rules.md            (1)
│   ├── AV-001.md                    (6)
│   ├── AV-002.md
│   ├── AV-003.md
│   ├── AV-004.md
│   ├── AV-005.md
│   └── AV-006.md
├── runbooks/
│   ├── AV-001.md                    (6)
│   ├── AV-002.md
│   ├── AV-003.md
│   ├── AV-004.md
│   ├── AV-005.md
│   └── AV-006.md
└── tests/
    └── AV-001.yaml                  (1)
```

## §5 DoD 검증 기준

- DoD 1: aviation.ts ~280 lines, 6 함수 + AviationError
- DoD 2: spec-container/aviation 15 files PRESENT
- DoD 3: DOMAIN_MAP.length === 34
- DoD 4: BL_ID_PATTERN includes `AV`
- DoD 5: BL_DETECTOR_REGISTRY has AV-001~AV-006 (총 6개)
- DoD 6-7: utils test 183→189 (vitest 284→284+6=290 wait — plan says 278+6)
  - Plan §DoD: 278+6=284 — total 284 PASS
- DoD 8: turbo typecheck --force PASS
- DoD 9: detect-bl 34 containers, 0 ABSENCE, coverage ≥ 91.8%
- DoD 10: write-provenance --apply 0 changes
- DoD 11: 23 산업 연속 0 ABSENCE
- DoD 12: Plan+Report+SPEC 업데이트
