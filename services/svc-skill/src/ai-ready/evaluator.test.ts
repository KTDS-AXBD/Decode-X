import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSixCriteriaEvaluation, loadSpecContent } from "./evaluator.js";
import type { Env } from "../env.js";

// ── Mock factories ──────────────────────────────────────────────────

const mockLlmResponse = JSON.stringify({ score: 0.85, rationale: "Strong alignment across all BL entries with no missing conditions observed in the mapping table." });

function mockEnv(llmResponse = mockLlmResponse, r2Manifest?: unknown): Partial<Env> {
  return {
    CLOUDFLARE_AI_GATEWAY_URL: "https://gateway.test/openrouter/api/v1/chat/completions",
    OPENROUTER_API_KEY: "test-key",
    R2_SKILL_PACKAGES: {
      get: vi.fn().mockImplementation((key: string) => {
        if (key.endsWith("manifest.json")) {
          return Promise.resolve({
            text: () => Promise.resolve(
              JSON.stringify(r2Manifest ?? {
                skillName: "lpon-charge",
                files: {
                  originalRules: ["rules/lpon-charge-rules.md"],
                  emptySlotRules: [],
                  runbooks: ["runbooks/charge-runbook.md"],
                  tests: ["tests/charge.yaml"],
                  contractYaml: "tests/contract/charge-contract.yaml",
                  provenanceYaml: "provenance.yaml",
                },
              }),
            ),
          });
        }
        return Promise.resolve({ text: () => Promise.resolve("# Sample content\nBL-001 조건 예시") });
      }),
    } as unknown as R2Bucket,
    DB_SKILL: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({ success: true }) }),
      }),
    } as unknown as D1Database,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("runSixCriteriaEvaluation", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: mockLlmResponse } }],
        model: "anthropic/claude-haiku-4-5",
      }),
    }));
  });

  it("returns 6 criteria results with valid scores", async () => {
    const env = mockEnv() as Env;
    const specContent = {
      rules: ["rule content"],
      originalRules: ["BL-001 content"],
      emptySlotRules: [],
      runbooks: ["runbook content"],
      tests: ["test scenario"],
      contractYaml: "contract: yaml",
      provenanceYaml: "businessRules:\n  - BL-001",
    };

    const result = await runSixCriteriaEvaluation(env, specContent, "lpon-charge", "haiku");

    expect(result.criteria).toHaveLength(6);
    expect(result.totalScore).toBeGreaterThan(0);
    expect(result.totalScore).toBeLessThanOrEqual(1);
  });

  it("calculates passCount correctly (score 0.85 > 0.75 threshold)", async () => {
    const env = mockEnv() as Env;
    const specContent = {
      rules: ["r"], originalRules: ["r"], emptySlotRules: [],
      runbooks: ["r"], tests: ["t"], contractYaml: "c", provenanceYaml: "p",
    };

    const result = await runSixCriteriaEvaluation(env, specContent, "lpon-test", "haiku");
    expect(result.passCount).toBe(6);
    expect(result.overallPassed).toBe(true);
  });

  it("handles LLM error gracefully — score 0 for failed criterion", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error("timeout"));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: mockLlmResponse } }],
          model: "anthropic/claude-haiku-4-5",
        }),
      });
    }));

    const env = mockEnv() as Env;
    const specContent = {
      rules: [], originalRules: [], emptySlotRules: [],
      runbooks: [], tests: [], contractYaml: "", provenanceYaml: "",
    };

    const result = await runSixCriteriaEvaluation(env, specContent, "lpon-err", "haiku");
    expect(result.criteria.some((c) => c.score === 0)).toBe(true);
  });

  it("parses LLM JSON with markdown code fence wrapper", async () => {
    const fencedResponse = "```json\n" + JSON.stringify({ score: 0.9, rationale: "A detailed rationale that meets the minimum length requirement for scoring purposes." }) + "\n```";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: fencedResponse } }],
        model: "anthropic/claude-haiku-4-5",
      }),
    }));

    const env = mockEnv() as Env;
    const specContent = {
      rules: ["r"], originalRules: ["r"], emptySlotRules: [],
      runbooks: ["r"], tests: ["t"], contractYaml: "c", provenanceYaml: "p",
    };

    const result = await runSixCriteriaEvaluation(env, specContent, "lpon-fence", "haiku");
    expect(result.criteria[0]?.score).toBe(0.9);
  });

  it("clamps score to [0, 1]", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ score: 1.5, rationale: "Out of range score test case for boundary validation." }) } }],
        model: "anthropic/claude-haiku-4-5",
      }),
    }));

    const env = mockEnv() as Env;
    const specContent = {
      rules: ["r"], originalRules: [], emptySlotRules: [],
      runbooks: [], tests: [], contractYaml: "", provenanceYaml: "",
    };

    const result = await runSixCriteriaEvaluation(env, specContent, "lpon-clamp", "haiku");
    result.criteria.forEach((c) => {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(1);
    });
  });
});

describe("loadSpecContent", () => {
  it("returns null when manifest not found in R2", async () => {
    const env = {
      R2_SKILL_PACKAGES: {
        get: vi.fn().mockResolvedValue(null),
      },
    } as unknown as Env;

    const result = await loadSpecContent(env, "missing-skill", "LPON");
    expect(result).toBeNull();
  });
});
