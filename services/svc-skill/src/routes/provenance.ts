/**
 * F391: GET /skills/:id/provenance/resolve
 * Aggregates R2 .skill.json + D1 skills metadata + spec-container source info
 * into a single response consumed by F379 (Split View) and F380 (Provenance Inspector).
 */

import {
  createLogger,
  ok,
  notFound,
} from "@ai-foundry/utils";
import type { Env } from "../env.js";
import type { SkillRow } from "./skills.js";

const logger = createLogger("svc-skill:provenance");

export interface ProvenanceSource {
  type: "reverse-engineering" | "inference";
  path?: string;
  section?: string;
  confidence: number;
  documentId?: string;
}

export interface ProvenancePolicy {
  code: string;
  title: string;
  condition: string;
  criteria: string;
  outcome: string;
  confidence: number;
}

export interface ProvenanceTerm {
  termId: string;
  label: string;
  definition?: string;
}

export interface ProvenanceResolveResponse {
  skillId: string;
  domain: string;
  r2Key: string;
  extractedAt: string;
  sources: ProvenanceSource[];
  policies: ProvenancePolicy[];
  terms: ProvenanceTerm[];
  documentIds: string[];
  pipelineStages: string[];
}

interface SkillJsonProvenance {
  sourceDocumentIds?: string[];
  organizationId?: string;
  extractedAt?: string;
  pipeline?: {
    stages?: string[];
    models?: Record<string, string>;
  };
}

interface SkillJsonPolicy {
  code?: string;
  title?: string;
  condition?: string;
  criteria?: string;
  outcome?: string;
  confidence?: number;
  source?: {
    type?: string;
    path?: string;
    section?: string;
    documentId?: string;
    confidence?: number;
  };
}

interface SkillJson {
  provenance?: SkillJsonProvenance;
  policies?: SkillJsonPolicy[];
  ontologyRef?: {
    termUris?: string[];
  };
}

// ── GET /skills/:id/provenance/resolve ───────────────────────────────

export async function handleProvenanceResolve(
  request: Request,
  env: Env,
  skillId: string,
): Promise<Response> {
  const orgId = request.headers.get("X-Organization-Id") ?? "unknown";

  // 1. D1 lookup
  const row = await env.DB_SKILL.prepare(
    "SELECT skill_id, domain, r2_key, created_at FROM skills WHERE skill_id = ? AND organization_id = ?",
  )
    .bind(skillId, orgId)
    .first<Pick<SkillRow, "skill_id" | "domain" | "r2_key" | "created_at">>();

  if (!row) {
    return notFound("Skill", skillId);
  }

  // 2. R2 fetch
  let skillJson: SkillJson = {};
  try {
    const r2Object = await env.R2_SKILL_PACKAGES.get(row["r2_key"]);
    if (r2Object) {
      const text = await r2Object.text();
      skillJson = JSON.parse(text) as SkillJson;
    } else {
      logger.warn("R2 object not found", { skillId, r2Key: row["r2_key"] });
    }
  } catch (e) {
    logger.error("Failed to parse R2 skill.json", { skillId, error: String(e) });
  }

  // 3. Extract provenance sources from policies[].source
  const sources: ProvenanceSource[] = [];
  const seenPaths = new Set<string>();
  for (const policy of skillJson.policies ?? []) {
    const src = policy.source;
    if (!src) continue;
    const key = `${src.path ?? ""}::${src.section ?? ""}`;
    if (seenPaths.has(key)) continue;
    seenPaths.add(key);
    sources.push({
      type: (src.type as ProvenanceSource["type"]) ?? "inference",
      ...(src.path !== undefined ? { path: src.path } : {}),
      ...(src.section !== undefined ? { section: src.section } : {}),
      ...(src.documentId !== undefined ? { documentId: src.documentId } : {}),
      confidence: src.confidence ?? 0.7,
    });
  }

  // 4. Build policy list
  const policies: ProvenancePolicy[] = (skillJson.policies ?? []).map((p) => ({
    code: p.code ?? "",
    title: p.title ?? "",
    condition: p.condition ?? "",
    criteria: p.criteria ?? "",
    outcome: p.outcome ?? "",
    confidence: p.confidence ?? 0.75,
  }));

  // 5. Term stubs (from ontologyRef.termUris if present)
  const terms: ProvenanceTerm[] = (skillJson.ontologyRef?.termUris ?? []).map((uri) => ({
    termId: uri,
    label: uri.split("/").at(-1) ?? uri,
  }));

  const prov = skillJson.provenance ?? {};
  const response: ProvenanceResolveResponse = {
    skillId,
    domain: row["domain"],
    r2Key: row["r2_key"],
    extractedAt: prov.extractedAt ?? row["created_at"],
    sources,
    policies,
    terms,
    documentIds: prov.sourceDocumentIds ?? [],
    pipelineStages: prov.pipeline?.stages ?? [],
  };

  return ok(response);
}
