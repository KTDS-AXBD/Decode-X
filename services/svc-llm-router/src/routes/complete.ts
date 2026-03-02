import { LlmRequestSchema } from "@ai-foundry/types";
import type { LlmCostLogEntry } from "@ai-foundry/types";
import { ok, errFromUnknown, badRequest, createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";
import { resolveTier } from "../router.js";
import { executeWithFallback } from "../execute.js";

export async function handleComplete(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const logger = createLogger("svc-llm-router");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = LlmRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Invalid request", parsed.error.flatten());
  }

  const llmRequest = parsed.data;
  const requestId = crypto.randomUUID();
  const reqLogger = logger.child({ requestId, callerService: llmRequest.callerService });

  try {
    const { tier, downgraded, provider } = resolveTier(llmRequest, reqLogger);

    if (downgraded) {
      reqLogger.info("Tier downgraded", { from: llmRequest.tier, to: tier });
    }

    const result = await executeWithFallback(
      env,
      { ...llmRequest, tier },
      tier,
      provider,
      requestId,
      reqLogger,
    );

    reqLogger.info("LLM call completed", {
      tier,
      provider: result.provider,
      model: result.model,
      durationMs: result.durationMs,
      cached: result.cached,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      fallbackFrom: result.fallbackFrom,
    });

    // Fire-and-forget cost logging to D1
    const logEntry: LlmCostLogEntry = {
      requestId,
      callerService: llmRequest.callerService,
      tier,
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      durationMs: result.durationMs,
      cached: result.cached,
      provider: result.provider,
      fallbackFrom: result.fallbackFrom,
      createdAt: new Date().toISOString(),
    };
    ctx.waitUntil(writeCostLog(env.DB_LLM, logEntry));

    return ok({
      id: requestId,
      tier,
      model: result.model,
      content: result.content,
      usage: result.usage,
      durationMs: result.durationMs,
      cached: result.cached,
      provider: result.provider,
      fallbackFrom: result.fallbackFrom,
    });
  } catch (e) {
    reqLogger.error("LLM call failed", { error: String(e) });
    return errFromUnknown(e);
  }
}

async function writeCostLog(db: D1Database, entry: LlmCostLogEntry): Promise<void> {
  await db
    .prepare(
      `INSERT INTO llm_cost_log
        (request_id, caller_service, tier, model, input_tokens, output_tokens, duration_ms, cached, provider, fallback_from, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entry.requestId,
      entry.callerService,
      entry.tier,
      entry.model,
      entry.inputTokens,
      entry.outputTokens,
      entry.durationMs,
      entry.cached ? 1 : 0,
      entry.provider,
      entry.fallbackFrom,
      entry.createdAt,
    )
    .run();
}
