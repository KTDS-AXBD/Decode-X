/**
 * F356-B: AI-Ready evaluation API routes (4 endpoints)
 *
 * POST /skills/:id/ai-ready/evaluate  — single sync eval (Analyst+)
 * POST /skills/ai-ready/batch         — async batch trigger (Developer+)
 * GET  /skills/:id/ai-ready/evaluations — history (All)
 * GET  /skills/ai-ready/batches/:batchId — batch status (All)
 */

import {
  AIReadySingleEvalRequestSchema,
  AIReadyBatchTriggerRequestSchema,
  type AIReadyEvaluation,
} from "@ai-foundry/types";
import {
  createLogger,
  ok,
  created,
  notFound,
  badRequest,
  errFromUnknown,
  extractRbacContext,
  checkPermission,
  logAuditLocal,
} from "@ai-foundry/utils";
import type { Env } from "../env.js";
import { loadSpecContent, runSixCriteriaEvaluation } from "../ai-ready/evaluator.js";
import {
  insertScores,
  getLatestEvaluation,
  listEvaluations,
  insertBatch,
  getBatch,
  getRunningBatchForOrg,
  batchRowToStatus,
} from "../ai-ready/repository.js";

const logger = createLogger("svc-skill:routes:ai-ready");

// ── Cost guard ─────────────────────────────────────────────────────────

const DAILY_COST_LIMIT_USD = 50;

