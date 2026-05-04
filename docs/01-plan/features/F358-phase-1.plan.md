---
id: AIF-PLAN-053
title: "F358 Phase 1 — Tree-sitter Java 파서 Workers 호환성 PoC"
sprint: 254
f_items: [F358]
req: AIF-REQ-035
td: [TD-28]
status: DONE
created: "2026-05-04"
author: "Sprint Autopilot"
---

# F358 Phase 1 — Tree-sitter Java 파서 Workers 호환성 PoC

## Background

AIF-REQ-035 Phase 3 S-3 (F358, P1). `scripts/java-ast/src/runner.ts`의 regex CLI Java 파서(TD-28)가 PRD↔Code silent drift의 근본 원인이다.

**주요 결함**:
1. Class-level `@RequestMapping` base path 미결합 → endpoint full path 누락
2. `@GetMapping(value = "/path")` format 미인식 가능성
3. Generic return type 손실 (`ResponseEntity<List<T>>` → `"Object"` 취급)
4. Interface(MyBatis Mapper) 미처리 → silent skip
5. Multi-line method signature 파싱 오류

Tree-sitter 기반 정공 파서로 전환하되 Workers 환경(V8 isolate, WASM 지원, no Node.js native bindings) 호환성 사전 검증이 필수다.

## Objective

본 Sprint는 PoC 단계만:
- (a) `web-tree-sitter` WASM 런타임 + `tree-sitter-java.wasm` 문법 파일 Workers-compatible 로드 검증
- (b) 5건 Java 샘플(LPON 도메인) AST 추출 round-trip 검증
- (c) regex CLI vs Tree-sitter AST diff — silent drift ≥1건 검출
- (d) parse 성능 측정 (1KB Java 평균 ms + WASM 메모리 footprint)
- (e) PoC 결과 기반 Phase 2 GO/NOGO 권고

Phase 2(WASM/native 결정 + CLI 이관) + Phase 3(테스트 + production 적용)는 후속 Sprint.

## WASM Load Strategy

| 항목 | 값 | 비고 |
|------|-----|------|
| WASM 런타임 | `web-tree-sitter@0.26.8` | WASM-based tree-sitter |
| Java 문법 WASM | `tree-sitter-java@0.23.5` | 405KB, npm 패키지 내 포함 |
| 런타임 WASM | `web-tree-sitter.wasm` | 193KB |
| Workers 총 메모리 | ~600KB | 128MB 한도의 0.46% |
| 로드 패턴 | `Language.load(Uint8Array)` | `fetch().arrayBuffer()` Workers 패턴과 동일 |

Workers에서의 실제 로드 흐름:
```
fetch(grammarWasmUrl).then(r => r.arrayBuffer())
  .then(buf => Language.load(new Uint8Array(buf)))
```

PoC에서는 `fs.readFile()` + `Uint8Array`로 동일 패턴 시뮬레이션.

## Sample Selection

| # | 파일 | 복잡도 | regex 예상 실패 케이스 |
|---|------|--------|----------------------|
| 1 | `PaymentController.java` | simple | base path 미결합 |
| 2 | `ChargeService.java` | medium | @Transactional rollbackFor |
| 3 | `PaymentEntity.java` | simple | generic field type (`List<T>`) |
| 4 | `WithdrawalController.java` | complex | class @RequestMapping + value= format |
| 5 | `RefundMapper.java` | edge | interface + @Select SQL (regex skip) |

## 5 Steps

1. **Setup** — `web-tree-sitter` 설치 + `tree-sitter-java.wasm` 확보
2. **WASM Loading Test** — `WebAssembly.compile(bytes)` Workers-compatible 패턴 검증
3. **AST Extraction** — 5 샘플 파싱 + class/endpoint/field 추출
4. **Diff Analysis** — regex CLI 결과 vs Tree-sitter 결과 비교, silent drift 검출
5. **Report** — JSON report + Phase 2 GO/NOGO 매트릭스

## DoD

- [x] `scripts/java-ast/src/poc-tree-sitter.ts` 신설
- [x] 5건 샘플 `scripts/java-ast/samples/` 생성
- [x] 5건 AST 추출 성공 (parse error 0)
- [x] regex diff ≥ 1건 검출 (silent drift 입증)
- [x] 평균 parse ms 측정 완료
- [x] `reports/f358-poc-tree-sitter-{date}.json` 생성
- [x] PDCA 4종 문서 (Plan + Design + Analysis + Report) 완성
- [x] Match Rate ≥ 90%

## Risks

- Workers WASM 로드 메모리 128MB 초과 → 실측 결과 0.46%, 문제없음 ✅
- `tree-sitter-java.wasm` 미성숙 (grammar coverage) → v0.23.5 검증 필요
- Phase 2 GO: Workers WASM 로드 + 파싱 정상 → Phase 2 진행
- Phase 2 NOGO: WASM 로드 실패 or 성능 10ms+/파일 → native bindings 검토

## Out-of-scope

- CLI 이관 (Phase 2)
- Production 적용 (Phase 3)
- 타 언어(Python/TypeScript) Tree-sitter 전환
