/**
 * AI-Ready D1 repository — INSERT/SELECT helpers.
 * Idempotent inserts (INSERT OR IGNORE) to support Queue retry safety.
 */

import type { AIReadyEvaluation, AIReadyBatchStatus } from "@ai-foundry/types";
import type { Env } from "../env.js";

export interface BatchRow {
  batch_id: string;
  organization_id: string;
  model: string;
  parent_batch_id: string | null;
  status: "queued" | "running" | "completed" | "failed" | "partial";
  total_skills: number;
  completed_skills: number;
  failed_skills: number;
  total_cost_usd: number;
  started_at: string;
  completed_at: string | null;
  metadata_json: string | null;
}

export interface ScoreRow {
  id: string;
  skill_id: string;
  organization_id: string;
  criterion: string;
  score: number;
  rationale: string;
  passed: number;
  pass_threshold: number;
  model: string;
  batch_id: string | null;
  evaluated_at: string;
  cost_usd: number;
}

export async function insertBatch(
  env: Env,
  opts: {
    organizationId: string;
    model: string;
    totalSkills: number;
    parentBatchId?: string;
    metadataJson?: string;
  },
): Promise<string> {
  const batchId = crypto.randomUUID();
  await env.DB_SKILL.prepare(
    `INSERT INTO ai_ready_batches
       (batch_id, organization_id, model, parent_batch_id, status,
        total_skills, completed_skills, failed_skills, total_cost_usd,
        started_at, completed_at, metadata_json)
     VALUES (?,?,?,?,?,?,0,0,0,?,NULL,?)`,
  )
    .bind(
      batchId,
      opts.organizationId,
      opts.model,
      opts.parentBatchId ?? null,
      "queued",
      opts.totalSkills,
      new Date().toISOString(),
      opts.metadataJson ?? null,
    )
    .run();
  return batchId;
}

export async function getBatch(env: Env, batchId: string): Promise<BatchRow | null> {
  return env.DB_SKILL.prepare(
    `SELECT * FROM ai_ready_batches WHERE batch_id = ?`,
  )
    .bind(batchId)
    .first<BatchRow>();
}

export async function getRunningBatchForOrg(
  env: Env,
  organizationId: string,
  model: string,
): Promise<BatchRow | null> {
  return env.DB_SKILL.prepare(
    `SELECT * FROM ai_ready_batches
     WHERE organization_id = ? AND model = ? AND status IN ('queued','running')
     ORDER BY started_at DESC LIMIT 1`,
  )
    .bind(organizationId, model)
    .first<BatchRow>();
}

export async function updateBatchStatus(
  env: Env,
  batchId: string,
  status: BatchRow["status"],
  completedAt?: string,
): Promise<void> {
  await env.DB_SKILL.prepare(
    `UPDATE ai_ready_batches SET status = ?, completed_at = ? WHERE batch_id = ?`,
  )
    .bind(status, completedAt ?? null, batchId)
    .run();
}

export async function updateBatchProgress(
  env: Env,
  batchId: string,
  delta: { completed?: number; failed?: number; costUsd?: number },
): Promise<BatchRow | null> {
  await env.DB_SKILL.prepare(
    `UPDATE ai_ready_batches SET
       completed_skills = completed_skills + ?,
       failed_skills    = failed_skills    + ?,
       total_cost_usd   = total_cost_usd   + ?
     WHERE batch_id = ?`,
  )
    .bind(delta.completed ?? 0, delta.failed ?? 0, delta.costUsd ?? 0, batchId)
    .run();

  const row = await getBatch(env, batchId);
  if (row && row.completed_skills + row.failed_skills >= row.total_skills) {
    const finalStatus: BatchRow["status"] = row.failed_skills > 0 ? "partial" : "completed";
    await updateBatchStatus(env, batchId, finalStatus, new Date().toISOString());
    return getBatch(env, batchId);
  }
  return row;
}

export async function insertScores(
  env: Env,
  evaluation: AIReadyEvaluation,
  skillId: string,
  organizationId: string,
  batchId: string | null,
  model: string,
): Promise<void> {
  const costPerCriterion = evaluation.costUsd / evaluation.criteria.length;
  await Promise.all(
    evaluation.criteria.map((c) =>
      env.DB_SKILL.prepare(
        `INSERT OR IGNORE INTO ai_ready_scores
           (id, skill_id, organization_id, criterion, score, rationale,
            passed, pass_threshold, model, batch_id, evaluated_at, cost_usd)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
        .bind(
          crypto.randomUUID(),
          skillId,
          organizationId,
          c.criterion,
          c.score,
          c.rationale,
          c.passed ? 1 : 0,
          c.passThreshold,
          model,
          batchId,
          evaluation.evaluatedAt,
          Math.round(costPerCriterion * 100000) / 100000,
        )
        .run(),
    ),
  );
}

export async function getLatestEvaluation(
  env: Env,
  skillId: string,
  model: string,
  maxAgeMs = 3600_000,
): Promise<ScoreRow[] | null> {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const rows = await env.DB_SKILL.prepare(
    `SELECT * FROM ai_ready_scores
     WHERE skill_id = ? AND model = ? AND evaluated_at > ?
     ORDER BY evaluated_at DESC LIMIT 6`,
  )
    .bind(skillId, model, cutoff)
    .all<ScoreRow>();

  if (!rows.results || rows.results.length < 6) return null;
  return rows.results;
}

export async function listEvaluations(
  env: Env,
  skillId: string,
  opts: { model?: string; criterion?: string; limit: number; cursor?: string },
): Promise<{ rows: ScoreRow[]; nextCursor: string | null }> {
  const conditions: string[] = ["skill_id = ?"];
  const binds: (string | number)[] = [skillId];

  if (opts.model) {
    conditions.push("model = ?");
    binds.push(opts.model);
  }
  if (opts.criterion) {
    conditions.push("criterion = ?");
    binds.push(opts.criterion);
  }
  if (opts.cursor) {
    conditions.push("evaluated_at < ?");
    binds.push(opts.cursor);
  }

  const where = conditions.join(" AND ");
  const result = await env.DB_SKILL.prepare(
    `SELECT * FROM ai_ready_scores WHERE ${where}
     ORDER BY evaluated_at DESC LIMIT ?`,
  )
    .bind(...binds, opts.limit + 1)
    .all<ScoreRow>();

  const rows = result.results ?? [];
  const hasMore = rows.length > opts.limit;
  const page = hasMore ? rows.slice(0, opts.limit) : rows;
  const nextCursor = hasMore ? (page[page.length - 1]?.evaluated_at ?? null) : null;
  return { rows: page, nextCursor };
}

export function batchRowToStatus(row: BatchRow, childBatchId: string | null, avgScore: number | null): AIReadyBatchStatus {
  const done = row.completed_skills + row.failed_skills;
  const progressPct = row.total_skills > 0 ? Math.round((done / row.total_skills) * 1000) / 10 : 0;
  return {
    batchId: row.batch_id,
    status: row.status,
    totalSkills: row.total_skills,
    completedSkills: row.completed_skills,
    failedSkills: row.failed_skills,
    progressPct,
    totalCostUsd: row.total_cost_usd,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    childBatchId,
    avgScore,
  };
}
