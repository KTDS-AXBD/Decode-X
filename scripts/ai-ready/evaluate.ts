/**
 * evaluate.ts — AI-Ready 6기준 LLM 채점 CLI (F402 TD-42 재작)
 *
 * Usage:
 *   pnpm tsx scripts/ai-ready/evaluate.ts \
 *     [--spec-dir .decode-x/spec-containers] \
 *     [--model haiku|sonnet|opus] \
 *     [--output reports/ai-ready-poc-YYYY-MM-DD.json] \
 *     [--dry-run]
 *
 * Required env:
 *   LLM_ROUTER_URL       — svc-llm-router HTTP URL
 *   INTERNAL_API_SECRET  — internal auth header value
 *
 * Sprint 230 → 232 변경:
 *   - sample-loader: API 기반 → fs 기반 spec-containers (TD-42 해소)
 *   - 샘플: 80건 → 7 spec-containers (lpon-*)
 *   - LLM 호출: 480 → 42 (7 × 6)
 *   - 프롬프트: Java 소스 기반 → markdown rules/runbooks/tests 기반
 */

import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { resolve } from "path";
import {
  ALL_AI_READY_CRITERIA,
  AIReadyEvaluationSchema,
  AIReadyBatchReportSchema,
} from "../../packages/types/src/ai-ready.js";
import type { AIReadyEvaluation, AIReadyScore, AIReadyCriterion } from "../../packages/types/src/ai-ready.js";
import {
  MODEL_HAIKU,
  MODEL_SONNET,
  MODEL_OPUS,
  OR_MODEL_HAIKU,
  OR_MODEL_SONNET,
  OR_MODEL_OPUS,
} from "../../packages/types/src/model-defaults.js";
import { buildPrompt } from "../../services/svc-skill/src/ai-ready/prompts.js";
import type { PromptInput } from "../../services/svc-skill/src/ai-ready/prompts.js";
import { loadSpecContainers } from "./sample-loader.js";
import type { SkillMeta } from "./sample-loader.js";
import { callOpenRouterWithMeta } from "../../packages/utils/src/openrouter-client.js";

// ── Argument Parsing ──────────────────────────────────────────────────

function parseArgs(): {
  specDir: string;
  model: "haiku" | "sonnet" | "opus";
  output: string;
  dryRun: boolean;
  directAnthropic: boolean;
  openrouter: boolean;
  prefix: string | undefined;
} {
  const args = process.argv.slice(2);
  const get = (flag: string, def: string): string => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] !== undefined ? (args[idx + 1] as string) : def;
  };
  const today = new Date().toISOString().slice(0, 10);
  const prefixIdx = args.indexOf("--prefix");
  return {
    specDir: get("--spec-dir", ".decode-x/spec-containers"),
    model: get("--model", "haiku") as "haiku" | "sonnet" | "opus",
    output: get("--output", `reports/ai-ready-poc-${today}.json`),
    dryRun: args.includes("--dry-run"),
    directAnthropic: args.includes("--direct-anthropic"),
    openrouter: args.includes("--openrouter"),
    prefix: prefixIdx !== -1 ? args[prefixIdx + 1] : undefined,
  };
}

let useAnthropicDirect = false;
let useOpenRouter = false;

// ── Cost Guard ────────────────────────────────────────────────────────

const WARN_THRESHOLD_USD = 25;
const HARD_LIMIT_USD = 30;

async function fetchTodayUsageUsd(): Promise<number> {
  const routerUrl = process.env["LLM_ROUTER_URL"] ?? "";
  const secret = process.env["INTERNAL_API_SECRET"] ?? "";
  if (!routerUrl) {
    console.warn("⚠️  LLM_ROUTER_URL 미설정 — 비용 체크 건너뜀");
    return 0;
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`${routerUrl}/usage?date=${today}`, {
      headers: { "X-Internal-Secret": secret },
    });
    if (!res.ok) {
      console.warn(`⚠️  /usage 응답 ${res.status} — 비용 체크 건너뜀`);
      return 0;
    }
    const json = (await res.json()) as { totalUsd?: number };
    return json.totalUsd ?? 0;
  } catch {
    console.warn("⚠️  /usage 호출 실패 — 비용 체크 건너뜀");
    return 0;
  }
}

function checkCostGuard(cumulative: number, dailyBase: number): "ok" | "warn" | "stop" {
  const total = cumulative + dailyBase;
  if (total >= HARD_LIMIT_USD) return "stop";
  if (total >= WARN_THRESHOLD_USD) return "warn";
  return "ok";
}

// ── LLM Call ──────────────────────────────────────────────────────────

