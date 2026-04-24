/**
 * batch-evaluate.ts — AI-Ready 전수 배치 CLI (F356-B)
 *
 * Usage:
 *   pnpm tsx scripts/ai-ready/batch-evaluate.ts \
 *     --env production \
 *     --model haiku \
 *     --organization LPON \
 *     [--cross-check 100] \
 *     [--dry-run]
 *
 * Required env:
 *   SVC_SKILL_URL         — svc-skill production URL
 *   INTERNAL_API_SECRET   — X-Internal-Secret header value
 */

import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { resolve } from "path";
import readline from "readline";

// ── Args ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, def: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] !== undefined ? (args[idx + 1] as string) : def;
  };
  return {
    env: get("--env", "production"),
    model: get("--model", "haiku") as "haiku" | "opus" | "sonnet",
    organization: get("--organization", "LPON"),
    crossCheck: parseInt(get("--cross-check", "100"), 10),
    dryRun: args.includes("--dry-run"),
  };
}

// ── HTTP helpers ──────────────────────────────────────────────────────

function apiBase(env: string): string {
  if (env === "production") {
    return process.env["SVC_SKILL_URL"] ?? "https://svc-skill.ktds-axbd.workers.dev";
  }
  return "http://localhost:8705";
}

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Internal-Secret": process.env["INTERNAL_API_SECRET"] ?? "",
  };
}

async function apiFetch<T>(base: string, path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, { ...opts, headers: { ...headers(), ...(opts?.headers as Record<string, string> ?? {}) } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Interactive confirm ───────────────────────────────────────────────

function askConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

// ── Poll helpers ──────────────────────────────────────────────────────

interface BatchStatus {
  batchId: string;
  status: "queued" | "running" | "completed" | "failed" | "partial";
  totalSkills: number;
  completedSkills: number;
  failedSkills: number;
  progressPct: number;
  totalCostUsd: number;
  startedAt: string;
  completedAt: string | null;
  childBatchId: string | null;
  avgScore: number | null;
}

async function pollBatch(
  base: string,
  batchId: string,
  label: string,
  timeoutMs = 45 * 60 * 1000,
): Promise<BatchStatus> {
  const deadline = Date.now() + timeoutMs;
  let lastProgress = -1;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));

    const status = await apiFetch<{ data: BatchStatus }>(base, `/skills/ai-ready/batches/${batchId}`);
    const s = status.data;

    if (s.progressPct !== lastProgress) {
      lastProgress = s.progressPct;
      const bar = "█".repeat(Math.floor(s.progressPct / 5)).padEnd(20, "░");
      console.log(
        `[${label}] [${bar}] ${s.progressPct.toFixed(1)}% ` +
        `(${s.completedSkills}/${s.totalSkills}, failed=${s.failedSkills}, ` +
        `cost=$${s.totalCostUsd.toFixed(3)})`,
      );
    }

    if (s.totalCostUsd > 45) {
      console.warn(`⚠️  Cost warning: $${s.totalCostUsd.toFixed(2)} (limit $50)`);
    }

    if (["completed", "failed", "partial"].includes(s.status)) {
      return s;
    }
  }

  throw new Error(`Batch ${batchId} did not complete within ${timeoutMs / 60000} minutes`);
}

// ── Score retrieval ───────────────────────────────────────────────────
// NOTE: Full per-criterion score retrieval requires a batch-scoped endpoint
// which is out of scope for F356-B (Sprint-238). KPI criteria breakdown
// is deferred to Sprint-239 admin API. avgScore is available via batch status.

// ── KPI report ────────────────────────────────────────────────────────

interface KpiReport {
  executedAt: string;
  organization: string;
  model: string;
  batchId: string;
  totalSkills: number;
  completedSkills: number;
  failedSkills: number;
  totalCostUsd: number;
  avgScore: number | null;
  passRate: number;
  criteriaPassRates: Record<string, number>;
  scoreDistribution: Record<string, number>;
}

