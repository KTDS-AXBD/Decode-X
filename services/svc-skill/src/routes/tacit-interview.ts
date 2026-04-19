/**
 * Tacit Interview Agent — Sprint 5 MVP (AIF-REQ-035)
 *
 * POST /tacit-interview/sessions               — create interview session
 * POST /tacit-interview/sessions/:id/fragments — submit Q&A → Spec Fragment
 * GET  /tacit-interview/sessions/:id           — get session + fragments
 * POST /tacit-interview/sessions/:id/complete  — mark session complete
 */

import {
  ok,
  created,
  badRequest,
  notFound,
  createLogger,
  callLlmRouterWithMeta,
} from "@ai-foundry/utils";
import { z } from "zod";
import type { Env } from "../env.js";

const logger = createLogger("svc-skill:tacit-interview");

// ── PII masking ──────────────────────────────────────────────────────────────

const PII_PATTERNS: Array<[RegExp, string]> = [
  [/\b\d{6}-\d{7}\b/g, "[SSN]"],
  [/\b01[016789]-\d{3,4}-\d{4}\b/g, "[PHONE]"],
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]"],
  [/\b[A-Z]{2,4}-\d{4,8}\b/g, "[EMPID]"],
];

function maskPii(text: string): string {
  let masked = text;
  for (const [pattern, token] of PII_PATTERNS) {
    masked = masked.replace(pattern, token);
  }
  return masked;
}

// ── ID generators ────────────────────────────────────────────────────────────

function newSessionId(): string {
  return `INT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function newFragmentId(domain: string, seq: number): string {
  return `TIF-${domain.toUpperCase()}-${String(seq).padStart(3, "0")}`;
}

// ── LLM extraction ───────────────────────────────────────────────────────────

const EXTRACT_SYSTEM = `You are a domain knowledge extraction assistant.
Given a Q&A pair from a business SME interview, extract a structured Spec Fragment.
Respond ONLY with JSON matching this schema:
{
  "specContent": "normalized spec text in Korean",
  "specType": "business" | "technical" | "quality",
  "confidence": 0.0-1.0,
  "policyCode": "POL-DOMAIN-TYPE-SEQ or null"
}`;

async function extractFragment(
  env: Env,
  question: string,
  answer: string,
  domain: string,
): Promise<{ specContent: string; specType: string; confidence: number; policyCode: string | null }> {
  const user = `Domain: ${domain}\nQuestion: ${question}\nAnswer: ${answer}`;

  try {
    const result = await callLlmRouterWithMeta(env, "svc-skill", "haiku", user, {
      system: EXTRACT_SYSTEM,
      maxTokens: 512,
      temperature: 0.1,
    });

    const parsed = JSON.parse(result.content) as {
      specContent?: string;
      specType?: string;
      confidence?: number;
      policyCode?: string | null;
    };

    return {
      specContent: parsed.specContent ?? answer,
      specType: (parsed.specType === "technical" || parsed.specType === "quality") ? parsed.specType : "business",
      confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
      policyCode: parsed.policyCode ?? null,
    };
  } catch {
    // LLM unavailable — return rule-based fallback
    return {
      specContent: answer,
      specType: "business",
      confidence: 0.5,
      policyCode: null,
    };
  }
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const CreateSessionSchema = z.object({
  orgId: z.string().min(1),
  domain: z.string().min(1),
  smeId: z.string().min(1),
  department: z.string().optional(),
});

const SubmitFragmentSchema = z.object({
  category: z.enum(["domain", "process", "exception", "constraint"]),
  question: z.string().min(1),
  answer: z.string().min(1),
});

// ── Handlers ─────────────────────────────────────────────────────────────────

export async function handleCreateSession(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = CreateSessionSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.message);
  }

  const { orgId, domain, smeId, department } = parsed.data;
  const id = newSessionId();
  const now = new Date().toISOString();

  try {
    await env.DB_SKILL.prepare(
      `INSERT INTO tacit_interview_sessions (id, org_id, domain, sme_id, department, status, fragment_count, created_at)
       VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', 0, ?)`,
    ).bind(id, orgId, domain, maskPii(smeId), department ?? null, now).run();
  } catch (e) {
    logger.error("DB insert failed", { error: String(e) });
    return new Response(JSON.stringify({ error: "Failed to create session" }), { status: 500 });
  }

  logger.info("Session created", { id, orgId, domain });
  return created({ id, orgId, domain, status: "IN_PROGRESS", createdAt: now });
}

