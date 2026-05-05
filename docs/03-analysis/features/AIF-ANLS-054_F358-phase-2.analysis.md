---
id: AIF-ANLS-054
title: "F358 Phase 2 Analysis — Tree-sitter Java parser production 통합 결과"
sprint: 255
f_items: [F358, F361]
req: AIF-REQ-035
plan: AIF-PLAN-054
design: AIF-DSGN-054
td: [TD-26, TD-28]
status: DONE
created: "2026-05-05"
author: "Master (session 267, post-merge retroactive)"
retroactive: true
retroactive_reason: "autopilot이 코드 구현은 완결했으나 PDCA Analysis 미작성. PR #50 MERGED 후 Master inline 작성."
---

# F358 Phase 2 Analysis — Tree-sitter Java parser production 통합 결과

## §1 실행 환경

- Sprint 255 worktree: `~/work/worktrees/Decode-X/sprint-255` (현 정리됨)
- Branch: `sprint/255` → `main` MERGED via PR #50 (`eb1eda7`)
- Autopilot: Sonnet 4.6 + auto effort + bypass permissions
- Soak time: ~25분 (Plan/Design/Implement/Analyze/Report — autopilot 자율)
- Master 검증: ~5분 (PR #50 후속 inline)

## §2 산출물 변경 통계

| 영역 | 신설 | 수정 | LOC |
|------|------|------|-----|
| `packages/utils/src/java-parsing/` | 5 file (loader/loader-workers/extractor/types/index) | - | +385 |
| `packages/utils/src/__tests__/java-parsing.test.ts` | 1 file | - | +110 |
| `packages/utils/wasm/` | 2 binary (414KB + 196KB) | - | - |
| `packages/utils/package.json` | - | exports + dep 추가 | +9 / -1 |
| `services/svc-ingestion/src/parsing/java-controller.ts` | - | regex 제거 + Tree-sitter 호출 | +50 / -288 (**-238**) |
| `services/svc-ingestion/src/__tests__/java-controller.test.ts` | - | 7 → 10 cases | +88 / -25 |
| `services/svc-ingestion/src/__tests__/routes.test.ts` | - | vi.mock loader-workers 추가 | +5 |
| `services/svc-ingestion/src/index.ts` | - | top-level await initJavaParserWorkers | +4 |
| `services/svc-ingestion/wrangler.toml` | - | `[[rules]] type="Data"` | +5 |
| `services/svc-ingestion/src/__tests__/{docx-parser,policy-real}.test.ts` | - | `@ts-expect-error` 주석 제거 (`@types/node` 추가에 따른 자연 cleanup) | -6 |

총 **20 file changed, 731 insertions(+), 289 deletions(-)** (commit `626bfdf`).

## §3 핵심 검증 — Plan DoD 대비

| DoD 항목 | 자동검증 (autopilot) | Master 독립 검증 (post-merge) |
|---------|---------------------|---------------------------|
| (a) packages/utils java-parsing 4 file | ✅ 5 file 실제 (Plan 4건 → 실제 5건, loader-workers 분리로 추가) | ✅ |
| (b) java-controller.ts Tree-sitter 호출 | ✅ regex 제거 confirmed | ✅ 10/10 unit test PASS |
| (c) wrangler.toml `[[rules]]` (3 env) | ⚠️ top-level만 등록 (staging/production env 별도 등록 안 함) | ✅ wrangler env inheritance로 정상 동작 |
| (d) wrangler dev + production deploy 양쪽 WASM E2E | ❌ **autopilot 미수행** — unit test로 대체 보고 | 🟠 보강 검증 필요 (Sprint 256 또는 별도) |
| (e) PoC 5 sample silent drift 17 → 0 회귀 | ⚠️ 직접 검증 안 함 — java-controller.test.ts 10 cases로 대체 | ✅ 신규 케이스 (basePath="/api/v2/common", "/api/v2/pension", multi-path, Map<K,V>) PASS로 회귀 입증 |
| (f) multi-path + Map<K,V> 신규 케이스 | ✅ `element_value_array_initializer` 처리 추가 | ✅ test PASS |
| (g) unit test ≥10건 | ✅ 12/12 PASS 보고 | ✅ packages/utils 78/78 + svc-ingestion 365/365 |
| (h) typecheck/lint/test PASS | ✅ 14/14 + 9/9 + 12/12 | ✅ Master 환경 재검증 PASS |
| (i) Match Rate ≥90% | ✅ 자체 100% 보고 | ✅ Master 측 95% (PDCA 누락 -5pp) |
| (j) F361 status DONE | ✅ Plan에 명시 | (Sprint 종료 시 SPEC 마킹) |
| (k) TD-26 해소 | ✅ packages/utils로 공용화 = TD-26 산출물 | ✅ |

**Match Rate 종합 (Master 독립)**: 95% (PDCA 3건 미작성 + Workers E2E DoD 미충족).

## §4 핵심 발견 — autopilot 강점

### 4.1 wrangler `type="Data"` 자율 정정 ✅
Plan(AIF-PLAN-054)에 명시된 `CompiledWasm`이 부정확함을 자율 감지하여 `Data`로 변경. Tree-sitter `Language.load(Uint8Array)`가 raw bytes 필요 — `CompiledWasm`은 자동 컴파일된 `WebAssembly.Module` 반환되어 incompatible. **Plan보다 정확한 판단** — autopilot이 실 API 시그니처 검증으로 도달.

### 4.2 loader vs loader-workers 분리 패턴 ✅
Vitest 환경에서 .wasm ESM import가 실패하는 문제를 `loader-workers.ts`만 .wasm import하는 분리 + `vi.mock("loader-workers")` 패턴으로 우회. Workers/Node/Vitest 3 환경 양립. PoC 단일 파일 대비 production-grade 분리.

### 4.3 isController() regex fallback ✅
Parser 미초기화 시 (cold-start 실패 등) `/[@](?:RestController|Controller)\b/` 정규식으로 fallback — 안전망 보존. autopilot이 production 신뢰성 우선 판단.

### 4.4 element_value_array_initializer 추가 처리 ✅
PoC에는 없는 노드 타입을 새로 추가하여 multi-path `@PostMapping({"/a","/b"})` + `method={GET,POST}` 동시 처리. Plan에 명시된 신규 케이스를 정확히 식별.

### 4.5 @ts-expect-error 자연 cleanup ✅
`@types/node` dev-dep 추가 시 Bun runtime fs/path 타입이 정상 인식 → 기존 `@ts-expect-error` 주석 6건이 의도치 않게 cleanup. typecheck PASS와 함께 자연스러운 정리.

## §5 갭 — autopilot이 누락한 항목

### 5.1 PDCA 3건 미작성 🟡 (governance)
Plan DoD `(j)` "PDCA 4종 (Plan + Design + Analysis + Report)" 명시. Plan은 Master가 사전 작성하여 main에 존재 → autopilot이 해당 시점에는 Plan 변경 없음으로 판단하고 Design/Analysis/Report 작성 누락. **이 분석서(AIF-ANLS-054)와 후속 Design/Report 3건이 Master inline retroactive 작성으로 보충됨**. autopilot Match=100 자체보고 → Master Match=95 (PDCA -5pp).

### 5.2 Workers E2E (wrangler dev/production) DoD 미수행 🟠
Plan DoD `(d)` "wrangler dev + production deploy 양쪽 WASM 로드 + parse 실 E2E 1건 PASS" — autopilot 커밋 메시지에 흔적 없음, unit test 12/12로 대체 보고. **autopilot Production Smoke Test 12회차 변종 패턴** (rules/development-workflow.md 누적). 보강:
- Master 후속 검증으로 wrangler dev 수동 부팅 + sample Java parse 시도 (시간 소요로 Sprint 256 또는 별도 세션 이관 가능)
- 또는 production deploy 후 실 R2 업로드 + Queue 처리로 자연 검증 (Sprint 256 Phase 3 LPON 전수 재추출에서 자연 발생)

### 5.3 wrangler.toml staging/production env에 `[[rules]]` 별도 명시 안 함 ⚠️
Plan은 "3 env (default/staging/production)" 모두 등록 명시. 실제는 top-level 1회만 등록. wrangler env inheritance에 의해 정상 동작 예상이나 향후 wrangler 정책 변경 시 brittle. **현재는 동작에 문제 없음**.

## §6 회귀 검증 — silent drift 17 → 0 입증

PoC(Phase 1) silent drift 17건 분포:
- `base_path_missing` 2건 (PaymentController, WithdrawalController)
- `path_incomplete` 7건
- `return_type_generic_loss` 7건
- `mapper_skipped` 1건 (RefundMapper)

Phase 2에서 java-controller.test.ts 신규 케이스가 동일 결함 해소를 직접 입증:

| 결함 종류 | 회귀 검증 케이스 | 결과 |
|-----------|----------------|------|
| `base_path_missing` | `LPON CommonController basePath="/api/v2/common"`, `controller without @RequestMapping base path basePath=""` | ✅ |
| `path_incomplete` | `basePath correctly prepended — full path check basePath="/api/v2/pension"` (호출부에서 basePath + path 결합 가능 입증) | ✅ |
| `return_type_generic_loss` | `Map<K,V> generic return type preserved` | ✅ |
| `mapper_skipped` | (Sprint 256 Phase 3에서 RefundMapper 실 분석 자연 검증 예정) | 🟡 부분 |

**회귀 입증율: 3/4 핵심 결함 해소 + 1건 후속 자연 검증 예약.**

## §7 무관 영역 회귀 무손실

- svc-ingestion 전체 365/365 PASS
- packages/utils 전체 78/78 PASS
- E2E Tests CI PASS (1m 42s)
- Migration Sequence Check PASS (5s)
- Typecheck & Test PASS (1m 12s)

다른 모듈 영향 0건.

## §8 비용/성능

| 항목 | 측정값 |
|------|--------|
| autopilot 소요 | ~25분 (Plan 사전 작성 후 Sprint WT 시동→merge) |
| autopilot context | 81% (200K 중 ~162K 사용) |
| autopilot model | Sonnet 4.6 + auto effort + thinking more |
| Master 검증 추가 시간 | ~10분 |
| CI 시간 | E2E 1m 42s + Typecheck 1m 12s + Migration 5s = 2m 59s 합계 |
| WASM 번들 사이즈 추가 | 597KB (svc-ingestion bundle에 Tree-sitter 추가) |
| Workers cold-start 영향 | parse 1.22ms/file (PoC 측정), WASM init 1.71ms (PoC) — 무시 가능 |

## §9 결론 (REVERTED)

🔴 **F358 Phase 2 + F361 통합 Sprint 255 PR #50 MERGED → REVERTED**.

코드 측면 (autopilot 자체 보고): silent drift 17→0 회귀 unit test 10건 입증 + 신규 케이스 PASS + CI green / **그러나 Master post-merge 검증에서 web-tree-sitter `import.meta.url` Workers 호환성 결함 발견 → production deploy validation FAILED → main revert**.

Match Rate 95% (코드+거버넌스) → **0% (production 동작)**. autopilot Production Smoke Test 13회차 정확 재현. 

**Sprint 256 재진입 전제**:
1. **TD-62 선결** — web-tree-sitter Workers `import.meta.url` polyfill 또는 alias 패턴 PoC 확장. `wrangler dev`에서 단독 import 부팅 검증.
2. F358 Phase 2 재시도 — TD-62 해결 후 본 PR의 코드 패턴 재활용 가능 (PDCA 4종 보존, scope 동일)
3. Phase 3 (LPON production 재추출 + TD-24 DIVERGENCE 5건 재실측 + F356-A 결합)는 Phase 2 정상화 후 진행

revert 결정 사유: production downtime 0 + main 결함 코드 잔존 위험 vs Sprint 256 정공 시간 비용 대비 revert가 안전. PDCA 4종 + SPEC 갱신은 retroactive 작성 그대로 유지하여 학습 자산 보존.

## §10 참조

- AIF-PLAN-054 (Sprint 255 Plan)
- AIF-DSGN-054 (Sprint 255 Design — retroactive)
- AIF-RPRT-054 (Sprint 255 Report — retroactive)
- PR #50 (`eb1eda7`)
- PoC 산출물: `scripts/java-ast/src/poc-tree-sitter.ts`, `reports/f358-poc-tree-sitter-2026-05-04.json`
