/**
 * evaluate.ts — AI-Ready 6기준 LLM 채점 CLI (F356-A PoC)
 *
 * Usage:
 *   pnpm tsx scripts/ai-ready/evaluate.ts \
 *     [--sample 80] [--model haiku|sonnet|opus] [--tier-a-ratio 0.5] \
 *     [--output reports/ai-ready-poc-YYYY-MM-DD.json] \
 *     [--seed 20260422] [--opus-cross-check 10] [--dry-run]
 *
 * Required env:
 *   LLM_ROUTER_URL       — svc-llm-router HTTP URL
 *   SVC_SKILL_URL        — svc-skill HTTP URL
 *   INTERNAL_API_SECRET  — internal auth header value
 */

import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import {
  ALL_AI_READY_CRITERIA,
  AIReadyEvaluationSchema,
  AIReadyBatchReportSchema,
} from "../../packages/types/src/ai-ready.js";
import type { AIReadyEvaluation, AIReadyScore, AIReadyCriterion } from "../../packages/types/src/ai-ready.js";
import { buildPrompt } from "../../services/svc-skill/src/ai-ready/prompts.js";
import type { PromptInput } from "../../services/svc-skill/src/ai-ready/prompts.js";
import { loadTierASkills, loadRandomSkills } from "./sample-loader.js";
import type { SkillMeta } from "./sample-loader.js";

// ── Argument Parsing ──────────────────────────────────────────────────

function parseArgs(): {
  sample: number;
  model: "haiku" | "sonnet" | "opus";
  tierARatio: number;
  output: string;
  seed: number;
  opusCrossCheck: number;
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  const get = (flag: string, def: string): string => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] !== undefined ? (args[idx + 1] as string) : def;
  };
  const today = new Date().toISOString().slice(0, 10);
  return {
    sample: Number(get("--sample", "80")),
    model: get("--model", "haiku") as "haiku" | "sonnet" | "opus",
    tierARatio: Number(get("--tier-a-ratio", "0.5")),
    output: get("--output", `reports/ai-ready-poc-${today}.json`),
    seed: Number(get("--seed", "20260422")),
    opusCrossCheck: Number(get("--opus-cross-check", "0")),
    dryRun: args.includes("--dry-run"),
  };
}

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

