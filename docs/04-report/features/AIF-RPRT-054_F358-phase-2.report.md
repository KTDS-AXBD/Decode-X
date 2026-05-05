---
id: AIF-RPRT-054
title: "F358 Phase 2 Report — Tree-sitter Java parser production 통합 완결"
sprint: 255
f_items: [F358, F361]
req: AIF-REQ-035
plan: AIF-PLAN-054
design: AIF-DSGN-054
analysis: AIF-ANLS-054
td: [TD-26, TD-28]
status: DONE
created: "2026-05-05"
author: "Master (session 267, post-merge retroactive)"
retroactive: true
retroactive_reason: "autopilot이 코드 구현은 완결했으나 PDCA Report 미작성. PR #50 MERGED 후 Master inline 작성."
---

# F358 Phase 2 Report — Tree-sitter Java parser production 통합

## 결과 요약

| 항목 | 결과 |
|------|------|
| Sprint | 255 |
| 최종 status | 🔴 **REVERTED** (PR #50 MERGED → main revert, 세션 267) |
| F-items | F358 Phase 2 PARTIAL_FAIL + F361 PARTIAL_FAIL |
| TD 해소 | TD-26 ❌ (revert로 미해소), TD-28 부분 (Phase 1 PoC만), **TD-62 신규 등록** |
| PR | #50 MERGED → main revert |
| autopilot 자체 Match | 100% |
| Master 코드+거버넌스 Match | 95% |
| **Master Production 동작 Match** | **0%** (Workers cold-start fail) |
| typecheck/lint/test | 14/14 + 9/9 + 365/365 + 78/78 PASS (revert 전) |
| CI (PR #50 MERGE 전) | E2E + Typecheck + Migration 전체 PASS |
| **Production deploy** | **❌ FAILED** (Cloudflare API code 10021, web-tree-sitter `import.meta.url` undefined) |

## DoD 달성

| DoD 항목 | 결과 |
|---------|------|
| `packages/utils/src/java-parsing/` 4 file | ✅ 5 file (loader/loader-workers/extractor/types/index) |
| WASM 파일 packages/utils/wasm/ 위치 + workspace export | ✅ |
| `services/svc-ingestion/src/parsing/java-controller.ts` Tree-sitter 호출 | ✅ |
| `services/svc-ingestion/wrangler.toml` 3 env `[[rules]]` 추가 | ⚠️ top-level 1회 (env inheritance로 정상 동작) |
| PoC 5 sample silent drift 0건 회귀 검증 | ✅ unit test 10건으로 대체 입증 (3/4 결함 해소, 1건 Phase 3 자연 검증) |
| multi-path + Map<K,V> 신규 케이스 PASS | ✅ |
| unit test ≥10건 PASS | ✅ 10/10 (java-controller) + 6/6 (java-parsing) |
| Workers E2E (wrangler dev + production) 각 1건 PASS | ❌ autopilot 미수행 → Sprint 256 Phase 3 자연 검증 이관 |
| typecheck 14/14 + lint 9/9 + test 전 통과 | ✅ |
| Match Rate ≥90% | ✅ 95% (Master 독립) |
| F361 status DONE | ✅ |
| TD-26 해소 마킹 | ✅ |

## 산출물

| 파일 | 설명 |
|------|------|
| `packages/utils/src/java-parsing/loader.ts` | Tree-sitter Parser/Language 초기화 + singleton |
| `packages/utils/src/java-parsing/loader-workers.ts` | Workers 전용 wrapper (`[[rules]] type="Data"` import) |
| `packages/utils/src/java-parsing/extractor.ts` | AST 추출 (PoC 이전 + multi-path + Map<K,V>) |
| `packages/utils/src/java-parsing/types.ts` | ClassInfo / Endpoint / FieldInfo / Annotation |
| `packages/utils/src/java-parsing/index.ts` | barrel export |
| `packages/utils/wasm/tree-sitter-java.wasm` | 405KB grammar |
| `packages/utils/wasm/web-tree-sitter.wasm` | 192KB runtime |
| `packages/utils/src/__tests__/java-parsing.test.ts` | 6 cases |
| `services/svc-ingestion/src/parsing/java-controller.ts` | Tree-sitter 호출 (50줄, regex 288줄 제거) |
| `services/svc-ingestion/src/__tests__/java-controller.test.ts` | 10 cases (기존 7 + 신규 3) |
| `services/svc-ingestion/src/index.ts` | top-level await initJavaParserWorkers |
| `services/svc-ingestion/wrangler.toml` | `[[rules]] type="Data"` |
| `docs/01-plan/features/F358-phase-2.plan.md` | AIF-PLAN-054 (Master 사전 작성) |
| `docs/02-design/features/F358-phase-2.design.md` | AIF-DSGN-054 (Master retroactive) |
| `docs/03-analysis/features/AIF-ANLS-054_F358-phase-2.analysis.md` | AIF-ANLS-054 (Master retroactive) |
| 이 문서 | AIF-RPRT-054 (Master retroactive) |

## 주요 발견

### 1. autopilot이 Plan보다 정확한 기술 판단 — `Data` vs `CompiledWasm` ✅
Plan에 명시한 `CompiledWasm`이 Tree-sitter API와 incompatible(Language.load는 raw Uint8Array 필요)함을 자율 감지하여 `Data`로 정정. 향후 PDCA Plan 단계에서 wrangler `[[rules]]` 타입 결정은 동적 재평가 권장.

### 2. autopilot Production Smoke Test 12회차 변종 패턴 🟠
Plan DoD `(d)` "wrangler dev + production deploy 양쪽 Workers E2E 1건 PASS" → autopilot이 unit test 12/12 PASS로 대체 보고. 메모리의 누적 패턴 (rules/development-workflow.md "Autopilot Production Smoke Test"). **분리 검증 권장**: Master는 production smoke 독립 실측 필수.

### 3. PDCA 4종 강제 정착 필요 🟡
Plan이 main에 사전 존재할 경우 autopilot이 Design/Analysis/Report 신규 작성 누락. **개선 후보**: Plan 사전 작성 시 .sprint-context에 `PDCA_REQUIRED=design,analysis,report` 명시 추가하여 autopilot에게 신호.

### 4. loader vs loader-workers 분리 패턴 — 3 환경 양립 ✅
Workers/Node/Vitest 3 환경 양립을 위해 .wasm import를 `loader-workers.ts`로 격리하고 `vi.mock`으로 우회. PoC 단일 파일 패턴에서 production-grade 분리로 자연 진화.

### 5. isController() regex fallback 안전망 ✅
Tree-sitter parser 미초기화 케이스를 위한 정규식 fallback. autopilot이 production 신뢰성 선제 판단.

## 잔여 위험

| 위험 | 대응 |
|------|------|
| Workers wrangler dev/production 실 환경 WASM 로드 미검증 | Sprint 256 Phase 3 LPON 전수 재추출에서 자연 검증. 분리 시 Master inline 또는 별도 단일 PR |
| wrangler.toml staging/production env에 `[[rules]]` 별도 명시 없음 | 현 동작 정상 (env inheritance). wrangler 정책 변경 시 brittle 가능성 있어 Sprint 256에 추가 보강 후보 |
| java-service.ts / java-datamodel.ts / mybatis-mapper.ts 잔존 regex (Sprint 255 Out-of-scope) | Sprint 256+ 후속 (P3, scope 폭주 방지) |
| Tree-sitter constant reference 미해결 (`@RequestMapping(BASE_PATH + "/x")` 등) | Plan에서 명시한 Tree-sitter 한계. 후속 케이스 발견 시 ad-hoc 처리 |

## Phase 3 권고사항 (Sprint 256)

1. **LPON 전수 production 재추출** — R2의 Java 파일 전수에 새 Tree-sitter 파서 적용. `policies` / `code_endpoints` 테이블 변경량 측정.
2. **DIVERGENCE 5건 (TD-24) 재실측** — Phase 2 적용 후 PRD↔Code mismatch 5건이 해소되었는지 측정. 자연 해소 시 TD-24 ✅ 마킹.
3. **F356-A 수기 검증 결합** — Tree-sitter 적용 후 첫 파일럿 도메인의 수기 ground truth 비교.
4. **Workers wrangler dev/production E2E** — Phase 2 DoD `(d)` 보강 검증 (단일 R2 fetch + Queue 처리 + D1 결과 확인 1건).
5. **TD-28 완전 해소 마킹** — Phase 2 + Phase 3 결합 시 TD-28 root cause 완결.

## 결론 (REVERTED)

🔴 **Sprint 255 PR #50 MERGED → REVERTED**. autopilot 자체 Match=100%/CI green/unit test PASS 자체 보고했으나 Master post-merge 검증에서 production deploy validation FAILED 발견. **autopilot Production Smoke Test 13회차 정확 재현** (rules/development-workflow.md 누적). 

Production downtime 0 (Cloudflare가 새 버전 검증 reject로 이전 안정 버전 유지) → revert가 안전한 선택. 코드 자산 (5 file + 2 WASM + svc-ingestion 통합) + PDCA 4종 + SPEC 갱신은 학습 자산으로 보존.

**다음 Sprint 256 진입 조건**:
1. **TD-62 선결** (web-tree-sitter Workers import.meta.url 호환성 PoC) — `wrangler dev`에서 단독 import 부팅 + polyfill/alias 패턴 정립
2. F358 Phase 2 재시도 — 본 PR 코드 패턴 + TD-62 fix 결합
3. Phase 3 (LPON production 재추출 + TD-24 DIVERGENCE 5건 + F356-A 결합)는 Phase 2 정상화 후

**핵심 교훈** (rules/development-workflow.md 후보 추가):
- autopilot CI green ≠ production deploy validation green. wrangler dev 또는 production deploy validation step을 Sprint DoD에 명시 필수.
- emscripten 자동 생성 ESM 코드는 Workers ESBuild bundle에서 `import.meta.url` 미정의로 fail 가능 — npm dependency 추가 시 사전 PoC 권장.

## 참조

- AIF-PLAN-054 (`docs/01-plan/features/F358-phase-2.plan.md`)
- AIF-DSGN-054 (`docs/02-design/features/F358-phase-2.design.md`)
- AIF-ANLS-054 (`docs/03-analysis/features/AIF-ANLS-054_F358-phase-2.analysis.md`)
- PR #50 (`eb1eda7`)
- PoC: AIF-PLAN-053 / AIF-DSGN-053 / AIF-ANLS-053 / AIF-RPRT-053 (Sprint 254 Phase 1)
