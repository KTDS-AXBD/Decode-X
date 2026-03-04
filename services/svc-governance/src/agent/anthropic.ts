/**
 * Direct Anthropic Messages API client for Tool Use Agent.
 * Bypasses svc-llm-router / AI Gateway to avoid SSE UTF-8 Korean corruption.
 */

import { createLogger } from "@ai-foundry/utils";
import type { ToolDefinition } from "./tools.js";

const logger = createLogger("svc-governance:agent:anthropic");

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1024;

export interface MessageParam {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface AnthropicResponse {
  id: string;
  content: ContentBlock[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
  usage: { input_tokens: number; output_tokens: number };
}

export async function callAnthropic(
  apiKey: string,
  system: string,
  messages: MessageParam[],
  tools: ToolDefinition[],
): Promise<AnthropicResponse> {
  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0.3,
    system,
    messages,
    tools: tools.length > 0 ? tools : undefined,
  };

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    logger.error("Anthropic API error", { status: res.status, error: errorText });
    throw new Error(`Anthropic API error: ${res.status}`);
  }

  return (await res.json()) as AnthropicResponse;
}

export function extractTextContent(response: AnthropicResponse): string {
  return response.content
    .filter((b): b is ContentBlock & { type: "text"; text: string } => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
}

export function extractToolUseBlocks(response: AnthropicResponse): ContentBlock[] {
  return response.content.filter((b) => b.type === "tool_use");
}
