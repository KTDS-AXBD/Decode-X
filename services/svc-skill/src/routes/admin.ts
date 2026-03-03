/**
 * Admin routes for svc-skill — backfill and maintenance operations.
 */

import { createLogger, ok, errFromUnknown } from "@ai-foundry/utils";
import type { Env } from "../env.js";

const logger = createLogger("svc-skill:admin");

interface SkillPackagePolicy {
  condition: string;
  criteria: string;
  outcome: string;
}

interface SkillPackageJson {
  policies: SkillPackagePolicy[];
}

/**
 * POST /admin/backfill-depth
 *
 * Reads each skill's R2 package, computes content_depth, and updates D1.
 * Processes in batches to avoid Worker timeout.
 * Query params:
 *   - batchSize (default 50, max 200): skills per batch
 */
export async function handleBackfillDepth(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const batchSize = Math.min(Number(url.searchParams.get("batchSize") ?? "50"), 200);

  // Fetch skills that haven't been scored yet (content_depth = 0)
  // Always use OFFSET 0 since each batch updates rows, shrinking the result set
  const rows = await env.DB_SKILL.prepare(
    "SELECT skill_id, r2_key FROM skills WHERE content_depth = 0 ORDER BY created_at ASC LIMIT ?",
  )
    .bind(batchSize)
    .all<{ skill_id: string; r2_key: string }>();

  const results = rows.results ?? [];
  let updated = 0;
  let failed = 0;

  for (const row of results) {
    try {
      const r2Obj = await env.R2_SKILL_PACKAGES.get(row["r2_key"]);
      if (!r2Obj) {
        logger.warn("R2 object not found during backfill", { skillId: row["skill_id"] });
        failed++;
        continue;
      }

      const pkg = (await r2Obj.json()) as SkillPackageJson;
      const policies = pkg.policies ?? [];
      let depth = 0;
      for (const p of policies) {
        depth += (p.condition?.length ?? 0) + (p.criteria?.length ?? 0) + (p.outcome?.length ?? 0);
      }

      await env.DB_SKILL.prepare(
        "UPDATE skills SET content_depth = ? WHERE skill_id = ?",
      )
        .bind(depth, row["skill_id"])
        .run();

      updated++;
    } catch (e) {
      logger.warn("Backfill error for skill", { skillId: row["skill_id"], error: String(e) });
      failed++;
    }
  }

  // Check remaining
  const remaining = await env.DB_SKILL.prepare(
    "SELECT COUNT(*) as cnt FROM skills WHERE content_depth = 0",
  )
    .first<{ cnt: number }>();

  logger.info("Backfill depth batch completed", { updated, failed, remaining: remaining?.cnt });

  return ok({
    updated,
    failed,
    batchSize,
    remaining: remaining?.cnt ?? 0,
  });
}
