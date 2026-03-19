/**
 * Evaluate route handlers — POST /skills/:id/evaluate & GET /skills/:id/evaluations
 *
 * Evaluates a user-provided context against a specific policy in a Skill package.
 * Uses svc-llm-router for LLM calls with multi-provider support and benchmarking.
 */

import type { SkillPackage } from "@ai-foundry/types";
import type { LlmProvider } from "@ai-foundry/types";
import { EvaluateRequestSchema } from "@ai-foundry/types";
import {
  createLogger,
  ok,
  badRequest,
  notFound,
  errFromUnknown,
  extractRbacContext,
} from "@ai-foundry/utils";
import type { Env } from "../env.js";
import { buildEvaluatePrompt, parseEvaluateResponse } from "../prompts/evaluate.js";

const logger = createLogger("svc-skill:evaluate");

const BENCHMARK_PROVIDERS: LlmProvider[] = ["anthropic", "openai", "google"];

// ── Helpers ─────────────────────────────────────────────────────────

async function fetchSkillPackage(
  env: Env,
  skillId: string,
  orgId: string,
): Promise<{ pkg: SkillPackage; domain: string } | Response> {
  const row = await env.DB_SKILL.prepare(
    "SELECT r2_key, domain FROM skills WHERE skill_id = ? AND organization_id = ?",
  ).bind(skillId, orgId).first<{ r2_key: string; domain: string }>();

  if (!row) {
    return notFound("skill", skillId);
  }

  const r2Obj = await env.R2_SKILL_PACKAGES.get(row.r2_key);
  if (!r2Obj) {
    return notFound("skill-package", row.r2_key);
  }

  const pkg = JSON.parse(await r2Obj.text()) as SkillPackage;
  return { pkg, domain: row.domain };
}

async function callLlmWithProvider(
  env: Env,
  system: string,
  user: string,
  provider?: string,
): Promise<{ content: string; model: string; provider: string; latencyMs: number }> {
  const start = Date.now();

  const body: Record<string, unknown> = {
    tier: "sonnet",
    messages: [{ role: "user", content: user }],
    system,
    callerService: "svc-skill",
    maxTokens: 2048,
    temperature: 0.3,
  };

  if (provider) {
    body["preferredProvider"] = provider;
  }

  const response = await env.LLM_ROUTER.fetch(
    "https://svc-llm-router.internal/complete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": env.INTERNAL_API_SECRET,
      },
      body: JSON.stringify(body),
    },
  );

  const latencyMs = Date.now() - start;

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM Router error ${response.status}: ${text}`);
  }

  const json = (await response.json()) as {
    success: boolean;
    data: { content: string; model?: string; provider?: string };
    error?: { message: string };
  };

  if (!json.success) {
    throw new Error(`LLM Router failure: ${json.error?.message ?? "unknown"}`);
  }

  return {
    content: json.data.content,
    model: json.data.model ?? "unknown",
    provider: json.data.provider ?? provider ?? "unknown",
    latencyMs,
  };
}

function generateId(): string {
  return crypto.randomUUID();
}

async function recordEvaluation(
  env: Env,
  ctx: ExecutionContext,
  params: {
    evaluationId: string;
    skillId: string;
    policyCode: string;
    provider: string;
    model: string;
    inputContext: string;
    inputParams: string | null;
    result: string;
    confidence: number;
    reasoning: string;
    latencyMs: number;
    evaluatedBy: string;
  },
): Promise<void> {
  ctx.waitUntil(
    env.DB_SKILL.prepare(
      `INSERT INTO skill_evaluations
       (evaluation_id, skill_id, policy_code, provider, model, input_context, input_params,
        result, confidence, reasoning, latency_ms, evaluated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        params.evaluationId,
        params.skillId,
        params.policyCode,
        params.provider,
        params.model,
        params.inputContext,
        params.inputParams,
        params.result,
        params.confidence,
        params.reasoning,
        params.latencyMs,
        params.evaluatedBy,
      )
      .run()
      .catch((e) => logger.error("Failed to record evaluation", { error: String(e) })),
  );
}

// ── POST /skills/:id/evaluate ───────────────────────────────────────

