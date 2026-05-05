---
id: AIF-ANLS-056
title: "F354 5건 BL-level DIVERGENCE 자동 검출 가능성 분석"
sprint: 258
f_items: [F425, F354]
req: AIF-REQ-035
plan: AIF-PLAN-056
design: AIF-DSGN-056
related_td: [TD-24, TD-28]
status: Active
created: "2026-05-05"
author: "Master (session 270)"
---

# F354 BL-level DIVERGENCE 자동 검출 가능성 분석

## §1 배경

- F354 (Sprint 218, 세션 218 2026-04-21)는 lpon-refund 도메인의 BL(business rule)-level DIVERGENCE 5건을 **수동 큐레이션**으로 발행
- 위치: `.decode-x/spec-containers/lpon-refund/provenance.yaml` `divergenceMarkers` 섹션
- 작성 당시 SPEC 명시: "**reconcile 엔진(API-level) 대비 BL-level divergence는 수동 큐레이션 + ES edge spec 링크 방식 채택 — Phase 3 이후 자동 검출 확장 검토**"
- Sprint 258 (Phase 3a) — Tree-sitter 도입 + 본 분석으로 자동화 가능성 정량 평가, 차기 Sprint Plan 입력으로 활용

## §2 자동화 분류 기준

| 분류 | 정의 | 필요 입력 | 추정 구현 비용 |
|------|------|-----------|---------------|
| **가능** | Tree-sitter AST + 단순 패턴 매칭(literal 비교, 함수 부재 등)으로 100% 검출 | `tree-sitter-java.wasm` + 기존 reconcile.ts 확장 | ~4h (1 Sprint sub-task) |
| **가능 (heuristic)** | AST + 임계치 기반 휴리스틱 검출 | AST + 도메인별 calibration 데이터 | ~8h (1 Sprint) |
| **조건부** | spec.rules.md 자연어 → 정량화 룰 parser 선결 필요 | `rules.md` parser (LLM 또는 regex 기반) | ~16h (별도 F-item, infra) |
| **불가** | 의미론 추론 LLM 호출 필요 (도메인 컨텍스트 + 산식 변환) | LLM 단계 + cost guard | ~24h (별도 F-item, costly) |

## §3 5건 marker 개별 분석

### 3.1 BL-024 (HIGH) — 미사용 상품권 7일 이내 전액 환불 기간 체크

**원본 marker** (`provenance.yaml`):
- spec: "구매 후 7일 이내 환불 요청 → 전액 환불 처리. 7일 초과 시 환불 불가."
- source: `refund.ts:38-101` `processRefundRequest()` — `payment.createdAt` 기반 기간 계산 누락
- divergenceReason: spec defines 7-day window check; source code lacks any period validation

**자동 검출 패턴 (제안)**:
```
입력: spec.rules.md "BL-024" 섹션 NL parsing → {
  rule: "7-day_window_check",
  inputs: ["payment.createdAt", "now"],
  predicate: "diff_days(now, createdAt) <= 7"
}
+
source AST: processRefundRequest() body 내
- BinaryExpression(operator: "<=", left/right contains "createdAt" reference) 검색
```

**Blocker**: rules.md "구매 후 7일 이내" 표현을 `{operator, threshold, unit}` 구조로 NL parser 필요. 정형화 어려움 — "구매 후" / "이내" / "7일" 토큰 매핑 필요.

**자동화 분류**: 조건부 (rules.md NL parser 선결 시)
**신뢰도**: 60%
**추천**: 조건부 — rules.md parser 도입 후 (별도 F-item)

### 3.2 BL-026 (MEDIUM) — 캐시백·할인보전 금액 환불 불가 + 포인트 전환 대안

**원본 marker**:
- spec: "캐시백·할인보전 금액 환불 시 현금 환불 불가. [미정의: 포인트 전환 등 대안 검토 필요] → ES-REFUND-002"
- source: `refund.ts` 캐시백 환불 분기 함수 부재
- divergenceReason: spec defines ALT 분기; source missing entirely

**자동 검출 패턴 (제안)**:
```
입력: spec.rules.md "BL-026" 섹션 NL parsing → {
  rule: "cashback_refund_alt",
  required_function: "*cashback*refund*"  ← LLM으로 함수명 후보 생성
}
+
source AST: function_declaration 노드들에서 "cashback" / "캐시백" 토큰 검색
```

**Blocker**: ALT 분기 표기 정형화 + 함수명 후보 생성에 LLM 또는 도메인 사전 필요.

**자동화 분류**: 조건부
**신뢰도**: 50%

### 3.3 BL-027 (LOW) — approveRefund 부분 구현

**원본 marker**:
- spec: 정책 깊이 ↔ source 함수 body length 비교
- source: `approveRefund:130-135` 부분 구현 (5 line) vs spec policy 다수
- divergenceReason: under-implementation heuristic

**자동 검출 패턴 (제안)**:
```
source AST: function_declaration "approveRefund"
  → bodyLineCount = body.children 통과시 line count 측정
  → branchDepth = max nested if/switch depth

heuristic: bodyLineCount < 10 && spec.policyEntries[approveRefund] >= 3
  → DIVERGENCE: "under-implemented relative to spec policy depth"
```

**Blocker**: 임계치(line count threshold, branch depth threshold)를 도메인별 calibration 데이터로 학습 필요. 일반 도메인은 10 line 가능, 복잡 도메인은 50+.

**자동화 분류**: 가능 (heuristic)
**신뢰도**: 70%
**추천**: BL-028과 함께 1 Sprint sub-task로 즉시 PoC 가능

### 3.4 BL-028 (MEDIUM) — 환불 제외금액 hard-coded 0 ⭐ 즉시 구현

