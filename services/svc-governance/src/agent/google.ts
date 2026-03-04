/**
 * Google Gemini API client with function calling.
 * Accepts/returns Anthropic-format types so the agent loop works unchanged.
 * Used as fallback when Anthropic + OpenAI both fail.
 */

import { createLogger } from "@ai-foundry/utils";
import type { AnthropicResponse, ContentBlock, MessageParam } from "./anthropic.js";
import type { ToolDefinition } from "./tools.js";

const logger = createLogger("svc-governance:agent:google");

const MODEL = "gemini-2.5-flash-lite";
const MAX_TOKENS = 1024;

function apiUrl(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
}

// ── Gemini types (minimal) ──────────────────────────────────────

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiTool {
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

interface GeminiResponse {
  candidates?: Array<{
    content: { role: "model"; parts: GeminiPart[] };
    finishReason: "STOP" | "MAX_TOKENS" | "SAFETY" | string;
  }>;
  usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
}

// ── Format conversion ───────────────────────────────────────────

function convertTools(tools: ToolDefinition[]): GeminiTool[] {
  if (tools.length === 0) return [];
  return [{
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    })),
  }];
}

/**
 * Build a map of tool_use_id → tool_name from message history.
 * Gemini's functionResponse requires the function name, not an ID.
 */
function buildToolIdToName(messages: MessageParam[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "tool_use" && block.id && block.name) {
          map.set(block.id, block.name);
        }
      }
    }
  }
  return map;
}

function convertMessages(messages: MessageParam[]): GeminiContent[] {
  const result: GeminiContent[] = [];
  const idToName = buildToolIdToName(messages);

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      result.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
      continue;
    }

    // ContentBlock array
    if (msg.role === "assistant") {
      const parts: GeminiPart[] = [];
      for (const block of msg.content) {
        if (block.type === "text" && block.text) {
          parts.push({ text: block.text });
        } else if (block.type === "tool_use" && block.name) {
          parts.push({
            functionCall: { name: block.name, args: block.input ?? {} },
          });
        }
      }
      if (parts.length > 0) {
        result.push({ role: "model", parts });
      }
    } else if (msg.role === "user") {
      // tool_result blocks → functionResponse parts
      const parts: GeminiPart[] = [];
      for (const block of msg.content) {
        if (block.type === "tool_result" && block.tool_use_id) {
          const name = idToName.get(block.tool_use_id) ?? "unknown";
          let responseObj: Record<string, unknown>;
          try {
            responseObj = JSON.parse(block.content ?? "{}") as Record<string, unknown>;
          } catch {
            responseObj = { result: block.content };
          }
          parts.push({
            functionResponse: { name, response: responseObj },
          });
        }
      }
      if (parts.length > 0) {
        result.push({ role: "user", parts });
      }
    }
  }

  return result;
}

function convertResponse(res: GeminiResponse): AnthropicResponse {
  const candidate = res.candidates?.[0];
  if (!candidate) {
    return {
      id: "gemini-no-candidate",
      content: [{ type: "text", text: "응답을 생성하지 못했습니다." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }

  const content: ContentBlock[] = [];
  let hasToolUse = false;

  for (const part of candidate.content.parts) {
    if (part.text) {
      content.push({ type: "text", text: part.text });
    } else if (part.functionCall) {
      hasToolUse = true;
      // Generate a unique ID for the tool call (Gemini doesn't provide one)
      const callId = `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      content.push({
        type: "tool_use",
        id: callId,
        name: part.functionCall.name,
        input: part.functionCall.args,
      });
    }
  }

  const usage = res.usageMetadata;
  return {
    id: `gemini-${Date.now()}`,
    content,
    stop_reason: hasToolUse ? "tool_use" : "end_turn",
    usage: {
      input_tokens: usage?.promptTokenCount ?? 0,
      output_tokens: usage?.candidatesTokenCount ?? 0,
    },
  };
}

// ── API call ────────────────────────────────────────────────────

export async function callGoogle(
  apiKey: string,
  system: string,
  messages: MessageParam[],
  tools: ToolDefinition[],
): Promise<AnthropicResponse> {
  const geminiContents = convertMessages(messages);
  const geminiTools = convertTools(tools);

  const body: Record<string, unknown> = {
    system_instruction: { parts: [{ text: system }] },
    contents: geminiContents,
    generationConfig: { maxOutputTokens: MAX_TOKENS, temperature: 0.3 },
  };
  if (geminiTools.length > 0) {
    body["tools"] = geminiTools;
  }

  const res = await fetch(apiUrl(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    logger.error("Google API error", { status: res.status, error: errorText });
    throw new Error(`Google API error: ${res.status}`);
  }

  const geminiRes = (await res.json()) as GeminiResponse;
  return convertResponse(geminiRes);
}
