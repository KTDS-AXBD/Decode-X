import { describe, it, expect, vi, afterEach } from "vitest";
import { SemanticEvaluator } from "./semantic.js";
import type { SemanticEvalEnv } from "./semantic.js";
import type { PolicyCandidate } from "@ai-foundry/types";

function makeCandidate(overrides?: Partial<PolicyCandidate>): PolicyCandidate {
  return {
    title: "퇴직연금 중도인출 조건 정책",
    condition: "가입자가 주택 구입을 위해 중도인출을 신청한 경우",
    criteria: "주택 구입 계약서와 본인 명의 확인 서류가 제출되어야 한다",
    outcome: "퇴직연금 적립금의 50% 이내에서 중도인출을 승인한다",
    policyCode: "POL-PENSION-WD-001",
    tags: ["퇴직연금", "중도인출"],
    sourceExcerpt: "제26조 중도인출 사유에 해당하는 경우 적립금의 50% 이내",
    sourcePageRef: "p.42",
    ...overrides,
  };
}

function makeLlmResponse(dimensions: Record<string, number>): Response {
  // OpenRouter chat-completions response (TD-44 Phase 1: svc-llm-router decommissioned)
  return new Response(
    JSON.stringify({
      id: "chatcmpl-test",
      model: "anthropic/claude-sonnet-4-5",
      choices: [
        { message: { role: "assistant", content: JSON.stringify(dimensions) }, finish_reason: "stop" },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    { status: 200 },
  );
}

function makeEnv(fetchFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): SemanticEvalEnv {
  vi.stubGlobal("fetch", fetchFn);
  return {
    CLOUDFLARE_AI_GATEWAY_URL: "http://test-gateway", OPENROUTER_API_KEY: "test-openrouter-key",
  };
}

describe("SemanticEvaluator", () => {
  const evaluator = new SemanticEvaluator();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("high-quality policy passes (score > 0.7)", async () => {
    const env = makeEnv(async () => makeLlmResponse({
      specificity: 0.9,
      consistency: 0.85,
      completeness: 0.8,
      actionability: 0.8,
      traceability: 0.75,
    }));

    const result = await evaluator.evaluate(makeCandidate(), env);
    expect(result.verdict).toBe("pass");
    expect(result.score).toBeGreaterThan(0.7);
    expect(result.stage).toBe("semantic");
    expect(result.evaluator).toBe("sonnet-semantic");
  });

  it("low-quality policy fails (score < 0.5)", async () => {
    const env = makeEnv(async () => makeLlmResponse({
      specificity: 0.2,
      consistency: 0.3,
      completeness: 0.1,
      actionability: 0.2,
      traceability: 0.1,
    }));

    const result = await evaluator.evaluate(makeCandidate(), env);
    expect(result.verdict).toBe("fail");
    expect(result.score).toBeLessThan(0.5);
  });

  it("borderline policy gets needs_review (0.5-0.7)", async () => {
    const env = makeEnv(async () => makeLlmResponse({
      specificity: 0.6,
      consistency: 0.65,
      completeness: 0.55,
      actionability: 0.6,
      traceability: 0.5,
    }));

    const result = await evaluator.evaluate(makeCandidate(), env);
    expect(result.verdict).toBe("needs_review");
    expect(result.score).toBeGreaterThanOrEqual(0.5);
    expect(result.score).toBeLessThan(0.7);
  });

  it("LLM returns invalid JSON — graceful fallback to needs_review", async () => {
    const env = makeEnv(async () => new Response(
      JSON.stringify({
        success: true,
        data: { content: "This is not valid JSON at all", provider: "anthropic", model: "sonnet" },
      }),
      { status: 200 },
    ));

    const result = await evaluator.evaluate(makeCandidate(), env);
    // All dimensions parse as 0 → weighted score 0 → fail
    expect(result.verdict).toBe("fail");
    expect(result.score).toBe(0);
  });

  it("all 5 dimensions present in result metadata", async () => {
    const env = makeEnv(async () => makeLlmResponse({
      specificity: 0.8,
      consistency: 0.7,
      completeness: 0.75,
      actionability: 0.85,
      traceability: 0.9,
    }));

    const result = await evaluator.evaluate(makeCandidate(), env);
    const dimensions = result.metadata?.["dimensions"] as Record<string, number> | undefined;
    expect(dimensions).toBeDefined();
    expect(dimensions).toHaveProperty("specificity");
    expect(dimensions).toHaveProperty("consistency");
    expect(dimensions).toHaveProperty("completeness");
    expect(dimensions).toHaveProperty("actionability");
    expect(dimensions).toHaveProperty("traceability");
  });

  it("weighted average calculation is correct", async () => {
    const scores = {
      specificity: 0.8,
      consistency: 0.6,
      completeness: 0.7,
      actionability: 0.5,
      traceability: 0.9,
    };
    const expectedScore =
      0.8 * 0.25 + 0.6 * 0.25 + 0.7 * 0.20 + 0.5 * 0.20 + 0.9 * 0.10;

    const env = makeEnv(async () => makeLlmResponse(scores));

    const result = await evaluator.evaluate(makeCandidate(), env);
    expect(result.score).toBe(Math.round(expectedScore * 1000) / 1000);
  });

  it("EvalResult has correct stage 'semantic'", async () => {
    const env = makeEnv(async () => makeLlmResponse({
      specificity: 0.9,
      consistency: 0.9,
      completeness: 0.9,
      actionability: 0.9,
      traceability: 0.9,
    }));

    const result = await evaluator.evaluate(makeCandidate(), env);
    expect(result.stage).toBe("semantic");
    expect(result.evaluator).toBe("sonnet-semantic");
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("prompt includes all policy fields", async () => {
    let capturedBody: string | undefined;
    const env = makeEnv(async (_url, init) => {
      capturedBody = init?.body as string | undefined;
      return makeLlmResponse({
        specificity: 0.8,
        consistency: 0.8,
        completeness: 0.8,
        actionability: 0.8,
        traceability: 0.8,
      });
    });

    const candidate = makeCandidate();
    await evaluator.evaluate(candidate, env);

    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody!) as { messages: Array<{ role: string; content: string }> };
    const userContent = parsed.messages.find((m) => m.role === "user")?.content ?? "";
    expect(userContent).toContain(candidate.policyCode);
    expect(userContent).toContain(candidate.title);
    expect(userContent).toContain(candidate.condition);
    expect(userContent).toContain(candidate.criteria);
    expect(userContent).toContain(candidate.outcome);
    expect(userContent).toContain(candidate.sourceExcerpt!);
    expect(userContent).toContain(candidate.sourcePageRef!);
  });

  it("LLM HTTP error returns needs_review with SEM_LLM_ERROR", async () => {
    const env = makeEnv(async () => new Response("Internal Server Error", { status: 500 }));

    const result = await evaluator.evaluate(makeCandidate(), env);
    expect(result.verdict).toBe("needs_review");
    expect(result.score).toBe(0);
    const issue = result.issues.find((i) => i.code === "SEM_LLM_ERROR");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("warning");
  });

  it("LLM returns failure response — falls back to needs_review", async () => {
    const env = makeEnv(async () => new Response(
      JSON.stringify({
        success: false,
        error: { message: "Rate limit exceeded" },
      }),
      { status: 200 },
    ));

    const result = await evaluator.evaluate(makeCandidate(), env);
    expect(result.verdict).toBe("needs_review");
    const issue = result.issues.find((i) => i.code === "SEM_LLM_ERROR");
    expect(issue).toBeDefined();
    expect(issue?.message).toContain("Rate limit exceeded");
  });

  it("low dimension scores generate warning issues", async () => {
    const env = makeEnv(async () => makeLlmResponse({
      specificity: 0.3,
      consistency: 0.4,
      completeness: 0.2,
      actionability: 0.1,
      traceability: 0.3,
    }));

    const result = await evaluator.evaluate(makeCandidate(), env);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain("SEM_LOW_SPECIFICITY");
    expect(codes).toContain("SEM_INCONSISTENT");
    expect(codes).toContain("SEM_INCOMPLETE");
    expect(codes).toContain("SEM_NOT_ACTIONABLE");
    expect(codes).toContain("SEM_LOW_TRACEABILITY");
    // All issues should have dimension field
    for (const issue of result.issues) {
      expect(issue.dimension).toBeDefined();
    }
  });

  it("clamps out-of-range scores to 0-1", async () => {
    const env = makeEnv(async () => makeLlmResponse({
      specificity: 1.5,
      consistency: -0.3,
      completeness: 0.7,
      actionability: 2.0,
      traceability: 0.8,
    }));

    const result = await evaluator.evaluate(makeCandidate(), env);
    const dimensions = result.metadata?.["dimensions"] as Record<string, number> | undefined;
    expect(dimensions).toBeDefined();
    expect(dimensions!["specificity"]).toBe(1);
    expect(dimensions!["consistency"]).toBe(0);
    expect(dimensions!["actionability"]).toBe(1);
  });
});
