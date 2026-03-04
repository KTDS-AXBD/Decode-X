/**
 * OpenAI Chat Completions API client with function calling.
 * Accepts/returns Anthropic-format types so the agent loop works unchanged.
 * Used as fallback when Anthropic API fails (credit exhaustion, rate limit).
 */

import { createLogger } from "@ai-foundry/utils";
import type { AnthropicResponse, ContentBlock, MessageParam } from "./anthropic.js";
import type { ToolDefinition } from "./tools.js";

const logger = createLogger("svc-governance:agent:openai");

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4.1-nano";
const MAX_TOKENS = 1024;

// ── OpenAI types (minimal) ──────────────────────────────────────

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAITool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

interface OpenAIResponse {
  id: string;
  choices: Array<{
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: "stop" | "tool_calls" | "length";
  }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

// ── Format conversion ───────────────────────────────────────────

function convertTools(tools: ToolDefinition[]): OpenAITool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

function convertMessages(system: string, messages: MessageParam[]): OpenAIMessage[] {
  const result: OpenAIMessage[] = [{ role: "system", content: system }];

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }

    // ContentBlock array — could be assistant (tool_use) or user (tool_result)
    if (msg.role === "assistant") {
      // Extract text and tool_use blocks
      const textParts: string[] = [];
      const toolCalls: OpenAIToolCall[] = [];

      for (const block of msg.content) {
        if (block.type === "text" && block.text) {
          textParts.push(block.text);
        } else if (block.type === "tool_use" && block.id && block.name) {
          toolCalls.push({
            id: block.id,
            type: "function",
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input ?? {}),
            },
          });
        }
      }

      const assistantMsg: OpenAIMessage = {
        role: "assistant",
        content: textParts.length > 0 ? textParts.join("\n") : null,
      };
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls;
      }
      result.push(assistantMsg);
    } else if (msg.role === "user") {
      // tool_result blocks → separate "tool" role messages
      for (const block of msg.content) {
        if (block.type === "tool_result" && block.tool_use_id) {
          result.push({
            role: "tool",
            content: block.content ?? "",
            tool_call_id: block.tool_use_id,
          });
        }
      }
    }
  }

  return result;
}

function convertResponse(res: OpenAIResponse): AnthropicResponse {
  const choice = res.choices[0];
  if (!choice) {
    return {
      id: res.id,
      content: [{ type: "text", text: "응답을 생성하지 못했습니다." }],
      stop_reason: "end_turn",
      usage: { input_tokens: res.usage.prompt_tokens, output_tokens: res.usage.completion_tokens },
    };
  }

  const content: ContentBlock[] = [];

  if (choice.message.content) {
    content.push({ type: "text", text: choice.message.content });
  }

  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      let parsedInput: Record<string, unknown> = {};
      try {
        parsedInput = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        // keep empty
      }
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input: parsedInput,
      });
    }
  }

  return {
    id: res.id,
    content,
    stop_reason: choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn",
    usage: { input_tokens: res.usage.prompt_tokens, output_tokens: res.usage.completion_tokens },
  };
}

// ── API call ────────────────────────────────────────────────────

export async function callOpenAI(
  apiKey: string,
  system: string,
  messages: MessageParam[],
  tools: ToolDefinition[],
): Promise<AnthropicResponse> {
  const openaiMessages = convertMessages(system, messages);
  const openaiTools = tools.length > 0 ? convertTools(tools) : undefined;

  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0.3,
    messages: openaiMessages,
  };
  if (openaiTools) {
    body["tools"] = openaiTools;
  }

  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    logger.error("OpenAI API error", { status: res.status, error: errorText });
    throw new Error(`OpenAI API error: ${res.status}`);
  }

  const openaiRes = (await res.json()) as OpenAIResponse;
  return convertResponse(openaiRes);
}
