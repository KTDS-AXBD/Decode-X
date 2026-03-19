/**
 * GET /skills/:id/export-cc — Export a Skill as Claude Code Skill ZIP.
 *
 * Fetches .skill.json from R2, transforms into SKILL.md + policy markdown
 * files, packages them into a ZIP archive, and returns the binary.
 */

import type { SkillPackage } from "@ai-foundry/types";
import {
  createLogger,
  notFound,
  errFromUnknown,
} from "@ai-foundry/utils";
import type { Env } from "../env.js";
import { generateSkillMd, generatePolicyMd, buildCcSkillZip } from "../export/index.js";

const logger = createLogger("svc-skill:export-cc");

export async function handleExportCc(
  request: Request,
  env: Env,
  skillId: string,
  ctx: ExecutionContext,
): Promise<Response> {
  const orgId = request.headers.get("X-Organization-Id") ?? "unknown";

  // 1. Look up R2 key from DB
  const row = await env.DB_SKILL.prepare(
    "SELECT r2_key, name FROM skills WHERE skill_id = ? AND organization_id = ?",
  )
    .bind(skillId, orgId)
    .first<{ r2_key: string; name: string | null }>();

  if (!row) {
    return notFound("Skill", skillId);
  }

  // 2. Fetch .skill.json from R2
  const r2Object = await env.R2_SKILL_PACKAGES.get(row["r2_key"]);
  if (!r2Object) {
    logger.error("R2 object not found", { skillId, r2Key: row["r2_key"] });
    return notFound("Skill package file", skillId);
  }

  // 3. Parse SkillPackage
  const raw = await r2Object.text();
  let pkg: SkillPackage;
  try {
    pkg = JSON.parse(raw) as SkillPackage;
  } catch (e) {
    logger.error("Failed to parse skill package JSON", { skillId, error: String(e) });
    return errFromUnknown(e);
  }

  // 4. Generate SKILL.md
  const skillMd = generateSkillMd(pkg);

  // 5. Generate policy markdown files
  const policyMds = new Map<string, string>();
  for (const policy of pkg.policies) {
    policyMds.set(policy.code, generatePolicyMd(policy));
  }

  // 6. Build ZIP
  const zipBuffer = buildCcSkillZip(pkg, skillMd, policyMds);

  // 7. Build filename
  const subdomain = pkg.metadata.subdomain;
  const skillName = subdomain
    ? `${pkg.metadata.domain}-${subdomain}`
    : pkg.metadata.domain;

  logger.info("CC Skill ZIP exported", {
    skillId,
    policyCount: pkg.policies.length,
    zipSize: zipBuffer.byteLength,
  });

  // Record download asynchronously (reuse existing table)
  const downloadId = crypto.randomUUID();
  const now = new Date().toISOString();
  ctx.waitUntil(
    env.DB_SKILL.prepare(
      `INSERT INTO skill_downloads (download_id, skill_id, downloaded_by, adapter_type, downloaded_at)
       VALUES (?, ?, ?, 'cc-skill', ?)`,
    )
      .bind(downloadId, skillId, "export", now)
      .run(),
  );

  return new Response(zipBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${skillName}.cc-skill.zip`)}`,
    },
  });
}
