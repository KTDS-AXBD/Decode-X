---
id: AXBD-DESIGN-sprint-245
title: "Sprint 245 — F414 TD-56 fix: Queue burst LLM HTML 응답 차단 해소"
sprint: 245
f_items: [F414]
status: PLANNED
created: "2026-05-03"
author: "Sprint Autopilot"
---

# Sprint 245 Design — F414 (TD-56 fix)

## §1. 배경

Sprint 244 F412 PARTIAL_FAIL 원인: Queue burst(concurrency=10) 환경에서 evaluator가 8개 메시지를 동시 처리 시 Worker당 `Promise.all(6 criteria)`로 최대 60개 concurrent LLM subrequest 발생. CF Workers subrequest 50개 한도 + OpenRouter burst rate limit → HTML index 페이지 응답 → `SyntaxError: Unexpected token '<'`.

**정상 증빙**: 단건 evaluate는 totalScore=0.54 정상. burst만 실패.

## §2. 변경 파일 목록

| 파일 | 변경 타입 |
|---|---|
| `services/svc-skill/wrangler.toml` | 설정 변경 |
| `services/svc-skill/src/ai-ready/evaluator.ts` | 로직 변경 |
| `packages/utils/src/llm-client.ts` | 기능 추가 |
| `packages/utils/src/llm-client.test.ts` | 테스트 추가 (신규 or 기존 확장) |

## §3. Step 별 상세 설계

### Step 1: wrangler.toml `max_concurrency` 10 → 3

**변경 위치**: `services/svc-skill/wrangler.toml`

**현재**:
```toml
[[env.staging.queues.consumers]]
queue = "ai-ready-queue-staging"
max_batch_size = 1
max_batch_timeout = 1
max_concurrency = 10   # ← 변경 대상

[[env.production.queues.consumers]]
queue = "ai-ready-queue"
max_batch_size = 1
max_batch_timeout = 1
max_concurrency = 10   # ← 변경 대상
```

**변경 후**:
```toml
max_concurrency = 3
```

**근거**: concurrency=3 + sequential 6 criteria = 최대 3 concurrent LLM. 50개 한도 대비 충분한 여유.

### Step 2: evaluator.ts `Promise.all` → sequential `for...of`

**변경 위치**: `services/svc-skill/src/ai-ready/evaluator.ts:146`

**현재**:
```typescript
const criteriaResults = await Promise.all(
  ALL_AI_READY_CRITERIA.map(async (criterion: AIReadyCriterion) => {
    ...
    const result = await callLlmRouterWithMeta(env, "svc-skill:ai-ready", tier, prompt, {...});
    ...
  }),
);
```

**변경 후**:
```typescript
const criteriaResults: Array<{criterion: AIReadyCriterion; score: number; rationale: string; passed: boolean}> = [];
for (const criterion of ALL_AI_READY_CRITERIA) {
  const prompt = buildPrompt(criterion, { specContent, skillName });
  try {
    const result = await callLlmRouterWithMeta(env, "svc-skill:ai-ready", tier, prompt, {
      system,
      maxTokens: 512,
      temperature: 0.1,
    });
    returnedModelStr = result.model ?? model;
    const { score, rationale } = parseLlmCriterionOutput(result.content);
    totalCostUsd += COST_PER_CRITERION_USD[model] ?? 0;
    criteriaResults.push({ criterion, score, rationale, passed: score >= 0.75 });
  } catch (e) {
    logger.error("LLM criterion eval failed", { criterion, model, error: String(e) });
    totalCostUsd += COST_PER_CRITERION_USD[model] ?? 0;
    criteriaResults.push({ criterion, score: 0, rationale: `Evaluation failed: ${String(e)}`, passed: false });
  }
}
```

**효과**: Worker당 LLM 호출이 순차화 → subrequest 폭발 억제. 단건 evaluate 시간 ~60s(tolerable, UI 경로 force=true 빈도 낮음).

### Step 3: llm-client.ts HTML guard + retry

**변경 위치**: `packages/utils/src/llm-client.ts` `callLlmRouterWithMeta` 함수

**추가 로직**:
1. `response.headers.get("content-type")` 확인 — `text/html` 포함 시 HTML guard 발동
2. HTML 응답이면 최대 2회 재시도 (exponential backoff: 1s, 2s)
3. 재시도 초과 시 명시적 에러 throw

**변경 후 함수 시그니처**: 동일 유지 (소비자 호환 보존)

**내부 구현 패턴**:
```typescript
const MAX_RETRIES = 2;
for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
  const response = await fetch(url, { ... });

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      continue;
    }
    const preview = (await response.text()).slice(0, 200);
    throw new Error(`LLM returned HTML (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${preview}`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM Router error ${response.status}: ${text}`);
  }

  const json = (await response.json()) as OpenRouterChatResponse;
  // ... 기존 로직
  return { content, provider: "openrouter", model: returnedModel };
}
```

## §4. 테스트 계약

| 테스트 | 파일 | 검증 내용 |
|---|---|---|
| HTML guard — 1회 HTML 후 정상 | `packages/utils/src/llm-client.test.ts` | 1차 응답 text/html, 2차 정상 JSON → retry 성공 |
| HTML guard — 모두 HTML | `packages/utils/src/llm-client.test.ts` | 3회 모두 text/html → Error throw |
| HTML guard — 즉시 정상 | `packages/utils/src/llm-client.test.ts` | 정상 응답 → retry 없이 반환 |

## §5. Worker 파일 매핑 (단일 Worker)

모든 변경이 단일 서비스 scope이므로 Agent 병렬화 없이 순차 구현:

1. `services/svc-skill/wrangler.toml` — max_concurrency 변경
2. `services/svc-skill/src/ai-ready/evaluator.ts` — sequential 변환
3. `packages/utils/src/llm-client.ts` — HTML guard + retry
4. `packages/utils/src/llm-client.test.ts` — unit test 추가

## §6. 리스크 / 트레이드오프

| ID | 내용 | 대응 |
|---|---|---|
| R1 | max_concurrency=3 → 대규모 배치(5,154건) 처리 속도 3.3배 감소 | F356-B 운영 시점 별도 평가. 현 scope(lpon 8건)는 무관 |
| R2 | sequential 6 criteria → 단건 60s+ | UI 경로 cache=1h. force=true는 디버깅 전용으로 수용 |
| R3 | retry 최대 3배 비용 | HTML 응답 자체가 비정상. 정상 환경에서는 retry 0회 |

## §7. DoD 체크리스트

- [ ] wrangler.toml: staging + production max_concurrency = 3
- [ ] evaluator.ts: `for...of` sequential (기존 catch/fallback 로직 유지)
- [ ] llm-client.ts: content-type HTML guard + 2회 retry + exponential backoff
- [ ] llm-client.test.ts: HTML guard 3케이스 unit test PASS
- [ ] `pnpm typecheck && pnpm test` PASS (전체 모노레포)
- [ ] lpon 8건 batch avg_score > 0 (LLM 48/48 SUCCESS)
- [ ] Master smoke HTTP 200 + totalScore > 0
- [ ] Match Rate ≥ 90%