async function checkDailyCostGuard(env: Env, organizationId: string): Promise<Response | null> {
  const today = new Date().toISOString().slice(0, 10);
  const result = await env.DB_SKILL.prepare(
    `SELECT COALESCE(SUM(total_cost_usd),0) as total
     FROM ai_ready_batches
     WHERE organization_id = ? AND started_at LIKE ?`,
  )
    .bind(organizationId, `${today}%`)
    .first<{ total: number }>();

  const total = result?.total ?? 0;
  if (total >= DAILY_COST_LIMIT_USD) {
    return new Response(
      JSON.stringify({ error: "Daily AI-Ready cost limit reached", dailyCostUsd: total }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}

// ── POST /skills/:id/ai-ready/evaluate ────────────────────────────────

export async function handleAiReadyEvaluateSingle(
  request: Request,
  env: Env,
  skillId: string,
): Promise<Response> {
  const rbacCtx = extractRbacContext(request);
  if (rbacCtx) {
    const denied = checkPermission(rbacCtx.role, "ai_ready", "execute");
    if (denied) return denied;
  }

  const organizationId = rbacCtx?.organizationId ?? request.headers.get("X-Organization-Id") ?? "LPON";

  let body: { model?: unknown; force?: unknown };
  try {
    body = (await request.json()) as { model?: unknown; force?: unknown };
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = AIReadySingleEvalRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Invalid request", parsed.error.flatten());
  }
  const { model, force, r2KeyOverride } = parsed.data;

  // Check skill exists and get r2_key (bundled skills have "bundle-" prefix in r2_key)
  const skillRow = await env.DB_SKILL.prepare(
    "SELECT skill_id, r2_key FROM skills WHERE skill_id = ? AND organization_id = ?",
  )
    .bind(skillId, organizationId)
    .first<{ skill_id: string; r2_key: string }>();
  if (!skillRow) {
    return notFound("skill", skillId);
  }

  // Check concurrent batch conflict
  const runningBatch = await getRunningBatchForOrg(env, organizationId, model);
  if (runningBatch) {
    return new Response(
      JSON.stringify({ error: "Batch already running for this org+model", batchId: runningBatch.batch_id }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  // Return cached if within 1h and not forced
  if (!force) {
    const cached = await getLatestEvaluation(env, skillId, model);
    if (cached && cached.length === 6) {
      const first = cached[0]!;
      const evalResult: AIReadyEvaluation = {
        skillId,
        skillName: skillId,
        criteria: cached.map((r) => ({
          criterion: r.criterion as AIReadyEvaluation["criteria"][number]["criterion"],
          score: r.score,
          rationale: r.rationale,
          passed: r.passed === 1,
          passThreshold: 0.6 as const,
        })),
        totalScore: cached.reduce((s, r) => s + r.score, 0) / cached.length,
        passCount: cached.filter((r) => r.passed === 1).length,
        overallPassed: cached.filter((r) => r.passed === 1).length >= 4,
        modelVersion: first.model,
        evaluatedAt: first.evaluated_at,
        costUsd: 0,
      };
      return ok({ ...evalResult, cached: true });
    }
  }

  // Daily cost guard
  const costBlock = await checkDailyCostGuard(env, organizationId);
  if (costBlock) return costBlock;

  try {
    const loaded = await loadSpecContent(env, skillId, organizationId, r2KeyOverride ?? skillRow["r2_key"]);
    if (!loaded) {
      return notFound("skill-r2", skillId);
    }

    const evaluation = await runSixCriteriaEvaluation(env, loaded.specContent, loaded.skillName, model);
    await insertScores(env, evaluation, skillId, organizationId, null, model);

    if (rbacCtx) {
      logAuditLocal({
        userId: rbacCtx.userId,
        organizationId,
        action: "execute",
        resource: "ai_ready",
        resourceId: skillId,
        details: { model, costUsd: evaluation.costUsd },
      });
    }

    const totalScore = evaluation.criteria.reduce((s, c) => s + c.score, 0) / evaluation.criteria.length;
    return ok({
      skillId,
      model,
      criteria: evaluation.criteria,
      totalScore: Math.round(totalScore * 1000) / 1000,
      passCount: evaluation.passCount,
      overallPassed: evaluation.overallPassed,
      evaluatedAt: evaluation.evaluatedAt,
      costUsd: evaluation.costUsd,
    });
  } catch (e) {
    logger.error("Single eval failed", { skillId, model, error: String(e) });
    return errFromUnknown(e);
  }
}

// ── POST /skills/ai-ready/batch ────────────────────────────────────────

export async function handleAiReadyBatchTrigger(
  request: Request,
  env: Env,
): Promise<Response> {
  const rbacCtx = extractRbacContext(request);
  if (rbacCtx) {
    const denied = checkPermission(rbacCtx.role, "ai_ready", "create");
    if (denied) return denied;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = AIReadyBatchTriggerRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Invalid request", parsed.error.flatten());
  }
  const { model, organizationId, crossCheckSampleSize, dryRun } = parsed.data;

  // Check existing running batch
  const existing = await getRunningBatchForOrg(env, organizationId, model);
  if (existing) {
    return new Response(
      JSON.stringify({ error: "Batch already running", batchId: existing.batch_id }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  // Fetch skill IDs for org
  const skillsResult = await env.DB_SKILL.prepare(
    "SELECT skill_id FROM skills WHERE organization_id = ? AND status IN ('bundled','reviewed')",
  )
    .bind(organizationId)
    .all<{ skill_id: string }>();

  const skillIds = (skillsResult.results ?? []).map((r) => r.skill_id);
  const totalSkills = skillIds.length;

  if (totalSkills === 0) {
    return badRequest(`No published skills found for organization: ${organizationId}`);
  }

  // Cost estimate: haiku ~$0.023/skill, opus ~$0.18/skill
  const costPerSkill = model === "opus" ? 0.18 : model === "sonnet" ? 0.036 : 0.023;
  const estimatedCostUsd = Math.round(totalSkills * costPerSkill * 100) / 100;
  const estimatedDurationMinutes = Math.ceil(totalSkills / 10 / 60 * 2 + 2);

  if (dryRun) {
    return ok({
      dryRun: true,
      totalSkills,
      estimatedCostUsd,
      estimatedDurationMinutes,
      sampleSkillIds: skillIds.slice(0, 5),
    });
  }

  // Cost pre-check
  if (estimatedCostUsd > DAILY_COST_LIMIT_USD) {
    return new Response(
      JSON.stringify({
        error: "Estimated cost exceeds daily limit",
        estimatedCostUsd,
        limitUsd: DAILY_COST_LIMIT_USD,
      }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const batchId = await insertBatch(env, {
    organizationId,
    model,
    totalSkills,
    metadataJson: JSON.stringify({ crossCheckSampleSize }),
  });

  // Fan-out to queue
  await Promise.all(
    skillIds.map((skillId) =>
      env.AI_READY_QUEUE.send({
        batchId,
        skillId,
        organizationId,
        model,
        crossCheckSampleSize,
      }),
    ),
  );

  if (rbacCtx) {
    logAuditLocal({
      userId: rbacCtx.userId,
      organizationId,
      action: "create",
      resource: "ai_ready",
      details: { batchId, model, totalSkills },
    });
  }

  logger.info("Batch triggered", { batchId, organizationId, model, totalSkills });

  return created({
    batchId,
    totalSkills,
    estimatedCostUsd,
    estimatedDurationMinutes,
    crossCheckBatchId: null,
    status: "queued",
  });
}

// ── GET /skills/:id/ai-ready/evaluations ──────────────────────────────

export async function handleAiReadyListEvaluations(
  request: Request,
  env: Env,
  skillId: string,
): Promise<Response> {
  const url = new URL(request.url);
  const modelParam = url.searchParams.get("model");
  const criterionParam = url.searchParams.get("criterion");
  const limit = Math.min(100, parseInt(url.searchParams.get("limit") ?? "20", 10));
  const cursorParam = url.searchParams.get("cursor");

  const listOpts: { model?: string; criterion?: string; limit: number; cursor?: string } = { limit };
  if (modelParam !== null) listOpts.model = modelParam;
  if (criterionParam !== null) listOpts.criterion = criterionParam;
  if (cursorParam !== null) listOpts.cursor = cursorParam;

  const { rows, nextCursor } = await listEvaluations(env, skillId, listOpts);

  return ok({ evaluations: rows, nextCursor });
}

// ── GET /skills/ai-ready/batches/:batchId ─────────────────────────────

export async function handleAiReadyGetBatch(
  _request: Request,
  env: Env,
  batchId: string,
): Promise<Response> {
  const batch = await getBatch(env, batchId);
  if (!batch) return notFound("batch", batchId);

  // Find child batch (cross-check)
  const childRow = await env.DB_SKILL.prepare(
    "SELECT batch_id FROM ai_ready_batches WHERE parent_batch_id = ? LIMIT 1",
  )
    .bind(batchId)
    .first<{ batch_id: string }>();

  // Compute avg score for completed skills
  const avgResult = await env.DB_SKILL.prepare(
    `SELECT AVG(score) as avg_score
     FROM (SELECT AVG(score) as score FROM ai_ready_scores
           WHERE batch_id = ? GROUP BY skill_id)`,
  )
    .bind(batchId)
    .first<{ avg_score: number | null }>();

  const status = batchRowToStatus(
    batch,
    childRow?.batch_id ?? null,
    avgResult?.avg_score !== null && avgResult?.avg_score !== undefined
      ? Math.round((avgResult.avg_score) * 1000) / 1000
      : null,
  );

  return ok(status);
}