**원본 marker**:
- spec: "입금액 = 환불요청액 − 제외금액 (캐시백·할인보전·가맹점 수수료 등)"
- source: `refund.ts:80-82` `exclusionAmount = 0` 하드코딩
- divergenceReason: spec defines 공식; source hard-codes 0

**자동 검출 패턴 (제안 — 즉시 구현 가능)**:
```typescript
function detectHardCodedExclusion(ast: Node): DivergenceMarker[] {
  const markers: DivergenceMarker[] = [];

  // tree-sitter AST traverse
  const assignments = ast.descendants("assignment_expression");
  for (const node of assignments) {
    const target = node.childForField("left");
    const value = node.childForField("right");

    // pattern: <var with "exclusion" or "excl" name> = literal_int "0"
    const targetName = target?.text ?? "";
    if (!/exclusion|excl_amount|exemptAmount/i.test(targetName)) continue;
    if (value?.type !== "decimal_integer_literal") continue;
    if (value.text !== "0") continue;

    markers.push({
      marker: "DIVERGENCE",
      ruleId: "BL-028-AUTO",
      severity: "MEDIUM",
      sourceLine: node.startPosition.row + 1,
      detail: `${targetName} = 0 hard-coded; spec defines exclusion calculation formula`,
    });
  }

  return markers;
}
```

**Blocker**: 없음 — 단일 함수 추가 + spec.rules.md에서 "BL-028" 키워드 + "공식" 토큰 1쌍만 cross-check.

**자동화 분류**: **가능 (정확)**
**신뢰도**: 95%
**추천**: 차기 Sprint 즉시 PoC 1 sub-task (~4h)

### 3.5 BL-029 (MEDIUM) — 강제환불 기준 부재

**원본 marker**:
- spec: "[미정의] → ES-REFUND-004 강제환불 기준"
- source: `refund.ts` 강제환불 분기 함수 부재
- divergenceReason: BL-026과 유사 패턴 (source missing function)

**자동 검출 패턴 (제안)**:
```
입력: spec.rules.md "BL-029" → {
  rule: "force_refund_criteria",
  required_function: "*force*refund*"
}
+ source AST: function_declaration "*force*refund*" 검색
```

**Blocker**: BL-026과 동일 (rules.md NL parser + 함수명 후보 생성 LLM)

**자동화 분류**: 조건부
**신뢰도**: 50%

## §4 종합 결과

| 분류 | 마커 수 | 마커 |
|------|---------:|------|
| 가능 | 1 | BL-028 |
| 가능 (heuristic) | 1 | BL-027 |
| 조건부 | 3 | BL-024 / BL-026 / BL-029 |
| 불가 | 0 | — |
| **합계** | **5** | — |

**평균 자동화 신뢰도**: (60+50+70+95+50)/5 = **65%**

**즉시 자동화 비율**: 2/5 = **40%** (BL-027 + BL-028)

**전체 자동화 가능 비율 (rules.md NL parser 도입 시)**: 5/5 = **100%** (단, 신뢰도 65% → 90% 도달까지 추가 작업 필요)

## §5 차기 Sprint 권고

### 5.1 즉시 PoC 가능 (1 Sprint, P1, ~8h)

**Sprint XXX — F-item 신규** (가칭 F426):
- BL-028 단독 자동 검출 엔진 PoC
- BL-027 heuristic 검출 PoC
- `packages/utils/src/divergence/bl-detector.ts` 신설
- 테스트: lpon-refund/provenance.yaml + scripts/java-ast/samples/RefundController.java (가칭) cross-check
- DoD: BL-028 100% 검출 + BL-027 70% 검출 + 차기 Sprint(rules.md parser) plan 작성

### 5.2 선결 인프라 (별도 F-item, P2, ~16h)

**Sprint XXX — F-item 신규** (가칭 F427):
- spec.rules.md NL → 정량화 룰 parser
- 후보 1: regex 기반 ("X일 이내" / "이상" / "이하" 토큰 추출)
- 후보 2: LLM 기반 (Haiku 1회/룰 cost guard $0.001)
- 출력: `{ruleId, predicate, inputs, threshold, unit}` 구조화 JSON
- DoD: BL-024/026/029 자동 검출 가능성 90%+ 도달

### 5.3 LPON 35 R2 재패키징 (Phase 3b, 별도 Sprint)

원안 Phase 3 의도였던 "LPON 전수 production 재추출 + F356-A 통합"은 본 Sprint 분석 결과 **메커니즘 한계 발견**:
- F356-A 평가 입력은 R2 `.skill.json` policies 기반 → Tree-sitter 결과 직접 반영 못 함
- LPON 35 재패키징(Tree-sitter AST → svc-policy 재추론 → 새 .skill.json)이 선결
- 비용 추정: 35 skill × Opus 1회 = ~$5 + LLM time ~30분 + Master 검증 1h
- 효과 가설: source_consistency 점수 (현 48.6%) 향상 — Tree-sitter 정확 path/return type 정보 제공

**Sprint XXX — F-item 신규** (가칭 F428): LPON 35 재패키징 + F356-A 재평가 (vs 세션 264 baseline avg 0.506)

## §6 결론

- F354 5건 자동화는 **2/5 즉시 가능 + 3/5 인프라 선결 (rules.md parser)** 패턴
- BL-028은 **AST literal 매칭 + spec rules cross-check**만으로 즉시 구현 가능 (95% 신뢰도) — 차기 Sprint 1 sub-task
- 전체 자동화는 rules.md NL parser 별도 F-item 선결 후 가능
- 본 분석 결과는 Sprint 258 종결 후 차기 Sprint Plan 입력으로 활용 (Sprint 258 자체는 분석 + reports + Plan/Design 문서화로 종결)
