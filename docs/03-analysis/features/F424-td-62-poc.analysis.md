---
id: AIF-ANLS-055
title: "F424 — TD-62 web-tree-sitter Workers PoC Gap Analysis"
sprint: 256
f_items: [F424]
plan: AIF-PLAN-055
design: AIF-DSGN-055
match_rate: 100
status: DONE
created: "2026-05-05"
author: "Autopilot (session 268)"
---

# F424 Gap Analysis — TD-62 web-tree-sitter Workers PoC

## Match Rate: 100%

| DoD | 항목 | 결과 | 검증 방법 |
|-----|------|:----:|----------|
| (a) | reports/td-62-poc-2026-05-05.md 존재 + 패턴별 시도 + 권고 | ✅ | 파일 존재 (191줄, 7섹션) |
| (b) | wrangler dev PASS + Parser.init 성공 | ✅ | GET / 200 OK 5ms, exports=152, log full |
| (c) | wrangler deploy --dry-run PASS | ✅ | Total Upload: 430.64 KiB, 10021 미발생 |
| (d) | SPEC §8 TD-62 갱신 | ✅ | TD-62 row: 🟡→✅ RESOLVED |
| (e) | 모든 패턴 fail 시 fork 권고 | ✅ | N/A (PASS — fork 불필요) |
| (f) | Match Rate ≥ 90% | ✅ | 100% |
| (g) | typecheck 14/14 + lint 9/9 | ✅ | FULL TURBO (66ms) |
| (h) | F424 DONE + TD-62 RESOLVED | ✅ | SPEC §6 + §8 갱신 완료 |

## 구현 대비 Design 매핑

| Design 항목 | 구현 | 일치 |
|------------|------|:---:|
| §3.1 옵션 A — esbuild --define | 분석 기반 차단 (CJS 선택) | ○ |
| §3.2 옵션 B — package.json cjs alias | `[alias] web-tree-sitter → CJS` 적용 | ✅ |
| §3.3 옵션 C — patch-package | `patches/web-tree-sitter+0.26.8.patch` 생성 | ✅ |
| §2.1 격리 환경 | `scripts/poc/td-62/` 구조 완성 | ✅ |
| §2.2 검증 기준 | exports=152 + 200 OK | ✅ |
| §4 구현 파일 목록 | 6/6 파일 존재 | ✅ |
| §5 테스트 계약 | wrangler dev PASS + --dry-run PASS | ✅ |

## 추가 발견 (Design 외)

1. **CJS 파일 2-patch 필요**: Design에서는 `self.location.href` 1종만 예측. 실제로 `ENVIRONMENT_IS_NODE` 오감지(`typeof __dirname !== "undefined"` guard) 추가 필요 발견.
2. **type="Data" → type="CompiledWasm" 전환**: CF Workers 런타임 WASM compilation 금지 → `[[rules]] type="CompiledWasm"` + `instantiateWasm` hook 패턴으로 해결. Design §2.2에서 `wasmBinary` 전달로 예측했으나 실제는 `instantiateWasm` hook이 필요.
3. **`instantiateWasm` hook argument 순서**: `receive(instance, module)` — emscripten CJS wrapper 소스 분석으로 확인.

## Sprint 257 진입 조건 충족

✅ TD-62 RESOLVED — F358 Phase 2 재시도 GO 판정

적용 패턴 (Sprint 255 PR #50 코드 재활용 + 4종 패턴 적용):
1. `patches/web-tree-sitter+0.26.8.patch` 생성 + `patch-package` postinstall
2. `packages/utils/wrangler.toml` 또는 `svc-ingestion/wrangler.toml` `[alias]` + `[[rules]] type="CompiledWasm"`
3. `loader-workers.ts` `instantiateWasm` hook으로 변경
4. `wrangler dev` 로컬 검증 → staging deploy validation → PR