export async function handleEvaluateSkill(
  request: Request,
  env: Env,
  skillId: string,
  ctx: ExecutionContext,
): Promise<Response> {
  const bodyRaw: unknown = await request.json();
  const parsed = EvaluateRequestSchema.safeParse(bodyRaw);
  if (!parsed.success) {
    return badRequest("Invalid evaluate request", parsed.error.flatten());
  }
  const { policyCode, context, parameters, provider, benchmark } = parsed.data;

  // Fetch skill package from R2
  const orgId = request.headers.get("X-Organization-Id") ?? "unknown";
  const fetchResult = await fetchSkillPackage(env, skillId, orgId);
  if (fetchResult instanceof Response) return fetchResult;
  const { pkg, domain } = fetchResult;

  // Find matching policy
  const policy = pkg.policies.find((p) => p.code === policyCode);
  if (!policy) {
    return badRequest(
      `Policy "${policyCode}" not found in skill ${skillId}. Available: ${pkg.policies.map((p) => p.code).join(", ")}`,
    );
  }

  const rbacCtx = extractRbacContext(request);
  const evaluatedBy = rbacCtx?.userId ?? "anonymous";
  const { system, user } = buildEvaluatePrompt(policy, domain, context, parameters);
  const inputParams = parameters ? JSON.stringify(parameters) : null;

  // Benchmark mode: call all 3 providers in parallel
  if (benchmark) {
    const benchmarkPromises = BENCHMARK_PROVIDERS.map(async (p) => {
      try {
        const llm = await callLlmWithProvider(env, system, user, p);
        const evalResult = parseEvaluateResponse(llm.content);
        const evaluationId = generateId();

        void recordEvaluation(env, ctx, {
          evaluationId,
          skillId,
          policyCode,
          provider: llm.provider,
          model: llm.model,
          inputContext: context,
          inputParams,
          result: evalResult.result,
          confidence: evalResult.confidence,
          reasoning: evalResult.reasoning,
          latencyMs: llm.latencyMs,
          evaluatedBy,
        });

        return {
          evaluationId,
          skillId,
          policyCode,
          provider: llm.provider,
          model: llm.model,
          result: evalResult.result,
          confidence: evalResult.confidence,
          reasoning: evalResult.reasoning,
          latencyMs: llm.latencyMs,
        };
      } catch (e) {
        logger.warn(`Benchmark: ${p} failed`, { error: String(e) });
        return {
          evaluationId: generateId(),
          skillId,
          policyCode,
          provider: p,
          model: "error",
          result: `Error: ${String(e)}`,
          confidence: 0,
          reasoning: `Provider ${p} call failed`,
          latencyMs: 0,
        };
      }
    });

    const results = await Promise.all(benchmarkPromises);

    // Compute consensus
    const successResults = results.filter((r) => r.model !== "error");
    const applicableCount = successResults.filter((r) =>
      r.result.startsWith("APPLICABLE"),
    ).length;
    const agreementRate = successResults.length > 0
      ? applicableCount / successResults.length
      : 0;

    return ok({
      benchmark: true,
      results,
      consensus: {
        agreementRate: Math.round(agreementRate * 100) / 100,
        summary: successResults.length === 0
          ? "All providers failed"
          : agreementRate >= 0.67
            ? "Majority agreement: APPLICABLE"
            : agreementRate <= 0.33
              ? "Majority agreement: NOT_APPLICABLE"
              : "No consensus — split decision",
      },
    });
  }

  // Single provider mode
  try {
    const llm = await callLlmWithProvider(env, system, user, provider);
    const evalResult = parseEvaluateResponse(llm.content);
    const evaluationId = generateId();

    void recordEvaluation(env, ctx, {
      evaluationId,
      skillId,
      policyCode,
      provider: llm.provider,
      model: llm.model,
      inputContext: context,
      inputParams,
      result: evalResult.result,
      confidence: evalResult.confidence,
      reasoning: evalResult.reasoning,
      latencyMs: llm.latencyMs,
      evaluatedBy,
    });

    return ok({
      evaluationId,
      skillId,
      policyCode,
      provider: llm.provider,
      model: llm.model,
      result: evalResult.result,
      confidence: evalResult.confidence,
      reasoning: evalResult.reasoning,
      latencyMs: llm.latencyMs,
    });
  } catch (e) {
    logger.error("Evaluate failed", { error: String(e), skillId, policyCode });
    return errFromUnknown(e);
  }
}

// ── GET /skills/:id/evaluations ─────────────────────────────────────

export async function handleListEvaluations(
  request: Request,
  env: Env,
  skillId: string,
): Promise<Response> {
  const url = new URL(request.url);
  const policyCode = url.searchParams.get("policyCode");
  const provider = url.searchParams.get("provider");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  // Build dynamic query
  const conditions = ["skill_id = ?1"];
  const params: (string | number)[] = [skillId];
  let paramIdx = 2;

  if (policyCode) {
    conditions.push(`policy_code = ?${paramIdx}`);
    params.push(policyCode);
    paramIdx++;
  }
  if (provider) {
    conditions.push(`provider = ?${paramIdx}`);
    params.push(provider);
    paramIdx++;
  }

  const where = conditions.join(" AND ");

  const countResult = await env.DB_SKILL.prepare(
    `SELECT COUNT(*) as total FROM skill_evaluations WHERE ${where}`,
  ).bind(...params).first<{ total: number }>();

  const rows = await env.DB_SKILL.prepare(
    `SELECT * FROM skill_evaluations WHERE ${where} ORDER BY evaluated_at DESC LIMIT ?${paramIdx} OFFSET ?${paramIdx + 1}`,
  ).bind(...params, limit, offset).all();

  return ok({
    evaluations: rows.results,
    total: countResult?.total ?? 0,
    limit,
    offset,
  });
}
