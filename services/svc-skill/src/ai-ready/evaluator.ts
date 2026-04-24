/**
 * AI-Ready evaluator — Worker runtime (V8).
 * Loads spec-container from R2, calls LLM 6 times (one per criterion),
 * and returns a fully populated AIReadyEvaluation.
 *
 * F356-B: This is the Worker-side port of scripts/ai-ready/evaluate.ts.
 * prompts.ts (rubric v2) is shared without modification.
 */

import {
  ALL_AI_READY_CRITERIA,
  AIReadyEvaluationSchema,
  type AIReadyEvaluation,
  type AIReadyCriterion,
} from "@ai-foundry/types";
import { callLlmRouterWithMeta, createLogger } from "@ai-foundry/utils";
import type { LlmTier } from "@ai-foundry/types";
import { buildPrompt, buildSystemPrompt, type SpecContent } from "./prompts.js";
import type { Env } from "../env.js";

const logger = createLogger("svc-skill:ai-ready:evaluator");

// Per-criterion cost estimate (tokens × price) — used as fallback if LLM doesn't report usage
const COST_PER_CRITERION_USD: Record<"haiku" | "opus" | "sonnet", number> = {
  haiku: 0.0006,
  opus: 0.015,
  sonnet: 0.003,
};

interface SpecContainerManifest {
  skillName: string;
  files: {
    rules?: string[];
    originalRules?: string[];
    emptySlotRules?: string[];
    runbooks?: string[];
    tests?: string[];
    contractYaml?: string;
    provenanceYaml?: string;
  };
}

interface LlmCriterionOutput {
  score: number;
  rationale: string;
}

async function loadTextFromR2(env: Env, key: string): Promise<string> {
  const obj = await env.R2_SKILL_PACKAGES.get(key);
  if (!obj) return "";
  return obj.text();
}

export async function loadSpecContent(
  env: Env,
  skillId: string,
  organizationId: string,
): Promise<{ specContent: SpecContent; skillName: string } | null> {
  const manifestKey = `spec-containers/${organizationId}/${skillId}/manifest.json`;
  const manifestObj = await env.R2_SKILL_PACKAGES.get(manifestKey);
  if (!manifestObj) {
    logger.warn("spec-container manifest not found", { skillId, organizationId, manifestKey });
    return null;
  }

  const manifest = JSON.parse(await manifestObj.text()) as SpecContainerManifest;
  const basePath = `spec-containers/${organizationId}/${skillId}`;
  const { files } = manifest;

  const [originalRuleTexts, emptySlotRuleTexts, runbookTexts, testTexts, contractYaml, provenanceYaml] =
    await Promise.all([
      Promise.all((files.originalRules ?? []).map((f) => loadTextFromR2(env, `${basePath}/${f}`))),
      Promise.all((files.emptySlotRules ?? []).map((f) => loadTextFromR2(env, `${basePath}/${f}`))),
      Promise.all((files.runbooks ?? []).map((f) => loadTextFromR2(env, `${basePath}/${f}`))),
      Promise.all((files.tests ?? []).map((f) => loadTextFromR2(env, `${basePath}/${f}`))),
      files.contractYaml ? loadTextFromR2(env, `${basePath}/${files.contractYaml}`) : Promise.resolve(""),
      files.provenanceYaml ? loadTextFromR2(env, `${basePath}/${files.provenanceYaml}`) : Promise.resolve(""),
    ]);

  return {
    skillName: manifest.skillName,
    specContent: {
      rules: [...originalRuleTexts, ...emptySlotRuleTexts],
      originalRules: originalRuleTexts,
      emptySlotRules: emptySlotRuleTexts,
      runbooks: runbookTexts,
      tests: testTexts,
      contractYaml,
      provenanceYaml,
    },
  };
}

function parseLlmCriterionOutput(raw: string): LlmCriterionOutput {
  const cleaned = raw.trim().replace(/^```json\s*/, "").replace(/```\s*$/, "");
  const parsed = JSON.parse(cleaned) as { score?: unknown; rationale?: unknown };
  const score = typeof parsed.score === "number" ? parsed.score : 0;
  const rationale = typeof parsed.rationale === "string" ? parsed.rationale : "No rationale provided.";
  return {
    score: Math.max(0, Math.min(1, score)),
    rationale,
  };
}

function modelToTier(model: "haiku" | "opus" | "sonnet"): LlmTier {
  return model as LlmTier;
}

export async function runSixCriteriaEvaluation(
  env: Env,
  specContent: SpecContent,
  skillName: string,
  model: "haiku" | "opus" | "sonnet",
): Promise<AIReadyEvaluation> {
  const tier = modelToTier(model);
  const system = buildSystemPrompt();
  let totalCostUsd = 0;
  let returnedModelStr = model as string;

  const criteriaResults = await Promise.all(
    ALL_AI_READY_CRITERIA.map(async (criterion: AIReadyCriterion) => {
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
        return { criterion, score, rationale, passed: score >= 0.75 };
      } catch (e) {
        logger.error("LLM criterion eval failed", { criterion, model, error: String(e) });
        totalCostUsd += COST_PER_CRITERION_USD[model] ?? 0;
        return { criterion, score: 0, rationale: `Evaluation failed: ${String(e)}`, passed: false };
      }
    }),
  );

  const totalScore =
    criteriaResults.reduce((sum, c) => sum + c.score, 0) / criteriaResults.length;
  const passCount = criteriaResults.filter((c) => c.passed).length;

  const evaluation = AIReadyEvaluationSchema.parse({
    skillId: skillName,
    skillName,
    criteria: criteriaResults.map((c) => ({
      criterion: c.criterion,
      score: Math.round(c.score * 1000) / 1000,
      rationale: c.rationale,
      passed: c.passed,
      passThreshold: 0.75 as const,
    })),
    totalScore: Math.round(totalScore * 1000) / 1000,
    passCount,
    overallPassed: passCount >= 4,
    modelVersion: returnedModelStr,
    evaluatedAt: new Date().toISOString(),
    costUsd: Math.round(totalCostUsd * 100000) / 100000,
  });

  return evaluation;
}

export function generateScoreId(): string {
  return crypto.randomUUID();
}