function buildKpiMarkdown(kpi: KpiReport, crossCheckBatchId: string | null): string {
  const dist = Object.entries(kpi.scoreDistribution)
    .map(([range, count]) => `| ${range} | ${count} |`)
    .join("\n");

  const criteriaTable = Object.entries(kpi.criteriaPassRates)
    .map(([c, rate]) => `| ${c} | ${(rate * 100).toFixed(1)}% |`)
    .join("\n");

  return `# AI-Ready 전수 배치 KPI Report

**실행일시**: ${kpi.executedAt}
**조직**: ${kpi.organization}
**모델**: ${kpi.model}
**배치 ID**: ${kpi.batchId}
${crossCheckBatchId ? `**교차검증 배치**: ${crossCheckBatchId}\n` : ""}
## 요약

| 항목 | 수치 |
|------|------|
| 전체 Skill | ${kpi.totalSkills} |
| 평가 완료 | ${kpi.completedSkills} |
| 실패 | ${kpi.failedSkills} |
| 총 비용 | $${kpi.totalCostUsd.toFixed(3)} |
| 평균 점수 | ${kpi.avgScore !== null ? kpi.avgScore.toFixed(3) : "N/A"} |
| PASS rate (≥4기준) | ${(kpi.passRate * 100).toFixed(1)}% |

## 기준별 PASS율

| 기준 | PASS율 |
|------|--------|
${criteriaTable}

## 점수 분포

| 구간 | 건수 |
|------|------|
${dist}
`;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  const base = apiBase(opts.env);

  console.log(`\n=== AI-Ready 전수 배치 평가 ===`);
  console.log(`  환경: ${opts.env}  모델: ${opts.model}  조직: ${opts.organization}`);
  console.log(`  교차검증: ${opts.crossCheck}건  dry-run: ${opts.dryRun}`);
  console.log(`  API: ${base}\n`);

  // Dry-run check
  interface DryRunResponse {
    data: {
      dryRun: boolean;
      totalSkills: number;
      estimatedCostUsd: number;
      estimatedDurationMinutes: number;
      sampleSkillIds: string[];
    };
  }
  const dryResult = await apiFetch<DryRunResponse>(base, "/skills/ai-ready/batch", {
    method: "POST",
    body: JSON.stringify({
      model: opts.model,
      organizationId: opts.organization,
      crossCheckSampleSize: opts.crossCheck,
      dryRun: true,
    }),
  });

  const dry = dryResult.data;
  console.log(`📊 사전 추정:`);
  console.log(`   Skill 수: ${dry.totalSkills}`);
  console.log(`   예상 비용: $${dry.estimatedCostUsd.toFixed(2)}`);
  console.log(`   예상 소요: ${dry.estimatedDurationMinutes}분`);
  console.log(`   샘플 IDs: ${dry.sampleSkillIds.slice(0, 3).join(", ")}...\n`);

  if (opts.dryRun) {
    console.log("✅ Dry-run 완료. --dry-run 플래그로 실행 없이 종료.");
    return;
  }

  if (dry.estimatedCostUsd > 50) {
    const proceed = await askConfirm(
      `⚠️  예상 비용 $${dry.estimatedCostUsd.toFixed(2)}가 $50를 초과합니다. 계속할까요?`,
    );
    if (!proceed) {
      console.log("중단됨.");
      process.exit(0);
    }
  }

  // Trigger batch
  interface BatchTriggerResponse {
    data: {
      batchId: string;
      totalSkills: number;
      estimatedCostUsd: number;
      estimatedDurationMinutes: number;
      status: string;
    };
  }
  const triggerResult = await apiFetch<BatchTriggerResponse>(base, "/skills/ai-ready/batch", {
    method: "POST",
    body: JSON.stringify({
      model: opts.model,
      organizationId: opts.organization,
      crossCheckSampleSize: opts.crossCheck,
      dryRun: false,
    }),
  });
  const { batchId } = triggerResult.data;
  console.log(`🚀 배치 시작: ${batchId}\n`);

  // Poll Haiku batch
  const finalStatus = await pollBatch(base, batchId, opts.model.toUpperCase());
  console.log(`\n✅ 배치 완료: status=${finalStatus.status}, cost=$${finalStatus.totalCostUsd.toFixed(3)}`);

  // Poll cross-check batch if triggered
  let crossCheckStatus: BatchStatus | null = null;
  if (finalStatus.childBatchId) {
    console.log(`\n🔄 Opus 교차검증 배치 시작: ${finalStatus.childBatchId}`);
    crossCheckStatus = await pollBatch(base, finalStatus.childBatchId, "OPUS");
    console.log(`\n✅ 교차검증 완료: cost=$${crossCheckStatus.totalCostUsd.toFixed(3)}`);
  }

  // Output reports
  const today = new Date().toISOString().slice(0, 10);
  const reportDir = resolve(process.cwd(), "reports");
  if (!existsSync(reportDir)) await mkdir(reportDir, { recursive: true });

  const kpi: KpiReport = {
    executedAt: new Date().toISOString(),
    organization: opts.organization,
    model: opts.model,
    batchId,
    totalSkills: finalStatus.totalSkills,
    completedSkills: finalStatus.completedSkills,
    failedSkills: finalStatus.failedSkills,
    totalCostUsd: finalStatus.totalCostUsd + (crossCheckStatus?.totalCostUsd ?? 0),
    avgScore: finalStatus.avgScore,
    // Criteria breakdown (passRate, criteriaPassRates, scoreDistribution) requires
    // per-batch score aggregation — deferred to Sprint-239 admin API.
    passRate: 0,
    criteriaPassRates: {},
    scoreDistribution: {},
  };

  const jsonPath = resolve(reportDir, `ai-ready-full-${today}.json`);
  const mdPath = resolve(reportDir, `ai-ready-full-${today}.md`);

  await writeFile(jsonPath, JSON.stringify({ batchStatus: finalStatus, crossCheckStatus, kpi }, null, 2));
  await writeFile(mdPath, buildKpiMarkdown(kpi, finalStatus.childBatchId));

  console.log(`\n📄 리포트 저장:`);
  console.log(`   JSON: ${jsonPath}`);
  console.log(`   MD:   ${mdPath}`);
  console.log(`\n🏁 완료`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
