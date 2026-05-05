---
id: AIF-RPRT-055
title: "F424 — TD-62 web-tree-sitter Workers PoC 완료 리포트"
sprint: 256
f_items: [F424]
plan: AIF-PLAN-055
design: AIF-DSGN-055
analysis: AIF-ANLS-055
match_rate: 100
status: DONE
created: "2026-05-05"
author: "Autopilot (session 268)"
---

# F424 완료 리포트 — TD-62 web-tree-sitter Workers PoC

## 요약

Sprint 256 F424 PoC **완료 — ✅ GO 판정**.

- **Match Rate**: 100% (DoD 8/8 충족)
- **비용**: $0 (LLM 호출 없음)
- **소요시간**: ~3h (Plan 예상 5h 대비 40% 절감)
- **핵심 성과**: CF Workers에서 web-tree-sitter 런타임 로딩 성공 + `--dry-run` PASS

## 달성 결과

| 지표 | 목표 | 실적 |
|------|------|------|
| wrangler dev 응답 | 200 OK | 200 OK, 5ms |
| Parser.init exports | 1+ | 152 |
| --dry-run 번들 크기 | 빌드 성공 | 430.64 KiB / gzip 121.25 KiB |
| Cloudflare code 10021 | 미발생 | ✅ 미발생 |
| Sprint 255 패턴 재현 | 회피 | ✅ 회피 |

## 확정 우회 패턴

```
패턴 조합 4종:
① wrangler.toml [alias]: web-tree-sitter → web-tree-sitter.cjs (ESM 회피)
② CJS patch: ENVIRONMENT_IS_NODE guard (nodejs_compat __dirname 오감지)
③ CJS patch: self.location?.href guard (CF Workers location 미정의)
④ [[rules]] type="CompiledWasm" + Parser.init({ instantiateWasm }) hook
```

## 신규 교훈 4건

1. emscripten nodejs_compat ENVIRONMENT_IS_NODE 오감지 (`process.versions.node` polyfill)
2. CF Workers `WebAssembly.instantiate(bytes)` 런타임 compilation 금지 → CompiledWasm 필수
3. `instantiateWasm` hook = emscripten WASM 로딩 표준 우회 진입점
4. `[alias]` wrangler.toml = emscripten ESM/CJS 선택 강제의 표준 패턴

## 다음 액션 — Sprint 257

F358 Phase 2 재시도:
- Sprint 255 PR #50 코드 패턴 재활용 + 4종 패턴 적용
- `patch-package` + `svc-ingestion/wrangler.toml` 갱신
- wrangler dev → staging deploy validation → PR
- 예상 작업: ~3h
