/**
 * Admin routes for svc-skill — backfill and maintenance operations.
 */

import type { SkillPackage } from "@ai-foundry/types";
import { createLogger, ok, badRequest, errFromUnknown } from "@ai-foundry/utils";
import type { Env } from "../env.js";
import { generateAndStoreAdapters } from "../assembler/adapter-writer.js";
import { rebundleSkills } from "../bundler/rebundle-orchestrator.js";
import { scoreSkill } from "../scoring/ai-ready.js";

const logger = createLogger("svc-skill:admin");

// ── Trust Score Computation ────────────────────────────────────────

/** Base trust by review status */
const BASE_TRUST: Record<string, number> = {
  validated: 0.9,
  reviewed: 0.7,
  unreviewed: 0.3,
};

/**
 * Compute quality factor from content_depth (total chars of condition+criteria+outcome).
 *   depth ≥ 200 (Rich)   → 1.0
 *   depth ≥ 50  (Medium)  → 0.7 + 0.3 × (depth-50)/150
 *   depth < 50  (Thin)    → 0.5 + 0.2 × depth/50
 */
function qualityFactor(depth: number): number {
  if (depth >= 200) return 1.0;
  if (depth >= 50) return 0.7 + (0.3 * (depth - 50)) / 150;
  return 0.5 + (0.2 * depth) / 50;
}

/** Round to 3 decimal places */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

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

// ── Backfill Trust Score ───────────────────────────────────────────

interface TrustRow {
  skill_id: string;
  trust_level: string;
  content_depth: number | null;
}

/**
 * POST /admin/backfill-trust
 *
 * Computes trust_score from D1 columns (trust_level + content_depth).
 * No R2 reads or LLM calls — pure SQL + in-memory computation.
 *
 * Formula: trust_score = baseTrust(trust_level) × qualityFactor(content_depth)
 *
 * Query params:
 *   - batchSize (default 200, max 1000): skills per batch
 *   - force (default false): re-score skills that already have trust_score > 0
 */
export async function handleBackfillTrust(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const batchSize = Math.min(Number(url.searchParams.get("batchSize") ?? "200"), 1000);
  const force = url.searchParams.get("force") === "true";

  const whereClause = force
    ? "WHERE trust_level IS NOT NULL"
    : "WHERE trust_score = 0 OR trust_score IS NULL";

  const rows = await env.DB_SKILL.prepare(
    `SELECT skill_id, trust_level, content_depth FROM skills ${whereClause} ORDER BY created_at ASC LIMIT ?`,
  )
    .bind(batchSize)
    .all<TrustRow>();

  const results = rows.results ?? [];
  let updated = 0;
  let failed = 0;
  const distribution = { high: 0, medium: 0, low: 0 };

  for (const row of results) {
    try {
      const base = BASE_TRUST[row["trust_level"]] ?? 0.3;
      const depth = row["content_depth"] ?? 0;
      const score = round3(base * qualityFactor(depth));

      await env.DB_SKILL.prepare(
        "UPDATE skills SET trust_score = ? WHERE skill_id = ?",
      )
        .bind(score, row["skill_id"])
        .run();

      if (score >= 0.6) distribution.high++;
      else if (score >= 0.4) distribution.medium++;
      else distribution.low++;

      updated++;
    } catch (e) {
      logger.warn("Trust backfill error", { skillId: row["skill_id"], error: String(e) });
      failed++;
    }
  }

  const remainingCondition = force
    ? "SELECT 0 as cnt"
    : "SELECT COUNT(*) as cnt FROM skills WHERE trust_score = 0 OR trust_score IS NULL";
  const remaining = await env.DB_SKILL.prepare(remainingCondition).first<{ cnt: number }>();

  logger.info("Backfill trust batch completed", {
    updated,
    failed,
    distribution,
    remaining: remaining?.cnt,
  });

  return ok({
    updated,
    failed,
    batchSize,
    remaining: remaining?.cnt ?? 0,
    distribution,
  });
}

// ── Rebundle Skills ──────────────────────────────────────────────

/**
 * POST /admin/rebundle
 *
 * Classifies all approved policies for an organization via LLM,
 * then bundles them into ~10-25 functional skill packages.
 *
 * Query params:
 *   - organizationId (required): target organization
 *   - domain (required): domain name (e.g., "giftvoucher", "pension")
 */
export async function handleRebundle(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  const domain = url.searchParams.get("domain");

  if (!organizationId || !domain) {
    return badRequest("organizationId and domain query params are required");
  }

  try {
    const result = await rebundleSkills(env, ctx, organizationId, domain);
    logger.info("Rebundle completed", { organizationId, bundles: result.bundlesCreated });
    return ok(result);
  } catch (e) {
    logger.error("Rebundle failed", { error: String(e), organizationId, domain });
    return errFromUnknown(e);
  }
}

