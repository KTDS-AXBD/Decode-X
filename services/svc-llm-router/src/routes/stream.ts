import { LlmRequestSchema } from "@ai-foundry/types";
import { errFromUnknown, badRequest, createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";
import { resolveTier, buildAnthropicBody } from "../router.js";
import { gatewayStream } from "../gateway.js";
import { handleComplete } from "./complete.js";

export async function handleStream(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const logger = createLogger("svc-llm-router");

  // Clone request body since we may need to re-read it for non-Anthropic fallback
  const bodyText = await request.text();

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = LlmRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Invalid request", parsed.error.flatten());
  }

  const llmRequest = { ...parsed.data, stream: true };
  const requestId = crypto.randomUUID();
  const reqLogger = logger.child({ requestId, callerService: llmRequest.callerService });

  try {
    const { tier, model, provider } = resolveTier(llmRequest, reqLogger);

    // Only Anthropic supports SSE streaming through AI Gateway.
    // For other providers, fall back to non-streaming complete.
    if (provider !== "anthropic") {
      reqLogger.info("Non-Anthropic provider, falling back to non-streaming", { provider });
      const syntheticRequest = new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: bodyText,
      });
      return handleComplete(syntheticRequest, env, ctx);
    }

    const anthropicBody = buildAnthropicBody({ ...llmRequest, tier }, model);

    reqLogger.info("Streaming LLM call initiated", { tier, model, provider });

    return await gatewayStream(env, anthropicBody, requestId);
  } catch (e) {
    reqLogger.error("Streaming LLM call failed", { error: String(e) });
    return errFromUnknown(e);
  }
}