export async function handleSubmitFragment(
  request: Request,
  env: Env,
  sessionId: string,
): Promise<Response> {
  const session = await env.DB_SKILL.prepare(
    "SELECT id, domain, fragment_count FROM tacit_interview_sessions WHERE id = ? AND status = 'IN_PROGRESS'",
  ).bind(sessionId).first<{ id: string; domain: string; fragment_count: number }>();

  if (!session) {
    return notFound("session", sessionId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = SubmitFragmentSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.message);
  }

  const { category, question, answer } = parsed.data;
  const maskedAnswer = maskPii(answer);
  const seq = session.fragment_count + 1;
  const fragmentId = newFragmentId(session.domain, seq);
  const now = new Date().toISOString();

  const extracted = await extractFragment(env, question, maskedAnswer, session.domain);

  try {
    await env.DB_SKILL.prepare(
      `INSERT INTO tacit_spec_fragments (id, session_id, category, question, answer, spec_content, spec_type, confidence, policy_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      fragmentId, sessionId, category, question, maskedAnswer,
      extracted.specContent, extracted.specType, extracted.confidence,
      extracted.policyCode, now,
    ).run();

    await env.DB_SKILL.prepare(
      `UPDATE tacit_interview_sessions SET fragment_count = ?, avg_confidence = (
         SELECT AVG(confidence) FROM tacit_spec_fragments WHERE session_id = ?
       ) WHERE id = ?`,
    ).bind(seq, sessionId, sessionId).run();
  } catch (e) {
    logger.error("Fragment insert failed", { error: String(e) });
    return new Response(JSON.stringify({ error: "Failed to save fragment" }), { status: 500 });
  }

  logger.info("Fragment extracted", { fragmentId, confidence: extracted.confidence });
  return created({
    fragmentId,
    sessionId,
    category,
    specContent: extracted.specContent,
    specType: extracted.specType,
    confidence: extracted.confidence,
    policyCode: extracted.policyCode,
    createdAt: now,
  });
}

export async function handleGetSession(
  _request: Request,
  env: Env,
  sessionId: string,
): Promise<Response> {
  const session = await env.DB_SKILL.prepare(
    "SELECT * FROM tacit_interview_sessions WHERE id = ?",
  ).bind(sessionId).first<{
    id: string; org_id: string; domain: string; sme_id: string; department: string | null;
    status: string; fragment_count: number; avg_confidence: number | null;
    created_at: string; completed_at: string | null;
  }>();

  if (!session) {
    return notFound("session", sessionId);
  }

  const { results: fragments } = await env.DB_SKILL.prepare(
    "SELECT id, category, spec_content, spec_type, confidence, policy_code, created_at FROM tacit_spec_fragments WHERE session_id = ? ORDER BY created_at",
  ).bind(sessionId).all<{
    id: string; category: string; spec_content: string; spec_type: string;
    confidence: number; policy_code: string | null; created_at: string;
  }>();

  return ok({
    id: session.id,
    orgId: session.org_id,
    domain: session.domain,
    status: session.status,
    fragmentCount: session.fragment_count,
    avgConfidence: session.avg_confidence,
    createdAt: session.created_at,
    completedAt: session.completed_at,
    fragments: fragments.map((f) => ({
      id: f.id,
      category: f.category,
      specContent: f.spec_content,
      specType: f.spec_type,
      confidence: f.confidence,
      policyCode: f.policy_code,
      createdAt: f.created_at,
    })),
  });
}

export async function handleCompleteSession(
  _request: Request,
  env: Env,
  sessionId: string,
): Promise<Response> {
  const session = await env.DB_SKILL.prepare(
    "SELECT id, status FROM tacit_interview_sessions WHERE id = ?",
  ).bind(sessionId).first<{ id: string; status: string }>();

  if (!session) {
    return notFound("session", sessionId);
  }
  if (session.status !== "IN_PROGRESS") {
    return badRequest(`Session is already ${session.status}`);
  }

  const now = new Date().toISOString();
  await env.DB_SKILL.prepare(
    "UPDATE tacit_interview_sessions SET status = 'COMPLETED', completed_at = ? WHERE id = ?",
  ).bind(now, sessionId).run();

  logger.info("Session completed", { sessionId });
  return ok({ sessionId, status: "COMPLETED", completedAt: now });
}
