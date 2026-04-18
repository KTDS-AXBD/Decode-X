# Sprint 2 — R2 LLM 예산 관측 스키마

**Sprint**: 2
**작성일**: 2026-04-19
**목적**: `llm-client.ts` 호출 메타데이터를 R2에 JSONL 포맷으로 기록하여 LLM 비용을 추적한다.

---

## LlmBudgetEntry 스키마

```typescript
interface LlmBudgetEntry {
  ts: string;               // ISO8601
  callerService: string;    // e.g. "svc-extraction"
  tier: "1" | "2" | "3";   // LLM 티어
  model: string;            // e.g. "claude-opus-4-7"
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCostUsd: number; // promptTokens * inputRate + completionTokens * outputRate
  sprintNum: number;
  tags: string[];           // e.g. ["stage-2", "extraction", "poc"]
}
```

## R2 저장 경로

```
llm-budget/{year}/{month}/{date}/sprint-{N}.jsonl
```

예시:
```
llm-budget/2026/04/19/sprint-2.jsonl
```

하루 1개 파일 (append). 월별 비용 집계 시 `llm-budget/2026/04/` 전체 열거.

---

## 티어별 추정 요금 (2026-04 기준, Anthropic 공개 가격)

| 티어 | 모델 | Input ($/1M) | Output ($/1M) |
|:----:|------|:------------:|:-------------:|
| 1 | claude-opus-4-7 | 15.00 | 75.00 |
| 2 | claude-sonnet-4-6 | 3.00 | 15.00 |
| 3 | claude-haiku-4-5 | 0.25 | 1.25 |

`estimatedCostUsd = (promptTokens / 1_000_000 * inputRate) + (completionTokens / 1_000_000 * outputRate)`

---

## Phase 1 PoC 예산 목표 (KPI)

| 기간 | 목표 | 측정 방법 |
|------|------|----------|
| Sprint 2~5 | 총 $5 이하 | llm-budget JSONL 집계 |
| 단일 Sprint | $1 이하 | sprint-{N}.jsonl sum(estimatedCostUsd) |

---

## 통합 경로 (미래)

- `packages/utils/src/llm-client.ts`의 `callLlm()` 응답 후 hook에 기록
- R2 Worker binding: `LLM_BUDGET_R2` (wrangler.toml에 추가 시)
- Phase 2에서 실 Worker 연동. Phase 1 PoC에서는 수동 기록.