async function callLlmJson(
  prompt: string,
  tier: "haiku" | "sonnet" | "opus",
): Promise<{ score: number; rationale: string; costUsd: number }> {
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

    // Extract JSON from response (strip markdown code blocks if present)
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
    sourceCode: skill.sourceCode,
    metadata: skill.metadata,
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

// ── Batch with concurrency control ────────────────────────────────────

async function* chunked<T>(arr: T[], size: number): AsyncGenerator<T[]> {
  for (let i = 0; i < arr.length; i += size) {
    yield arr.slice(i, i + size);
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  const today = new Date().toISOString().slice(0, 10);

  console.log(`\n🔍 AI-Ready PoC 채점기 — Sprint 230 F356-A`);
  console.log(`   샘플: ${args.sample} skill | 모델: ${args.model} | Tier-A 비율: ${args.tierARatio}`);
  console.log(`   출력: ${args.output}\n`);

  if (args.dryRun) {
    console.log("🔵 [Dry-Run] 실행 계획만 출력합니다.\n");
    const tierACount = Math.round(args.sample * args.tierARatio);
    const randomCount = args.sample - tierACount;
    console.log(`  Tier-A 샘플: ${tierACount}건 (lpon-* 7 subdomain 균등)`);
    console.log(`  무작위 샘플: ${randomCount}건 (pension + giftvoucher)`);
    console.log(`  LLM 호출: ${args.sample} × 6 = ${args.sample * 6}회`);
    console.log(`  예상 비용 (Haiku): $${(args.sample * 0.0034).toFixed(3)}`);
    return;
  }

  // Step 1: 사전 비용 체크
  console.log("💰 일일 누적 비용 확인 중...");
  const dailyBase = await fetchTodayUsageUsd();
  if (dailyBase >= HARD_LIMIT_USD) {
    console.error(`❌ 오늘 LLM 비용이 이미 $${dailyBase.toFixed(2)} — $30 가드 초과. 중단.`);
    process.exit(1);
  }
  if (dailyBase >= WARN_THRESHOLD_USD) {
    console.warn(`⚠️  오늘 누적 $${dailyBase.toFixed(2)} — 잔여 $${(HARD_LIMIT_USD - dailyBase).toFixed(2)}`);
  }
  console.log(`   기존 누적: $${dailyBase.toFixed(4)}\n`);

  // Step 2: 샘플링
  const tierACount = Math.round(args.sample * args.tierARatio);
  const randomCount = args.sample - tierACount;

  console.log(`📦 샘플링 시작... (seed=${args.seed})`);
  console.log(`   Tier-A: ${tierACount}건 로딩 중...`);
  const tierASkills = await loadTierASkills(tierACount, args.seed);
  console.log(`   ✅ Tier-A: ${tierASkills.length}건`);

  console.log(`   무작위: ${randomCount}건 로딩 중...`);
  const randomSkills = await loadRandomSkills(randomCount, ["pension", "giftvoucher"], args.seed);
  console.log(`   ✅ 무작위: ${randomSkills.length}건`);

  const allSkills = [...tierASkills, ...randomSkills];
  console.log(`\n🚀 평가 시작: ${allSkills.length} skill × 6 기준 = ${allSkills.length * 6}회 LLM 호출\n`);

  // Step 3: 배치 평가 (concurrency=5)
  const evaluations: AIReadyEvaluation[] = [];
  let cumulativeCost = 0;
  let completed = 0;

  for await (const batch of chunked(allSkills, 5)) {
    const guard = checkCostGuard(cumulativeCost, dailyBase);
    if (guard === "stop") {
      console.error(`\n❌ 비용 가드 초과 ($${(cumulativeCost + dailyBase).toFixed(2)} >= $${HARD_LIMIT_USD})`);
      console.error(`   ${evaluations.length} skill 처리 후 중단`);
      break;
    }
    if (guard === "warn") {
      console.warn(`⚠️  누적 비용 $${(cumulativeCost + dailyBase).toFixed(2)} — 잔여 $${(HARD_LIMIT_USD - cumulativeCost - dailyBase).toFixed(2)}`);
    }

    const results = await Promise.all(batch.map((skill) => evaluateSkill(skill, args.model)));
    evaluations.push(...results);
    cumulativeCost += results.reduce((s, r) => s + r.costUsd, 0);
    completed += batch.length;

    const passRate = evaluations.filter((e) => e.overallPassed).length / evaluations.length;
    const avgScore = evaluations.reduce((s, e) => s + e.totalScore, 0) / evaluations.length;
    process.stdout.write(
      `\r   진행: ${completed}/${allSkills.length} | 비용: $${cumulativeCost.toFixed(4)} | pass: ${(passRate * 100).toFixed(0)}% | avg: ${avgScore.toFixed(3)}`,
    );
  }

  console.log("\n");

  // Step 4: Opus 교차 검증 (--opus-cross-check N)
  if (args.opusCrossCheck > 0 && evaluations.length > 0) {
    console.log(`🔬 Opus 교차 검증: ${args.opusCrossCheck}건 (Haiku vs Opus 비교)`);
    const crossSample = evaluations.slice(0, args.opusCrossCheck);
    let haikusOpusDiffSum = 0;

    for (const eval_ of crossSample) {
      const skill = allSkills.find((s) => s.id === eval_.skillId);
      if (!skill) continue;
      const opusEval = await evaluateSkill(skill, "opus");
      const diffSum = eval_.criteria.reduce((sum, haikuC, i) => {
        const opusC = opusEval.criteria[i];
        return sum + (opusC ? Math.abs(haikuC.score - opusC.score) : 0);
      }, 0);
      haikusOpusDiffSum += diffSum / 6;
    }

    const avgDiff = haikusOpusDiffSum / crossSample.length;
    console.log(`   Haiku vs Opus |diff| 평균: ${avgDiff.toFixed(3)}`);
    if (avgDiff > 0.2) {
      console.warn("   ⚠️  Phase 2는 Opus 사용 권고 (|diff| > 0.2)");
    } else {
      console.log("   ✅ Haiku 정확도 충분 (|diff| <= 0.2)");
    }
  }

  // Step 5: 리포트 저장
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

  console.log(`\n✅ 완료`);
  console.log(`   처리: ${evaluations.length} skill`);
  console.log(`   AI-Ready PASS: ${passCount}/${evaluations.length} (${((passCount / Math.max(evaluations.length, 1)) * 100).toFixed(1)}%)`);
  console.log(`   평균 점수: ${avgScore.toFixed(3)}`);
  console.log(`   총 비용: $${cumulativeCost.toFixed(4)}`);
  console.log(`   리포트: ${args.output}`);
  console.log(`\n📋 다음 단계: 8건 수기 재채점 후 accuracy 리포트 작성`);
  console.log(`   정확도 ≥ 80% → F356-B (Sprint 231) 착수 GO\n`);

  // Accuracy report template
  const accuracyPath = args.output.replace(".json", `-accuracy-${today}.md`);
  const template = generateAccuracyTemplate(today, evaluations);
  await writeFile(accuracyPath, template, "utf-8");
  console.log(`📝 수기 검증 템플릿: ${accuracyPath}`);
}

function generateAccuracyTemplate(date: string, evaluations: AIReadyEvaluation[]): string {
  const sample8 = evaluations.slice(0, 8).map((e) => `- [ ] ${e.skillName} (${e.skillId})`).join("\n");

  return `# AI-Ready PoC Accuracy Report (${date})

## Summary
- 총 평가: ${evaluations.length} skill × 6기준 = ${evaluations.length * 6} 점수
- 수기 검증 샘플: 8건 × 6기준 = 48 pair
- 일치 (|diff| ≤ 0.1): {N} pair  ← 수기 입력 필요
- 정확도: {N/48 * 100}%
- 판정: ✅ GO / ⚠️ 프롬프트 iterate / ❌ 재설계

## 수기 재채점 대상 8건
${sample8}

## 기준별 정확도 (수기 입력 후 채우기)
| Criterion | Accuracy | Avg |LLM - Manual| |
|-----------|:--------:|----:|
| 1. 소스코드 정합성 | {X}/8 | 0.XX |
| 2. 주석·문서 일치 | {X}/8 | 0.XX |
| 3. 입출력 구조 명확성 | {X}/8 | 0.XX |
| 4. 예외·에러 핸들링 | {X}/8 | 0.XX |
| 5. 업무루틴 분리·재사용성 | {X}/8 | 0.XX |
| 6. 테스트 가능성 | {X}/8 | 0.XX |

## 실패 Case 원인 분석
(수기 검증 후 작성)

## Phase 2 권고
- [ ] GO → F356-B Sprint 231 착수
- [ ] iterate → 프롬프트 개선 후 재측정
- [ ] 재설계 → 기준 재정의 필요
`;
}

main().catch((e: unknown) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
