import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSixCriteriaEvaluation, loadSpecContent, loadSpecContentLegacy } from "./evaluator.js";
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

const validSkillPackage = {
  $schema: "https://ai-foundry.ktds.com/schemas/skill/v1",
  skillId: "4591b69e-4e6a-4ac8-8261-ce177c35f994",
  metadata: {
    domain: "LPON",
    subdomain: "charge",
    language: "ko",
    version: "1.0.0",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    author: "decode-x",
    tags: [],
  },
  policies: [
    {
      code: "POL-LPON-CHARGE-001",
      title: "충전 잔액 검증",
      condition: "충전 요청 시 출금계좌 잔액 확인",
      criteria: "출금계좌 잔액 ≥ 충전 요청 금액",
      outcome: "출금 처리를 진행한다",
      source: { documentId: "doc-001", excerpt: "잔액 부족 시 출금 실패 에러 반환" },
      trust: { level: "reviewed", score: 0.9 },
      tags: [],
    },
  ],
  trust: { level: "reviewed", score: 0.9 },
  ontologyRef: { graphId: "g-001", termUris: [] },
  provenance: {
    sourceDocumentIds: ["doc-001"],
    organizationId: "LPON",
    extractedAt: "2026-04-01T00:00:00.000Z",
    pipeline: { stages: ["ingestion", "extraction"], models: { extraction: "claude-sonnet" } },
  },
  adapters: {},
};

describe("loadSpecContent", () => {
  it("returns null when skill package not found in R2", async () => {
    const env = {
      R2_SKILL_PACKAGES: {
        get: vi.fn().mockResolvedValue(null),
      },
    } as unknown as Env;

    const result = await loadSpecContent(env, "missing-skill", "LPON");
    expect(result).toBeNull();
  });

  it("parses skill-packages/{id}.skill.json and returns SpecContent (default path)", async () => {
    const env = {
      R2_SKILL_PACKAGES: {
        get: vi.fn().mockImplementation((key: string) => {
          if (key === "skill-packages/4591b69e-4e6a-4ac8-8261-ce177c35f994.skill.json") {
            return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(validSkillPackage)) });
          }
          return Promise.resolve(null);
        }),
      },
    } as unknown as Env;

    const result = await loadSpecContent(
      env,
      "4591b69e-4e6a-4ac8-8261-ce177c35f994",
      "LPON",
    );
    expect(result).not.toBeNull();
    expect(result?.skillName).toBe("lpon-charge");
    expect(result?.specContent.originalRules).toHaveLength(1);
    expect(result?.specContent.runbooks).toHaveLength(1);
  });

  it("uses explicit r2Key when provided — bundled skill with bundle- prefix (TD-55 fix)", async () => {
    const bundledKey = "skill-packages/bundle-4591b69e-4e6a-4ac8-8261-ce177c35f994.skill.json";
    const getMock = vi.fn().mockImplementation((key: string) => {
      if (key === bundledKey) {
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(validSkillPackage)) });
      }
      return Promise.resolve(null);
    });
    const env = { R2_SKILL_PACKAGES: { get: getMock } } as unknown as Env;

    const result = await loadSpecContent(
      env,
      "4591b69e-4e6a-4ac8-8261-ce177c35f994",
      "LPON",
      bundledKey,
    );

    expect(getMock).toHaveBeenCalledWith(bundledKey);
    expect(result).not.toBeNull();
    expect(result?.skillName).toBe("lpon-charge");
  });

  it("falls back to default path when r2Key is undefined", async () => {
    const defaultKey = "skill-packages/4591b69e-4e6a-4ac8-8261-ce177c35f994.skill.json";
    const getMock = vi.fn().mockImplementation((key: string) => {
      if (key === defaultKey) {
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(validSkillPackage)) });
      }
      return Promise.resolve(null);
    });
    const env = { R2_SKILL_PACKAGES: { get: getMock } } as unknown as Env;

    const result = await loadSpecContent(
      env,
      "4591b69e-4e6a-4ac8-8261-ce177c35f994",
      "LPON",
      undefined,
    );

    expect(getMock).toHaveBeenCalledWith(defaultKey);
    expect(result).not.toBeNull();
  });
});

describe("loadSpecContentLegacy", () => {
  it("returns null when manifest not found in R2", async () => {
    const env = {
      R2_SKILL_PACKAGES: {
        get: vi.fn().mockResolvedValue(null),
      },
    } as unknown as Env;

    const result = await loadSpecContentLegacy(env, "missing-skill", "LPON");
    expect(result).toBeNull();
  });
});
