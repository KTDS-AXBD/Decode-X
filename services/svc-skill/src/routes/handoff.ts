/**
 * Handoff Package (Sprint 5 MVP + Sprint 215 Phase 2 E)
 *
 * POST /handoff/generate  — generate Handoff manifest (Sprint 5)
 * POST /handoff/submit    — generate + gate check + forward to Foundry-X (Sprint 215)
 * POST /callback/:jobId   — receive SyncResult from Foundry-X (Sprint 215)
 */

import {
  ok,
  created,
  badRequest,
  notFound,
  createLogger,
  checkHandoffGate,
  buildFoundryXPayload,
} from "@ai-foundry/utils";
import type { HandoffManifest } from "@ai-foundry/utils";
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

// ── Sprint 215: Submit + Callback ──────────────────────────────────────────

const SubmitHandoffSchema = z.object({
  orgId: z.string().min(1),
  skillId: z.string().min(1),
  reviewedBy: z.string().optional(),
  specBusinessContent: z.string().optional(),
});

/**
 * POST /handoff/submit
 *
 * Generates a Handoff manifest, runs the FX-SPEC-003 Gate check,
 * and forwards a compliant package to Foundry-X POST /prototype-jobs.
 * Stores the job in handoff_jobs for callback correlation.
 */
export async function handleSubmitHandoff(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = SubmitHandoffSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.message);
  }

  const { orgId, skillId, reviewedBy, specBusinessContent } = parsed.data;

  // Re-use generate flow by constructing an internal request
  const generateReq = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({ orgId, skillId, reviewedBy }),
  });
  const generateRes = await handleGenerateHandoff(generateReq, env);
  if (!generateRes.ok) return generateRes;

  const generateBody = await generateRes.json<{ success: boolean; data: HandoffManifest }>();
  const manifest = generateBody.data;

  // Gate check (FX-SPEC-003 §4.2)
  const gate = checkHandoffGate(manifest);
  if (!gate.pass) {
    logger.warn("Handoff gate failed", { skillId, orgId, reasons: gate.reasons });
    return new Response(
      JSON.stringify({ success: false, error: { code: "GATE_FAILED", message: gate.reasons.join("; "), details: gate.reasons } }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  // Build Foundry-X payload
  const decodeXBaseUrl = `https://${env.SERVICE_NAME}.ktds-axbd.workers.dev`;
  const adapterOpts = specBusinessContent !== undefined
    ? { specBusinessContent, decodeXBaseUrl }
    : { decodeXBaseUrl };
  const payload = buildFoundryXPayload(manifest, adapterOpts);

  // Persist job record before forwarding (avoid lost jobs on network errors)
  const jobId = manifest.reportId;
  await env.DB_SKILL.prepare(
    `INSERT INTO handoff_jobs
       (id, org_id, skill_id, service_id, status, gate_pass, ai_ready_overall, prd_title, contract_version)
     VALUES (?, ?, ?, ?, 'pending', 1, ?, ?, 'FX-SPEC-003/1.0')`,
  ).bind(jobId, orgId, skillId, manifest.domain, manifest.aiReadyScore.overall, payload.prdTitle).run();

  // Forward to Foundry-X
  const foundryRes = await fetch(`${env.FOUNDRY_X_URL}/prototype-jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": env.FOUNDRY_X_SECRET,
    },
    body: JSON.stringify(payload),
  });

  if (!foundryRes.ok) {
    const errText = await foundryRes.text().catch(() => "");
    logger.error("Foundry-X submission failed", { status: foundryRes.status, body: errText });
    await env.DB_SKILL.prepare(
      `UPDATE handoff_jobs SET status = 'failed' WHERE id = ?`,
    ).bind(jobId).run();
    return new Response(
      JSON.stringify({ success: false, error: { code: "UPSTREAM_ERROR", message: `Foundry-X returned ${foundryRes.status}` } }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const foundryBody = await foundryRes.json<{ jobId?: string; status?: string }>();
  const foundryJobId = foundryBody.jobId ?? "";
  const callbackUrl = `${decodeXBaseUrl}/callback/${jobId}`;

  await env.DB_SKILL.prepare(
    `UPDATE handoff_jobs
       SET status = 'submitted', foundry_job_id = ?, callback_url = ?, submitted_at = datetime('now')
     WHERE id = ?`,
  ).bind(foundryJobId, callbackUrl, jobId).run();

  logger.info("Handoff submitted to Foundry-X", { jobId, foundryJobId, skillId });
  return created({ jobId, foundryJobId, status: "submitted", callbackUrl });
}

const CallbackBodySchema = z.object({
  jobId: z.string().min(1),
  serviceId: z.string().optional(),
  verdict: z.enum(["green", "yellow", "red"]),
  syncResult: z.object({
    specMatch: z.number(),
    codeMatch: z.number(),
    testMatch: z.number(),
  }).optional(),
  roundTripRate: z.number().optional(),
  prototypeUrl: z.string().optional(),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  completedAt: z.string().optional(),
});

/**
 * POST /callback/:jobId
 *
 * Receives SyncResult from Foundry-X after Working Prototype generation.
 * Correlates by foundry_job_id and updates handoff_jobs.
 */
export async function handleHandoffCallback(request: Request, env: Env, foundryJobId: string): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = CallbackBodySchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.message);
  }

  const { verdict, syncResult, roundTripRate, prototypeUrl, errors, warnings, completedAt } = parsed.data;

  const row = await env.DB_SKILL.prepare(
    `SELECT id FROM handoff_jobs WHERE foundry_job_id = ? LIMIT 1`,
  ).bind(foundryJobId).first<{ id: string }>();

  if (!row) {
    return notFound("handoff_job", foundryJobId);
  }

  await env.DB_SKILL.prepare(
    `UPDATE handoff_jobs SET
       status = 'completed',
       verdict = ?,
       spec_match = ?,
       code_match = ?,
       test_match = ?,
       round_trip_rate = ?,
       prototype_url = ?,
       errors = ?,
       warnings = ?,
       completed_at = ?
     WHERE foundry_job_id = ?`,
  ).bind(
    verdict,
    syncResult?.specMatch ?? null,
    syncResult?.codeMatch ?? null,
    syncResult?.testMatch ?? null,
    roundTripRate ?? null,
    prototypeUrl ?? null,
    JSON.stringify(errors ?? []),
    JSON.stringify(warnings ?? []),
    completedAt ?? new Date().toISOString(),
    foundryJobId,
  ).run();

  logger.info("Handoff callback received", { foundryJobId, verdict, roundTripRate });
  return ok({ received: true, verdict });
}
