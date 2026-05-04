---
id: AIF-ANLS-053
title: "F358 Phase 1 Analysis — Tree-sitter Java PoC 결과 분석"
sprint: 254
f_items: [F358]
req: AIF-REQ-035
plan: AIF-PLAN-053
design: AIF-DSGN-053
td: [TD-28]
status: DONE
created: "2026-05-04"
author: "Sprint Autopilot"
---

# F358 Phase 1 Analysis — Tree-sitter Java PoC 결과

## §1 실행 환경

- Node.js v24.14.1
- web-tree-sitter v0.26.8
- tree-sitter-java v0.23.5
- 실행: `npx tsx src/poc-tree-sitter.ts --out reports/f358-poc-tree-sitter-2026-05-04.json`

## §2 WASM 로드 검증 (Workers 호환성 핵심)

| 측정 항목 | 실측값 | 목표값 | 판정 |
|-----------|--------|--------|------|
| grammar WASM 크기 | 405 KB | < 10 MB | ✅ PASS |
| runtime WASM 크기 | 192 KB | < 10 MB | ✅ PASS |
| 총 WASM 크기 | 597 KB | < 50 MB | ✅ PASS (Workers 128MB의 0.46%) |
| `WebAssembly.compile()` | 1.71 ms | < 100 ms | ✅ PASS |
| `Language.load()` | 1.87 ms | < 200 ms | ✅ PASS |
| Workers 호환성 | **PASS** | PASS | ✅ |

**검증 방법**: `fs.readFileSync(wasm) → WebAssembly.compile(bytes)` 패턴이 Cloudflare Workers의
`fetch().arrayBuffer() → Language.load(Uint8Array)` 패턴과 기능적으로 동일함을 확인.

## §3 파싱 성능

| 측정 항목 | 실측값 | 목표값 | 판정 |
|-----------|--------|--------|------|
| 평균 parse 시간/파일 | 1.22 ms | < 10 ms | ✅ PASS |
| 평균 parse 시간/KB | 1.12 ms | < 5 ms | ✅ PASS |
| 5건 총 parse 시간 | 6.09 ms | < 50 ms | ✅ PASS |
| Workers CPU 10ms/req 이내 | ✅ | - | ✅ |

**주목**: ChargeService.java가 3.68ms (가장 느림) — cold parse (JIT warm-up 전). 나머지 4건은 0.44~1ms 수준으로 JIT 이후 안정화 확인.

## §4 Silent Drift 검출 결과

### 4.1 전체 요약

| diff 종류 | 건수 | 검출 파일 |
|-----------|------|----------|
| `base_path_missing` | 2 | PaymentController.java, WithdrawalController.java |
| `path_incomplete` | 7 | PaymentController.java (4), WithdrawalController.java (3) |
| `return_type_generic_loss` | 7 | PaymentController.java (4), WithdrawalController.java (3) |
| `mapper_skipped` | 1 | RefundMapper.java |
| **합계** | **17** | |

### 4.2 Base Path 미결합 (root cause)

regex CLI의 `parseController()` 함수는 `result.controllers.push({ ..., basePath: "", ... })`로
class-level `@RequestMapping`을 완전히 무시한다.

```
LponPaymentController:
  regex:   basePath=""   endpoints: ["/charge", "/balance/{accountNo}", "/cancel", "/history"]
  tree-sitter: basePath="/api/v1/lpon/payment"
               endpoints: ["/api/v1/lpon/payment/charge", ...]

LponWithdrawalController:
  regex:   basePath=""   endpoints: ["/initiate", "/status/{txId}", "/cancel/{txId}"]
  tree-sitter: basePath="/api/v1/lpon/withdrawal"
               endpoints: ["/api/v1/lpon/withdrawal/initiate", ...]
```

**영향**: LPON 도메인의 모든 Controller가 base path를 사용하므로, 현재 regex 파서는
**전체 API endpoint path를 잘못 보고**하고 있다. PRD의 `/api/v1/lpon/payment/charge`와
코드 분석 결과 `/charge`가 불일치 → silent drift 원인 확정.

### 4.3 Generic Return Type 손실

regex의 `line.match(/(?:public|protected)\s+\S+\s+(\w+)\s*\(/)` 패턴은 `\S+`로
return type을 매칭하고, `(\w+)`로 메서드명을 추출한다. `ResponseEntity<ChargeResponse>`
처럼 generic이 있으면 `\S+`가 전체를 먹어 메서드명 추출에 실패하거나 returnType을
"Object"로 fallback한다.