interface LlmResponse {
  content?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

async function callAnthropicDirect(
  prompt: string,
  tier: "haiku" | "sonnet" | "opus",
): Promise<{ score: number; rationale: string; costUsd: number }> {
  const apiKey = process.env["ANTHROPIC_API_KEY"] ?? "";
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 미설정 (--direct-anthropic 사용 시 필수)");
  const modelMap = {
    haiku: MODEL_HAIKU,
    sonnet: MODEL_SONNET,
    opus: MODEL_OPUS,
  } as const;
  const model = modelMap[tier];

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      if (attempt === 2) throw new Error(`Anthropic direct failed: ${res.status} ${await res.text()}`);
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    const json = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const raw = json.content?.find((c) => c.type === "text")?.text ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*"score"[\s\S]*"rationale"[\s\S]*\}/);
    if (!jsonMatch) {
      if (attempt === 2) throw new Error(`JSON parse failed: ${raw.slice(0, 200)}`);
      continue;
    }
    const parsed = JSON.parse(jsonMatch[0]) as { score?: number; rationale?: string };
    const score = Math.max(0, Math.min(1, Number(parsed.score ?? 0)));
    const rationale = String(parsed.rationale ?? "").trim();
    const promptTokens = json.usage?.input_tokens ?? 2000;
    const completionTokens = json.usage?.output_tokens ?? 300;
    const costUsd = estimateCostUsd(tier, promptTokens, completionTokens);
    return { score, rationale, costUsd };
  }
  throw new Error("unreachable");
}

async function callOpenRouterJson(
  prompt: string,
  tier: "haiku" | "sonnet" | "opus",
): Promise<{ score: number; rationale: string; costUsd: number }> {
  const apiKey = process.env["OPENROUTER_API_KEY"] ?? "";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY 미설정 (--openrouter 사용 시 필수)");
  const modelMap = {
    haiku: OR_MODEL_HAIKU,
    sonnet: OR_MODEL_SONNET,
    opus: OR_MODEL_OPUS,
  } as const;
  const model = modelMap[tier];

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await callOpenRouterWithMeta(
        { OPENROUTER_API_KEY: apiKey },
        prompt,
        { model, maxTokens: 1500, temperature: 0.1 },
      );
      const raw = result.content;
      const jsonMatch = raw.match(/\{[\s\S]*"score"[\s\S]*"rationale"[\s\S]*\}/);
      if (!jsonMatch) {
        if (attempt === 2) throw new Error(`JSON parse failed: ${raw.slice(0, 200)}`);
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      const parsed = JSON.parse(jsonMatch[0]) as { score?: number; rationale?: string };
      const score = Math.max(0, Math.min(1, Number(parsed.score ?? 0)));
      const rationale = String(parsed.rationale ?? "").trim();
      const costUsd = estimateCostUsd(tier, result.usage.promptTokens, result.usage.completionTokens);
      return { score, rationale, costUsd };
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error("unreachable");
}

async function callLlmJson(
  prompt: string,
  tier: "haiku" | "sonnet" | "opus",
): Promise<{ score: number; rationale: string; costUsd: number }> {
  if (useOpenRouter) return callOpenRouterJson(prompt, tier);
  if (useAnthropicDirect) return callAnthropicDirect(prompt, tier);

  const routerUrl = process.env["LLM_ROUTER_URL"] ?? "";
  const secret = process.env["INTERNAL_API_SECRET"] ?? "";

  const body = JSON.stringify({
    tier,
    messages: [{ role: "user", content: prompt }],
    callerService: "ai-ready-poc",
    maxTokens: 512,
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${routerUrl}/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
      },
      body,
    });

    if (!res.ok) {
      if (attempt === 2) throw new Error(`LLM call failed: ${res.status}`);
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }

    const json = (await res.json()) as LlmResponse;
    const raw = json.content ?? json.choices?.[0]?.message?.content ?? "";

    const jsonMatch = raw.match(/\{[\s\S]*"score"[\s\S]*"rationale"[\s\S]*\}/);
    if (!jsonMatch) {
      if (attempt === 2) throw new Error(`JSON parse failed after 3 attempts: ${raw.slice(0, 200)}`);
      continue;
    }

    const parsed = JSON.parse(jsonMatch[0]) as { score?: number; rationale?: string };
    const score = Math.max(0, Math.min(1, Number(parsed.score ?? 0)));
    const rationale = String(parsed.rationale ?? "").trim();

    const promptTokens = json.usage?.prompt_tokens ?? 2000;
    const completionTokens = json.usage?.completion_tokens ?? 300;
    const costUsd = estimateCostUsd(tier, promptTokens, completionTokens);

    return { score, rationale, costUsd };
  }

  throw new Error("unreachable");
}

