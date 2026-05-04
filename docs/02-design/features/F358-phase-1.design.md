---
id: AIF-DSGN-053
title: "F358 Phase 1 Design — Tree-sitter Java 파서 PoC 설계"
sprint: 254
f_items: [F358]
req: AIF-REQ-035
plan: AIF-PLAN-053
td: [TD-28]
status: Active
created: "2026-05-04"
author: "Sprint Autopilot"
---

# F358 Phase 1 — Tree-sitter Java 파서 PoC 설계

## §1 개요

Tree-sitter WASM을 이용한 Java AST 파싱 PoC. Workers 환경 호환성 + regex CLI 대비 품질 향상을 검증한다.

## §2 WASM 빌드 산출물 확인

npm `tree-sitter-java@0.23.5`는 `tree-sitter-java.wasm` (405KB)을 패키지에 포함한다.

```
scripts/java-ast/node_modules/
  web-tree-sitter/
    web-tree-sitter.wasm    (193KB — tree-sitter WASM 런타임)
    web-tree-sitter.cjs     (CJS 빌드)
    web-tree-sitter.d.ts    (TypeScript 정의)
  tree-sitter-java/
    tree-sitter-java.wasm   (405KB — Java grammar)
```

## §3 Workers Loader 인터페이스

### 3.1 로드 패턴 (Workers-compatible)

```typescript
// Workers 실제 사용 예 (Cloudflare Workers)
import { Parser, Language } from 'web-tree-sitter';

// Workers에서는 wasm 파일을 wrangler.toml wasm_modules로 번들하거나
// KV/R2에서 fetch() → arrayBuffer()로 로드
async function createJavaParser(grammarBytes: Uint8Array): Promise<Parser> {
  await Parser.init({
    locateFile: () => /* Workers runtime WASM URL or ArrayBuffer */
  });
  const Java = await Language.load(grammarBytes);
  const parser = new Parser();
  parser.setLanguage(Java);
  return parser;
}
```

### 3.2 PoC 시뮬레이션 (Node.js)

```typescript
// PoC: fs.readFile로 bytes 획득 → Workers 패턴과 동일한 Language.load(Uint8Array)
const grammarBytes = fs.readFileSync('tree-sitter-java.wasm'); // → Uint8Array
const wasmModule = await WebAssembly.compile(grammarBytes);    // Workers 패턴 검증
const Java = await Language.load(grammarBytes);                // tree-sitter 로드
```

## §4 AST → 기존 chunk schema 매핑

### 4.1 Java AST 구조 (tree-sitter 노드 타입)

```
program
└── class_declaration / interface_declaration
    ├── modifiers
    │   ├── marker_annotation (@RestController 등)
    │   └── annotation (@RequestMapping("/path") 등)
    ├── identifier (클래스명)
    └── class_body
        ├── method_declaration
        │   ├── modifiers (HTTP 어노테이션)
        │   ├── type (return type, generic 포함)
        │   ├── identifier (메서드명)
        │   └── formal_parameters
        └── field_declaration
            ├── modifiers
            ├── type (generic_type 포함)
            └── variable_declarator_list
```

### 4.2 매핑 테이블

| 기존 SourceAnalysisResult 필드 | Tree-sitter 추출 경로 | regex 대비 개선 |
|-------------------------------|----------------------|---------------|
| `controllers[].className` | `class_declaration > identifier` | 동일 |
| `controllers[].basePath` | `modifiers > annotation[@RequestMapping] > string_literal` | **신규** (regex는 `""` 고정) |
| `controllers[].endpoints[].httpMethod` | `modifiers > annotation[@*Mapping] > identifier` | 동일 |
| `controllers[].endpoints[].path` | basePath + `annotation[@*Mapping] > string_literal or element_value_pair` | **개선** (value= 형식 지원) |
| `controllers[].endpoints[].returnType` | `method_declaration > generic_type / type_identifier` | **개선** (generic 포함) |
| `dataModels[].fields[].type` | `field_declaration > type` | **개선** (generic 포함) |

### 4.3 어노테이션 추출 로직

```typescript
function extractAnnotationPath(annotNode: SyntaxNode): string {
  const args = annotNode.children.find(c => c.type === 'annotation_argument_list');
  if (!args) return '';
  // Case 1: @Mapping("/path") — direct string literal
  const strLit = args.children.find(c => c.type === 'string_literal');
  if (strLit) return strLit.text.slice(1, -1); // strip quotes
  // Case 2: @Mapping(value = "/path") — element_value_pair
  const pair = args.children.find(c => c.type === 'element_value_pair');
  const val = pair?.children.find(c => c.type === 'string_literal');
  return val ? val.text.slice(1, -1) : '';
}
```

## §5 PoC 파일 매핑

| 파일 | 역할 |
|------|------|
| `scripts/java-ast/src/poc-tree-sitter.ts` | 메인 PoC 스크립트 |
| `scripts/java-ast/samples/PaymentController.java` | 샘플 1 — simple controller |
| `scripts/java-ast/samples/ChargeService.java` | 샘플 2 — service |
| `scripts/java-ast/samples/PaymentEntity.java` | 샘플 3 — JPA entity |
| `scripts/java-ast/samples/WithdrawalController.java` | 샘플 4 — complex controller |
| `scripts/java-ast/samples/RefundMapper.java` | 샘플 5 — MyBatis mapper interface |
| `reports/f358-poc-tree-sitter-{date}.json` | PoC JSON 리포트 산출물 |

## §6 성능 측정 항목

| 측정 항목 | 목표값 | Workers 한도 |
|-----------|--------|-------------|
| `WebAssembly.compile()` 시간 | < 100ms | cold start 비용 |
| `Language.load()` 총 시간 | < 200ms | 초기화 1회 |
| parse 1 파일 평균 ms | < 5ms | CPU 10ms/req limit |
| grammar WASM 메모리 | 405KB | 128MB limit |
| 총 WASM 메모리 | ~600KB | 128MB의 0.46% |

## §7 Phase 2 GO/NOGO 기준

**GO 조건** (모두 충족 시):
- [x] `Language.load(Uint8Array)` 성공 (WASM 로드)
- [x] 5건 샘플 parse 오류 0건
- [x] 평균 parse time < 10ms/파일
- [x] silent drift ≥ 1건 검출 (regex 대비 품질 향상 입증)

**NOGO 조건** (하나라도 해당 시):
- [ ] WASM 메모리 > 50MB
- [ ] parse time > 50ms/파일
- [ ] parse 오류 ≥ 20% (grammar coverage 미성숙)

## §8 Phase 2 설계 선택지 (PoC 결과 후 결정)

| 옵션 | 설명 | 장점 | 단점 |
|------|------|------|------|
| **A: Workers WASM** | `web-tree-sitter` + WASM 번들 | 인프라 단순 | cold start ~100ms |
| **B: External Worker** | 별도 파서 Worker | cold start 격리 | 네트워크 hop 추가 |
| **C: Native (CLI only)** | Node.js native `tree-sitter` | 빠름 | Workers 미지원 → CLI 유지 |

PoC 결과 GO 시 옵션 A가 기본 선택. cold start 허용 불가 시 옵션 B 검토.