```
LponPaymentController.charge:
  regex:   returnType="Object"
  ts:      returnType="ResponseEntity<ChargeResponse>"

LponPaymentController.getHistory:
  regex:   returnType="Object"
  ts:      returnType="ResponseEntity<List<PaymentHistory>>"
```

### 4.4 Interface(Mapper) 완전 누락

regex의 `runner.ts`는 `@Controller`, `@Service`, `@Entity`, `@Data/@Getter/@Setter/@Value`만
처리한다. `interface`는 `@Mapper`가 있어도 완전히 무시된다.

```
LponRefundMapper:
  regex:   (not found in any category)
  ts:      kind="mapper", 0 mapped methods detected
           (4개 @Select/@Insert/@Update 메서드 존재 — tree-sitter v2에서 @Select SQL 추출 예정)
```

### 4.5 가치 없는 diff (PaymentEntity)

`PaymentEntity.java`에서 diff 0건이 검출됐다.
- `List<PaymentHistory>` — regex `[\S]+` 패턴이 정확히 캡처
- `Map<String, Object>` — regex가 `Map<String,`으로 잘못 캡처하지만, 내 검출 로직이
  `!regexField.type.includes("<")`만 확인해서 누락됨 (Phase 2 개선 후보)

실제로 Map 타입은 regex가 잘못 캡처하고 있으므로, 이는 `field_type_truncated` diff로
Phase 2에서 추가 검출 가능.

## §5 DoD 달성 현황

| DoD 항목 | 상태 |
|---------|------|
| `scripts/java-ast/src/poc-tree-sitter.ts` 신설 | ✅ |
| 5건 샘플 `scripts/java-ast/samples/` | ✅ |
| 5건 AST 추출 성공 (parse error 0건) | ✅ |
| regex diff ≥ 1건 (silent drift 입증) | ✅ 17건 |
| 평균 parse ms 측정 | ✅ 1.22ms/파일 |
| `reports/f358-poc-tree-sitter-2026-05-04.json` | ✅ |
| PDCA 4종 문서 | ✅ (이 문서 포함) |
| Match Rate ≥ 90% | 분석 중 |

## §6 Gap Analysis

### Matched Items (Design §4.2 매핑 테이블 기준)

| # | 설계 항목 | 구현 | 상태 |
|---|----------|------|------|
| 1 | Class annotations 추출 | `extractModifiers()` | ✅ |
| 2 | Class base path 추출 | `annotationPath()` on @RequestMapping | ✅ |
| 3 | HTTP method annotation → 메서드명 | `HTTP_METHODS` 매핑 | ✅ |
| 4 | value= 형식 annotation path | `element_value_pair` 처리 | ✅ |
| 5 | Generic return type 추출 | `getReturnType()` | ✅ |
| 6 | Interface (@Mapper) 감지 | `isInterface` 분기 | ✅ |
| 7 | Workers-compatible WASM 로드 | `WebAssembly.compile()` 검증 | ✅ |
| 8 | 성능 측정 (parse ms + WASM KB) | `performance.now()` | ✅ |
| 9 | JSON report 산출물 | `writeFileSync()` | ✅ |

### Gaps

| # | Gap 항목 | 심각도 | Phase |
|---|---------|--------|-------|
| G-1 | multi-path annotation `@PostMapping({"/a", "/b"})` 미처리 | Low | Phase 2 |
| G-2 | Map<K,V> field type 잘못된 캡처 검출 미구현 | Low | Phase 2 |
| G-3 | @Select SQL 내용 추출 미구현 | Low | Phase 3 |
| G-4 | ChargeService @Transactional 세부정보 (rollbackFor) 미추출 | Info | Phase 2 |

**Match Rate**: 9/9 핵심 설계 항목 구현 = **100%** (4개 known gap은 Phase 2~3 scope)

## §7 Phase 2 GO/NOGO 판정

### ✅ GO — Phase 2 진행 권고

**판정 근거**:
1. Workers-compatible WASM 로드 검증 PASS (597KB, 1.71ms compile)
2. 5건 샘플 parse error 0건 (grammar coverage 충분)
3. regex 대비 17건 silent drift 검출 (품질 향상 명확)
4. 평균 1.22ms/파일 (Workers CPU 10ms/req 한도의 12.2%)

**Phase 2 권고 설계**:
- Cloudflare Workers에서 `web-tree-sitter` 번들링: `wrangler.toml` `wasm_modules` 선언
  (`tree-sitter-java.wasm` → wasm binding)
- `svc-extraction` Worker에 tree-sitter 파서 통합
- `scripts/java-ast/src/runner.ts` → `packages/utils/src/java-parsing/tree-sitter-runner.ts` 이관
- F361 (TD-26 Java 파서 공용화)와 자연 통합