function estimateCostUsd(tier: string, inputTokens: number, outputTokens: number): number {
  const rates: Record<string, [number, number]> = {
    haiku: [0.25 / 1_000_000, 1.25 / 1_000_000],
    sonnet: [3 / 1_000_000, 15 / 1_000_000],
    opus: [15 / 1_000_000, 75 / 1_000_000],
  };
  const [inputRate, outputRate] = rates[tier] ?? [0, 0];
  return inputTokens * (inputRate ?? 0) + outputTokens * (outputRate ?? 0);
}

// ── Skill Evaluation ──────────────────────────────────────────────────

async function evaluateSkill(
  skill: SkillMeta,
  model: "haiku" | "sonnet" | "opus",
): Promise<AIReadyEvaluation> {
  const input: PromptInput = {
    specContent: skill.specContent,
    skillName: skill.name,
  };

  const criteriaResults: AIReadyScore[] = [];
  let totalCost = 0;

  for (const criterion of ALL_AI_READY_CRITERIA as AIReadyCriterion[]) {
    const prompt = buildPrompt(criterion, input);
    const { score, rationale, costUsd } = await callLlmJson(prompt, model);
    totalCost += costUsd;
    criteriaResults.push({
      criterion,
      score,
      rationale: rationale.length >= 20 ? rationale : `점수 ${score.toFixed(2)}: ${rationale || "근거 없음"}`.padEnd(20),
      passThreshold: 0.75,
      passed: score >= 0.75,
    });
  }

  const totalScore = criteriaResults.reduce((s, c) => s + c.score, 0) / 6;
  const passCount = criteriaResults.filter((c) => c.passed).length;

  return AIReadyEvaluationSchema.parse({
    skillId: skill.id,
    skillName: skill.name,
    criteria: criteriaResults,
    totalScore: Math.round(totalScore * 1000) / 1000,
    passCount,
    overallPassed: passCount >= 4,
    modelVersion: model,
    evaluatedAt: new Date().toISOString(),
    costUsd: Math.round(totalCost * 1_000_000) / 1_000_000,
  });
}

// ── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  useAnthropicDirect = args.directAnthropic;
  useOpenRouter = args.openrouter;
  const today = new Date().toISOString().slice(0, 10);
  const specDirAbs = resolve(args.specDir);
  const route = useOpenRouter ? "OpenRouter (TD-43 fallback)" : useAnthropicDirect ? "Direct Anthropic" : "svc-llm-router";

  console.log(`\n🔍 AI-Ready 채점기 — Sprint 232 F402 (TD-42 재작)`);
  console.log(`   spec-dir: ${specDirAbs}`);
  console.log(`   모델: ${args.model} | 출력: ${args.output}`);
  console.log(`   호출 경로: ${route}`);
  if (args.prefix) {
    console.log(`   prefix 필터: ${args.prefix}* (F492 Sprint 325)`);
  }
  console.log("");

  // Step 0: spec-container 목록 확인 (dry-run 포함)
  const skills = await loadSpecContainers(specDirAbs, args.prefix);
  console.log(`📦 spec-containers: ${skills.length}개 — ${skills.map((s) => s.name).join(", ")}`);

  if (args.dryRun) {
    console.log("\n🔵 [Dry-Run] 실행 계획만 출력합니다.\n");
    console.log(`  containers: ${skills.length}개`);
    console.log(`  LLM 호출: ${skills.length} × 6 = ${skills.length * 6}회`);
    console.log(`  예상 비용 (Haiku): $${(skills.length * 6 * estimateCostUsd("haiku", 2000, 300)).toFixed(4)}`);
    return;
  }

  // Step 1: 사전 비용 체크
  console.log("\n💰 일일 누적 비용 확인 중...");
  const dailyBase = await fetchTodayUsageUsd();
  if (dailyBase >= HARD_LIMIT_USD) {
    console.error(`❌ 오늘 LLM 비용이 이미 $${dailyBase.toFixed(2)} — $30 가드 초과. 중단.`);
    process.exit(1);
  }
  if (dailyBase >= WARN_THRESHOLD_USD) {
    console.warn(`⚠️  오늘 누적 $${dailyBase.toFixed(2)} — 잔여 $${(HARD_LIMIT_USD - dailyBase).toFixed(2)}`);
  }
  console.log(`   기존 누적: $${dailyBase.toFixed(4)}\n`);

  // Step 2: 배치 평가 (순차 — 7개 × 6 = 42 호출)
  const evaluations: AIReadyEvaluation[] = [];
  let cumulativeCost = 0;

  console.log(`🚀 평가 시작: ${skills.length} skill × 6 기준 = ${skills.length * 6}회 LLM 호출\n`);

  for (const skill of skills) {
    const guard = checkCostGuard(cumulativeCost, dailyBase);
    if (guard === "stop") {
      console.error(`\n❌ 비용 가드 초과 ($${(cumulativeCost + dailyBase).toFixed(2)} >= $${HARD_LIMIT_USD})`);
      console.error(`   ${evaluations.length} skill 처리 후 중단`);
      break;
    }
    if (guard === "warn") {
      console.warn(`⚠️  누적 비용 $${(cumulativeCost + dailyBase).toFixed(2)} — 잔여 $${(HARD_LIMIT_USD - cumulativeCost - dailyBase).toFixed(2)}`);
    }

    process.stdout.write(`   평가 중: ${skill.name}...`);
    const result = await evaluateSkill(skill, args.model);
    evaluations.push(result);
    cumulativeCost += result.costUsd;

    const passStr = result.overallPassed ? "✅ PASS" : "❌ FAIL";
    console.log(
      ` ${passStr} (avg=${result.totalScore.toFixed(3)}, pass=${result.passCount}/6, cost=$${result.costUsd.toFixed(4)})`,
    );
  }

  console.log("");

  // Step 3: 리포트 저장
  const report = AIReadyBatchReportSchema.parse({
    executedAt: new Date().toISOString(),
    modelVersion: args.model,
    totalSkills: evaluations.length,
    totalCostUsd: Math.round(cumulativeCost * 1_000_000) / 1_000_000,
    evaluations,
  });

  const outputDir = args.output.includes("/") ? args.output.split("/").slice(0, -1).join("/") : ".";
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }
  await writeFile(args.output, JSON.stringify(report, null, 2), "utf-8");

  const passCount = evaluations.filter((e) => e.overallPassed).length;
  const avgScore = evaluations.reduce((s, e) => s + e.totalScore, 0) / Math.max(evaluations.length, 1);

  console.log(`✅ 완료`);
  console.log(`   처리: ${evaluations.length} skill`);
  console.log(`   AI-Ready PASS: ${passCount}/${evaluations.length} (${((passCount / Math.max(evaluations.length, 1)) * 100).toFixed(1)}%)`);
  console.log(`   평균 점수: ${avgScore.toFixed(3)}`);
  console.log(`   총 비용: $${cumulativeCost.toFixed(4)}`);
  console.log(`   리포트: ${args.output}`);
  console.log(`\n📋 다음 단계: 1건 수기 재채점 후 accuracy 리포트 작성`);
  console.log(`   정확도 ≥ 80% → F356-B (Phase 2) 착수 GO\n`);

  // Accuracy report template
  const accuracyPath = args.output.replace(".json", `-accuracy-${today}.md`);
  const template = generateAccuracyTemplate(today, evaluations);
  await writeFile(accuracyPath, template, "utf-8");
  console.log(`📝 수기 검증 템플릿: ${accuracyPath}`);
}

function generateAccuracyTemplate(date: string, evaluations: AIReadyEvaluation[]): string {
  const sample1 = evaluations[0] ? `- [ ] ${evaluations[0].skillName} (6기준 × 1건 = 6 pair)` : "";

  return `# AI-Ready PoC Accuracy Report (${date})

## Summary
- 총 평가: ${evaluations.length} spec-container × 6기준 = ${evaluations.length * 6} 점수
- 수기 검증 샘플: 1건 × 6기준 = 6 pair (10% of ${evaluations.length})
- 일치 (|diff| ≤ 0.1): {N} pair  ← 수기 입력 필요
- 정확도: {N/6 * 100}%
- 판정: ✅ GO / ⚠️ 프롬프트 iterate / ❌ 재설계

## 수기 재채점 대상 1건
${sample1}

## 기준별 정확도 (수기 입력 후 채우기)
| Criterion | LLM 점수 | 수기 점수 | |diff| ≤ 0.1 |
|-----------|:-------:|:-------:|:----------:|
| 1. 소스코드 정합성 | {LLM} | {Manual} | ✅/❌ |
| 2. 주석·문서 일치 | {LLM} | {Manual} | ✅/❌ |
| 3. 입출력 구조 명확성 | {LLM} | {Manual} | ✅/❌ |
| 4. 예외·에러 핸들링 | {LLM} | {Manual} | ✅/❌ |
| 5. 업무루틴 분리·재사용성 | {LLM} | {Manual} | ✅/❌ |
| 6. 테스트 가능성 | {LLM} | {Manual} | ✅/❌ |

## 실패 Case 원인 분석
(수기 검증 후 작성)

## Phase 2 권고
- [ ] GO → F356-B 착수 (정확도 ≥ 80%)
- [ ] iterate → 프롬프트 개선 후 재측정 (60~80%)
- [ ] 재설계 → 기준 재정의 필요 (< 60%)
`;
}

main().catch((e: unknown) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