// ── Backfill Adapters ──────────────────────────────────────────────

/**
 * POST /admin/backfill-adapters
 *
 * Generates MCP + OpenAPI adapter files for existing skills that have
 * empty adapters (adapters.mcp and adapters.openapi both missing).
 * Updates R2 skill package with adapter R2 keys.
 *
 * Query params:
 *   - batchSize (default 50, max 200): skills per batch
 */
export async function handleBackfillAdapters(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const batchSize = Math.min(Number(url.searchParams.get("batchSize") ?? "50"), 200);

  const rows = await env.DB_SKILL.prepare(
    "SELECT skill_id, r2_key FROM skills ORDER BY created_at ASC LIMIT ?",
  )
    .bind(batchSize)
    .all<{ skill_id: string; r2_key: string }>();

  const results = rows.results ?? [];
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of results) {
    try {
      const r2Obj = await env.R2_SKILL_PACKAGES.get(row["r2_key"]);
      if (!r2Obj) {
        logger.warn("R2 object not found during adapter backfill", { skillId: row["skill_id"] });
        failed++;
        continue;
      }

      const pkg = (await r2Obj.json()) as SkillPackage;

      // Skip if adapters already populated
      if (pkg.adapters.mcp && pkg.adapters.openapi) {
        skipped++;
        continue;
      }

      // Generate and store adapters
      const adapterKeys = await generateAndStoreAdapters(pkg, env.R2_SKILL_PACKAGES);

      // Update the skill package with adapter keys and re-store
      const updatedPkg = { ...pkg, adapters: adapterKeys };
      await env.R2_SKILL_PACKAGES.put(row["r2_key"], JSON.stringify(updatedPkg, null, 2), {
        httpMetadata: { contentType: "application/json" },
      });

      updated++;
    } catch (e) {
      logger.warn("Adapter backfill error for skill", { skillId: row["skill_id"], error: String(e) });
      failed++;
    }
  }

  // Count remaining skills without adapters (approximate — check R2 would be too expensive)
  const totalCount = await env.DB_SKILL.prepare(
    "SELECT COUNT(*) as cnt FROM skills",
  ).first<{ cnt: number }>();

  logger.info("Backfill adapters batch completed", { updated, skipped, failed });

  return ok({
    updated,
    skipped,
    failed,
    batchSize,
    totalSkills: totalCount?.cnt ?? 0,
  });
}

// ── Skill Detail (B/T/Q Drill-down) ───────────────────────────────

/**
 * GET /admin/skill-detail/:skillId
 *
 * Returns a detailed breakdown of a skill's AI-Ready score including
 * the raw B/T/Q (Business/Technical/Quality) signals and policy text.
 */
export async function handleSkillDetail(
  request: Request,
  env: Env,
  skillId: string,
): Promise<Response> {
  // Get R2 key from D1
  const row = await env.DB_SKILL.prepare(
    "SELECT r2_key, organization_id, domain, status, created_at FROM skills WHERE skill_id = ?",
  )
    .bind(skillId)
    .first<{ r2_key: string; organization_id: string; domain: string; status: string; created_at: string }>();

  if (!row) {
    return new Response(
      JSON.stringify({ error: "Skill not found", skillId }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // Fetch skill package from R2
  const r2Obj = await env.R2_SKILL_PACKAGES.get(row["r2_key"]);
  if (!r2Obj) {
    logger.error("R2 object not found for skill-detail", { skillId, r2Key: row["r2_key"] });
    return new Response(
      JSON.stringify({ error: "Skill package file not found in R2", skillId }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const pkg = (await r2Obj.json()) as SkillPackage;

  // Score AI-Ready
  const aiReady = scoreSkill(pkg);

  // Build policy breakdown with raw B/T/Q text
  const policyDetails = pkg.policies.map((p) => ({
    code: p.code,
    title: p.title,
    condition: p.condition,
    criteria: p.criteria,
    outcome: p.outcome,
    trust: p.trust,
    tags: p.tags,
    source: {
      documentId: p.source.documentId,
      pageRef: p.source.pageRef ?? null,
      excerptLength: p.source.excerpt?.length ?? 0,
    },
  }));

  return ok({
    skillId,
    organizationId: row["organization_id"],
    domain: row["domain"],
    status: row["status"],
    createdAt: row["created_at"],
    adapters: pkg.adapters,
    aiReady,
    policies: policyDetails,
    ontologyRef: {
      graphId: pkg.ontologyRef.graphId,
      termCount: pkg.ontologyRef.termUris.length,
      hasSkos: Boolean(pkg.ontologyRef.skosConceptScheme),
    },
    provenance: {
      sourceDocCount: pkg.provenance.sourceDocumentIds.length,
      pipeline: pkg.provenance.pipeline,
    },
  });
}
