/**
 * Handoff Package — Sprint 5 MVP (AIF-REQ-035)
 *
 * POST /handoff/generate — generate a Handoff manifest for a skill
 *
 * Assembles: AI-Ready score + B/T/Q spec refs + tacit fragments + source manifest
 * Phase 1 PoC: returns JSON manifest (ZIP packaging deferred to Phase 2)
 */

import {
  ok,
  badRequest,
  notFound,
  createLogger,
} from "@ai-foundry/utils";
import type { SkillPackage } from "@ai-foundry/types";
import { z } from "zod";
import { scoreSkill } from "../scoring/ai-ready.js";
import type { Env } from "../env.js";

const logger = createLogger("svc-skill:handoff");

const GenerateHandoffSchema = z.object({
  orgId: z.string().min(1),
  skillId: z.string().min(1),
  reviewedBy: z.string().optional(),
});

interface SkillRow {
  skill_id: string;
  organization_id: string;
  domain: string;
  r2_key: string;
  status: string;
  created_at: string;
  document_ids: string | null;
}

interface TacitRow {
  id: string;
  category: string;
  spec_content: string;
  confidence: number;
  policy_code: string | null;
}

function buildSourceManifest(pkg: SkillPackage, documentIds: string[]) {
  const policyCount = pkg.policies?.length ?? 0;
  return {
    documentCount: documentIds.length,
    documentIds,
    linkedPolicies: (pkg.policies ?? []).map((p) => p.code ?? "unknown").filter(Boolean),
    traceabilityScore: policyCount > 0 ? Math.min(1, documentIds.length / Math.max(1, policyCount * 0.5)) : 0,
    untracedPolicies: [] as string[],
  };
}

export async function handleGenerateHandoff(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = GenerateHandoffSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.message);
  }

  const { orgId, skillId, reviewedBy } = parsed.data;

  // Load skill from D1
  const skillRow = await env.DB_SKILL.prepare(
    "SELECT skill_id, organization_id, domain, r2_key, status, created_at, document_ids FROM skills WHERE skill_id = ? AND organization_id = ?",
  ).bind(skillId, orgId).first<SkillRow>();

  if (!skillRow) {
    return notFound("skill", skillId);
  }

  // Load SkillPackage from R2
  let pkg: SkillPackage;
  try {
    const r2Obj = await env.R2_SKILL_PACKAGES.get(skillRow.r2_key);
    if (!r2Obj) {
      return notFound("skill-package", skillRow.r2_key);
    }
    pkg = await r2Obj.json<SkillPackage>();
  } catch (e) {
    logger.error("R2 load failed", { error: String(e) });
    return new Response(JSON.stringify({ error: "Failed to load skill package" }), { status: 500 });
  }

  // AI-Ready scoring
  const aiReadyScore = scoreSkill(pkg);

  // Tacit fragments for this skill's domain
  const { results: tacitFragments } = await env.DB_SKILL.prepare(
    `SELECT f.id, f.category, f.spec_content, f.confidence, f.policy_code
     FROM tacit_spec_fragments f
     JOIN tacit_interview_sessions s ON f.session_id = s.id
     WHERE s.org_id = ? AND s.domain = ? AND s.status = 'COMPLETED'
     ORDER BY f.confidence DESC LIMIT 50`,
  ).bind(orgId, skillRow.domain).all<TacitRow>();

  // Source manifest
  const documentIds: string[] = skillRow.document_ids ? JSON.parse(skillRow.document_ids) : [];
  const sourceManifest = buildSourceManifest(pkg, documentIds);

  // Verdict
  const verdict: "APPROVED" | "DENIED" | "DRAFT" =
    aiReadyScore.passAiReady && sourceManifest.untracedPolicies.length === 0 && reviewedBy
      ? "APPROVED"
      : aiReadyScore.passAiReady
      ? "DRAFT"
      : "DENIED";

  const generatedAt = new Date().toISOString();
  const reportId = `HPK-${orgId}-${skillId}-${Date.now().toString(36).toUpperCase()}`;

  const manifest = {
    reportId,
    packageVersion: "1.0.0",
    skillId,
    orgId,
    domain: skillRow.domain,
    generatedAt,
    validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    aiReadyScore: {
      overall: aiReadyScore.overall,
      passAiReady: aiReadyScore.passAiReady,
      scores: {
        machineReadable: aiReadyScore.criteria.machineReadable,
        semanticConsistency: aiReadyScore.criteria.semanticConsistency,
        testable: aiReadyScore.criteria.testable,
        traceable: aiReadyScore.criteria.traceable,
        completeness: aiReadyScore.criteria.completeness,
        humanReviewable: aiReadyScore.criteria.humanReviewable,
      },
    },
    specSummary: {
      policyCount: pkg.policies?.length ?? 0,
      skillVersion: pkg.metadata?.version ?? "unknown",
      hasBusinessSpec: (pkg.policies?.length ?? 0) > 0,
      hasTechnicalSpec: pkg.metadata !== undefined,
    },
    tacitFragments: tacitFragments.map((f) => ({
      id: f.id,
      category: f.category,
      specContent: f.spec_content,
      confidence: f.confidence,
      policyCode: f.policy_code,
    })),
    sourceManifest,
    verdict,
    reviewedBy: reviewedBy ?? null,
  };

  logger.info("Handoff manifest generated", { reportId, skillId, orgId, verdict });
  return ok(manifest);
}
