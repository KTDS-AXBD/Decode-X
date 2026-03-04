/**
 * Workers AI client — text-only fallback (no tool support).
 * Free tier, last resort when all paid providers fail.
 * Returns Anthropic-format response so the agent loop works unchanged.
 * The loop will see no tool_use blocks and return on the first turn.
 */

import { createLogger } from "@ai-foundry/utils";
import type { AnthropicResponse, MessageParam } from "./anthropic.js";
import type { ToolDefinition } from "./tools.js";

const logger = createLogger("svc-governance:agent:workers-ai");

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

interface AiTextGenerationOutput {
  response?: string;
}

export async function callWorkersAI(
  ai: Ai,
  system: string,
  messages: MessageParam[],
  _tools: ToolDefinition[],
): Promise<AnthropicResponse> {
  // Convert to simple messages (Workers AI doesn't support ContentBlock arrays)
  const aiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: system },
  ];

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      aiMessages.push({ role: msg.role, content: msg.content });
    }
    // Skip ContentBlock[] messages (tool_use/tool_result) — not supported
  }

  try {
    const result = await ai.run(
      MODEL as Parameters<Ai["run"]>[0],
      { messages: aiMessages, max_tokens: 1024 },
    ) as AiTextGenerationOutput;

    const text = result.response ?? "응답을 생성하지 못했습니다.";

    return {
      id: `workers-ai-${Date.now()}`,
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  } catch (e) {
    logger.error("Workers AI error", { error: String(e) });
    throw new Error(`Workers AI error: ${String(e)}`, { cause: e });
  }
}
