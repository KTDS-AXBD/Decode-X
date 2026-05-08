---
id: AIF-RPRT-078
sprint: 280
feature: F446
title: DETECTOR_SUPPORTED_RULES auto-sync — 실행 보고서 (write-provenance 자동 status 전환 회복)
status: completed
created: 2026-05-08
related_plan: AIF-PLAN-078
match_rate: 95
mode: Master inline
---

# F446 Report — AIF-RPRT-078

## 실행 결과

| # | DoD | 결과 | 비고 |
|---|-----|------|------|
| 1 | DETECTOR_SUPPORTED_RULES auto-sync | ✅ | `new Set(Object.keys(BL_DETECTOR_REGISTRY))`, manual 31 entries 제거 |
| 2 | circular import 회피 | ✅ | bl-detector.ts에서 provenance-cross-check.ts import 0건 사전 검증, one-way dependency |
| 3 | 타입 안전 (ReadonlySet) | ✅ | `ReadonlySet<string>` typing |
| 4 | unit test 5건 신규 | ✅ | F446 describe block — (a) keys 일치, (b) CC-001, (c) BL-042/V-001/LP-001, (d) 미등록, (e) crossCheck CC-001 OPEN→RESOLVED 권고 |
| 5 | utils 179/179 PASS (174 → +5 신규, 회귀 0) | ✅ | `pnpm exec vitest run` |
| 6 | typecheck PASS | ✅ | utils 0 errors (turbo 우회) |
| 7 | crossCheck 동작 검증 | ✅ | CC-001 OPEN + autoMarkers=[] → detectorSupported=true (이전 false), recommendedStatus="RESOLVED" |
| 8 | SPEC + Plan + Report | ✅ | AIF-PLAN-078 + AIF-RPRT-078 + (commit 시점 SPEC) |

**DoD 8/8 PASS — Match Rate 95%**

## 핵심 결과

### Before (Sprint 269까지 manual 유지)

`DETECTOR_SUPPORTED_RULES` Set: 31 entries (BL-024 ~ P-007까지 hardcoded). Sprint 274~278에 추가된 19개 detector(V/LP/BL-042/CC) 누락 → write-provenance가 SUPPORTED 검증에서 차단되어 OPEN→RESOLVED 자동 전환 skip.

### After (Sprint 280)

```typescript
import { BL_DETECTOR_REGISTRY } from "./bl-detector.js";
export const DETECTOR_SUPPORTED_RULES: ReadonlySet<string> = new Set(
  Object.keys(BL_DETECTOR_REGISTRY),
);
```

→ 51 detector entries 모두 자동 SUPPORTED. 신규 detector 등록 시 `BL_DETECTOR_REGISTRY`만 갱신하면 cross-check + write-provenance 자동 인식.

## 검증

### Unit Test (5건 신규)

```
F446 — DETECTOR_SUPPORTED_RULES auto-sync (Sprint 280)
  ✓ includes ALL BL_DETECTOR_REGISTRY ruleIds (no manual whitelist drift)
  ✓ CC-001 (Sprint 278) is now SUPPORTED (ABSENCE→RESOLVED 자동 전환 가능)
  ✓ BL-042 (Sprint 277), V-001 (Sprint 274), LP-001 (Sprint 275) all SUPPORTED
  ✓ 미등록 ID는 NOT supported (UNKNOWN cross-check 분기 유지)
  ✓ crossCheck: PRESENCE 자동 입증 시 OPEN→RESOLVED 권고 (CC-001 시뮬레이션)
```

전체 174 → **179/179 PASS** (회귀 0).

### crossCheck 시뮬레이션 검증

```typescript
const yamlText = `divergenceMarkers:
  - marker: DIVERGENCE
    ruleId: CC-001
    status: OPEN
`;
const recs = crossCheck(yamlText, []);  // autoMarkers 빈 배열 = PRESENCE 자동 입증
// Before Sprint 280: recs[0].detectorSupported === false (CC-001 미지원으로 UNKNOWN 분류)
// After Sprint 280:  recs[0].detectorSupported === true + recommendedStatus === "RESOLVED"
```

## Code 변경

### `packages/utils/src/divergence/provenance-cross-check.ts`

- import: `import { BL_DETECTOR_REGISTRY } from "./bl-detector.js";` 1줄 추가
- DETECTOR_SUPPORTED_RULES: 31 entries hardcoded Set → `new Set(Object.keys(BL_DETECTOR_REGISTRY))` 1줄 + 주석 갱신
- 유효 변경: -52 +14 lines

### `packages/utils/test/bl-detector.test.ts`

- import: `DETECTOR_SUPPORTED_RULES` 추가 import
- F446 describe block 5 unit test 신규 (~50 lines)

## 시간 / 비용

- 작업 소요: ~30분 (Master inline)
- LLM cost: $0

## 메타 학습

- **source of truth 단일화** (BL_DETECTOR_REGISTRY → DETECTOR_SUPPORTED_RULES auto-derive) — 매 Sprint manual 동기화 누락 위험 제거
- **manual drift 방지 패턴 정착** — register-once → propagate 자동. 이후 detector 추가 시 단일 location(`BL_DETECTOR_REGISTRY`)만 갱신
- **circular import 회피 검증 사전 절차** — `grep import.*<target>` 1줄 grep으로 빠른 사전 점검
- **detector 확장 사이클 단축** — Sprint 278 ABSENCE 발견 → S279 detector logic fix → S280 SUPPORTED auto-sync. 3 Sprint cascade로 detector 신뢰도 시스템 완성

## 차기 후보

1. **resolvedBy/resolvedAt 자동 추가** — `updateMarkerStatus` 확장하여 OPEN→RESOLVED 시 resolvedBy/resolvedAt 메타필드 자동 추가 (manual annotation 없이 RESOLVED 이력 보존)
2. **신규 산업 도메인 시리즈** — Delivery, Subscription, Insurance (LPON 외 산업 다양성 + detector 추가 자동 SUPPORTED)
3. Phase 4 후속 / 보안 후속 2건
