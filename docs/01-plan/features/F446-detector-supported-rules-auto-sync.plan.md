---
id: AIF-PLAN-078
sprint: 280
feature: F446
title: write-provenance 자동 status 전환 — DETECTOR_SUPPORTED_RULES auto-sync (BL_DETECTOR_REGISTRY source of truth)
status: active
estimated_hours: 0.5
created: 2026-05-08
related: [AIF-PLAN-077]
req: AIF-REQ-035
related_features: [F445, F430, F427]
---

# F446 Plan — AIF-PLAN-078

## 목표

Sprint 279 F445에서 발견된 **write-provenance 자동 OPEN→RESOLVED 전환 미동작** 근본 원인 fix.

## 근본 원인 분석

`scripts/divergence/write-provenance.ts:130` logic:
```typescript
for (const ex of existing) {
  if (!DETECTOR_SUPPORTED_RULES.has(ex.ruleId)) continue;  // ← 핵심 차단
  ...
  if (ex.status === "OPEN" && autoCount === 0) {
    statusUpdates.push({ ruleId: ex.ruleId, from: "OPEN", to: "RESOLVED" });
  }
}
```

`DETECTOR_SUPPORTED_RULES`(provenance-cross-check.ts:51~)는 **manual whitelist**로 Sprint 260 F427 ~ Sprint 269 F436 P-007까지만 등록. 누락:

| 누락 ID | 출처 |
|---------|------|
| V-001~V-006 | Sprint 274 F440 (generic-voucher) |
| LP-001~LP-006 | Sprint 275 F441 (loyalty-points) |
| BL-042 | Sprint 277 F443 (lpon-cancel) |
| CC-001~CC-006 | Sprint 278 F444 (credit-card) |

**총 19개 누락** → 매 Sprint detector 추가 시 manual 동기화 필요. CC-001/002 자동 RESOLVED 전환 미동작은 이 단순 누락 때문.

## Fix 설계

`DETECTOR_SUPPORTED_RULES`를 `BL_DETECTOR_REGISTRY` source of truth로 자동 derive:

```typescript
// Before (Sprint 260 F427 ~ Sprint 269 F436)
export const DETECTOR_SUPPORTED_RULES = new Set<string>([
  "BL-024", "BL-026", ..., "P-007",  // 31 entries manual 유지
]);

// After (Sprint 280 F446)
import { BL_DETECTOR_REGISTRY } from "./bl-detector.js";
export const DETECTOR_SUPPORTED_RULES: ReadonlySet<string> = new Set(
  Object.keys(BL_DETECTOR_REGISTRY),
);
```

## DoD (8건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | DETECTOR_SUPPORTED_RULES 자동 sync | `Object.keys(BL_DETECTOR_REGISTRY)` 기반 derive. manual whitelist 31 entries 제거 |
| 2 | circular import 회피 | provenance-cross-check.ts → bl-detector.ts 단방향 (bl-detector가 cross-check import 0건 확인) |
| 3 | 타입 안전 | `ReadonlySet<string>` (frozen, 외부 mutation 불가) |
| 4 | 신규 unit test 5건 추가 | (a) registry === supported keys 일치, (b) CC-001 SUPPORTED, (c) BL-042/V-001/LP-001 SUPPORTED, (d) 미등록 NOT supported, (e) crossCheck CC-001 OPEN→RESOLVED 권고 |
| 5 | utils 174 → 179 unit test PASS (+5 신규, 회귀 0) | `pnpm exec vitest run` |
| 6 | typecheck PASS | `pnpm exec tsc --noEmit -p packages/utils` (turbo 우회) |
| 7 | crossCheck 동작 검증 | CC-001 OPEN + autoMarkers=[] → recommendedStatus="RESOLVED", detectorSupported=true (이전엔 false) |
| 8 | Plan + Report + SPEC §6 Sprint 280 + F446 등록 | AIF-PLAN-078 + AIF-RPRT-078 |

## Scope

### In Scope
- `provenance-cross-check.ts` DETECTOR_SUPPORTED_RULES auto-sync
- unit test 5건
- Plan + Report

### Out of Scope
- `resolvedBy`/`resolvedAt` 자동 추가 logic (provenance-writer.ts updateMarkerStatus 확장 — 별도 후속)
- credit-card provenance.yaml 갱신 (Sprint 279 manual fix 유지)
- 신규 detector 추가
- 기존 manual whitelist 보존 (전체 제거)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | Circular import (bl-detector ↔ provenance-cross-check) | bl-detector.ts가 provenance-cross-check.ts import 0건 사전 검증 (one-way dependency 보장) |
| R2 | BL_DETECTOR_REGISTRY 키 변경/제거 시 SUPPORTED 자동 변화 | 의도된 동작 — 새 detector 등록/제거가 SUPPORTED에 즉시 반영. 회귀 위험 없음 (registry 변경 자체가 의도적) |
| R3 | Module load 시점 1회 derive, 동적 추가 안 됨 | acceptable — 런타임 동적 detector 추가 use case 없음 |
| R4 | 회귀 (기존 31 IDs 누락 우려) | unit test (a) registry keys === supported keys 검증. BL_DETECTOR_REGISTRY에 31 IDs 모두 존재 |

## Implementation Steps

1. `provenance-cross-check.ts` import + DETECTOR_SUPPORTED_RULES auto-sync
2. unit test 5건 추가 (`packages/utils/test/bl-detector.test.ts`)
3. `pnpm exec vitest run` (179/179 PASS 검증)
4. `pnpm exec tsc --noEmit -p packages/utils` (turbo 우회 PASS)
5. SPEC §6 Sprint 280 + F446 등록
6. Plan + Report 작성
7. Commit + push

## 산출물

- Plan: `docs/01-plan/features/F446-detector-supported-rules-auto-sync.plan.md` (AIF-PLAN-078, 본 문서)
- Report: `docs/04-report/features/sprint-280-F446.report.md` (AIF-RPRT-078)
- Code:
  - `packages/utils/src/divergence/provenance-cross-check.ts` (manual whitelist 31 entries 제거 + auto-sync 1줄)
  - `packages/utils/test/bl-detector.test.ts` (F446 describe block + 5 unit test)
- SPEC: §6 Sprint 280 블록 + F446 체크박스

## Success Criteria

- DoD 8/8 PASS
- utils 179/179 unit test PASS (174 → +5, 회귀 0)
- typecheck PASS
- circular import 0건

## 메타

- **source of truth 단일화** — 매 Sprint detector 추가 시 `DETECTOR_SUPPORTED_RULES` 동기화 누락 방지
- **이전 누락 19개 ID 자동 supported 회복** — V/LP/BL-042/CC 자동 status 전환 가능
- **detector 추가 완전 자동화** — 신규 detector 등록 시 `BL_DETECTOR_REGISTRY` 갱신만으로 cross-check + write-provenance 자동 인식
