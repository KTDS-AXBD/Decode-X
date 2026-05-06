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
  SkillPackageSchema,
} from "@ai-foundry/types";
import { callLlmRouterWithMeta, createLogger } from "@ai-foundry/utils";
import type { LlmTier } from "@ai-foundry/types";
import { buildPrompt, buildSystemPrompt, type SpecContent } from "./prompts.js";
import { skillPackageToSpecContent } from "./spec-content-adapter.js";
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

// Primary path — reads from R2 using r2Key from D1 (bundled skills have "bundle-" prefix)
export async function loadSpecContent(
  env: Env,
  skillId: string,
  _organizationId: string,
  r2Key?: string,
): Promise<{ specContent: SpecContent; skillName: string } | null> {
  const key = r2Key ?? `skill-packages/${skillId}.skill.json`;
  const obj = await env.R2_SKILL_PACKAGES.get(key);
  if (!obj) {
    logger.warn("skill package not found in R2", { skillId, r2Key: key });
    return null;
  }

  const raw = JSON.parse(await obj.text()) as unknown;
  const parsed = SkillPackageSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn("invalid skill package schema", { skillId, issues: parsed.error.issues });
    return null;
  }

  return skillPackageToSpecContent(parsed.data);
}

// Legacy path — reads spec-containers/{org}/{skillId}/manifest.json (Tier-A 7건 디버깅용)
export async function loadSpecContentLegacy(
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

// TD-59: Large skills (>100 policies) overflow LLM context → JSON parse fail → score=0.
// Conservative cap: per-entry truncation + total budget limit. Augmented bundles (F417 ---TEST_SCENARIOS--- payload)
// produce per-test entries of ~3KB each → 245 policies × 3KB ≈ 750KB → ~190K tokens (Haiku 200K context overflow).
const MAX_PER_ENTRY_CHARS = 2000;
const MAX_TOTAL_CONTENT_CHARS = 200_000; // ~50K tokens, safe for Haiku 200K context with system+rubric overhead

function truncateEntry(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n... [truncated ${text.length - max} chars to fit context]`;
}

function capSpecContentForLargeSkills(
  specContent: SpecContent,
  skillName: string,
): { capped: SpecContent; meta: { originalChars: number; cappedChars: number; truncated: boolean; entriesCount: number } } {
  const measure = (sc: SpecContent): number =>
    sc.rules.join("").length +
    (sc.originalRules ?? []).join("").length +
    (sc.emptySlotRules ?? []).join("").length +
    sc.runbooks.join("").length +
    sc.tests.join("").length +
    sc.contractYaml.length +
    sc.provenanceYaml.length;

  const originalChars = measure(specContent);
  const entriesCount =
    specContent.rules.length +
    specContent.runbooks.length +
    specContent.tests.length;

  // Stage 1: per-entry cap (only entries that exceed MAX_PER_ENTRY_CHARS)
  const capArr = (arr: string[]): string[] => arr.map((e) => truncateEntry(e, MAX_PER_ENTRY_CHARS));
  let capped: SpecContent = {
    rules: capArr(specContent.rules),
    runbooks: capArr(specContent.runbooks),
    tests: capArr(specContent.tests),
    contractYaml: truncateEntry(specContent.contractYaml, MAX_PER_ENTRY_CHARS * 4),
    provenanceYaml: truncateEntry(specContent.provenanceYaml, MAX_PER_ENTRY_CHARS * 4),
    ...(specContent.originalRules !== undefined && { originalRules: capArr(specContent.originalRules) }),
    ...(specContent.emptySlotRules !== undefined && { emptySlotRules: capArr(specContent.emptySlotRules) }),
  };

  let cappedChars = measure(capped);
  let truncated = cappedChars < originalChars;

  // Stage 2: if still over total budget, sample entries (keep first N to maintain prompt structure)
  if (cappedChars > MAX_TOTAL_CONTENT_CHARS) {
    const sampleSize = Math.max(20, Math.floor(MAX_TOTAL_CONTENT_CHARS / (MAX_PER_ENTRY_CHARS * 3)));
    capped = {
      ...capped,
      rules: capped.rules.slice(0, sampleSize),
      runbooks: capped.runbooks.slice(0, sampleSize),
      tests: capped.tests.slice(0, sampleSize),
    };
    cappedChars = measure(capped);
    truncated = true;
    logger.warn("ai-ready: stage-2 sampling applied for oversized spec", {
      skillName,
      sampleSize,
      originalEntries: entriesCount,
      cappedChars,
    });
  }

  return { capped, meta: { originalChars, cappedChars, truncated, entriesCount } };
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

  // TD-59: cap large augmented spec content before LLM calls
  const { capped: cappedSpec, meta } = capSpecContentForLargeSkills(specContent, skillName);
  if (meta.truncated) {
    logger.info("ai-ready: spec content truncated", {
      skillName,
      originalChars: meta.originalChars,
      cappedChars: meta.cappedChars,
      entriesCount: meta.entriesCount,
    });
  }

  const criteriaResults: Array<{
    criterion: AIReadyCriterion;
    score: number;
    rationale: string;
    passed: boolean;
  }> = [];
  for (const criterion of ALL_AI_READY_CRITERIA) {
    const prompt = buildPrompt(criterion, { specContent: cappedSpec, skillName });
    let rawContent = "";
    try {
      const result = await callLlmRouterWithMeta(env, "svc-skill:ai-ready", tier, prompt, {
        system,
        maxTokens: 512,
        temperature: 0.1,
      });
      returnedModelStr = result.model ?? model;
      rawContent = result.content;
      const { score, rationale } = parseLlmCriterionOutput(rawContent);
      totalCostUsd += COST_PER_CRITERION_USD[model] ?? 0;
      criteriaResults.push({ criterion, score, rationale, passed: score >= 0.75 });
    } catch (e) {
      // TD-59: log raw response excerpt for parse-fail diagnosis
      logger.error("LLM criterion eval failed", {
        criterion,
        model,
        skillName,
        error: String(e),
        rawExcerpt: rawContent ? rawContent.slice(0, 200) : "(no response)",
        promptChars: prompt.length,
        contentTruncated: meta.truncated,
      });
      totalCostUsd += COST_PER_CRITERION_USD[model] ?? 0;
      criteriaResults.push({ criterion, score: 0, rationale: `Evaluation failed: ${String(e)}`, passed: false });
    }
  }

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
