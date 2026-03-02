import { describe, it, expect } from "vitest";
import { openaiAdapter } from "../../providers/openai.js";
import type { LlmRequest } from "@ai-foundry/types";

function makeRequest(overrides?: Partial<LlmRequest>): LlmRequest {
  return {
    tier: "sonnet",
    callerService: "svc-extraction",
    messages: [{ role: "user", content: "Hello" }],
    maxTokens: 1024,
    temperature: 0.5,
    stream: false,
    ...overrides,
  };
}

describe("openaiAdapter", () => {
  describe("buildBody", () => {
    it("builds OpenAI Chat Completions body", () => {
      const body = openaiAdapter.buildBody(makeRequest(), "gpt-4o");
      expect(body["model"]).toBe("gpt-4o");
      expect(body["max_tokens"]).toBe(1024);
      expect(body["temperature"]).toBe(0.5);
      expect(body["messages"]).toEqual([{ role: "user", content: "Hello" }]);
    });

    it("prepends system message when present", () => {
      const body = openaiAdapter.buildBody(makeRequest({ system: "Be helpful" }), "gpt-4o");
      const messages = body["messages"] as Array<{ role: string; content: string }>;
      expect(messages[0]).toEqual({ role: "system", content: "Be helpful" });
      expect(messages[1]).toEqual({ role: "user", content: "Hello" });
    });

    it("preserves message roles as-is", () => {
      const body = openaiAdapter.buildBody(
        makeRequest({
          messages: [
            { role: "user", content: "Q" },
            { role: "assistant", content: "A" },
            { role: "system", content: "S" },
          ],
        }),
        "gpt-4o",
      );
      const messages = body["messages"] as Array<{ role: string }>;
      expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "system"]);
    });
  });

  describe("getEndpoint", () => {
    it("returns AI Gateway URL for OpenAI", () => {
      const env = {
        CLOUDFLARE_AI_GATEWAY_URL: "https://gw.example.com",
        OPENAI_API_KEY: "sk-openai-test",
      };
      const endpoint = openaiAdapter.getEndpoint(env, "gpt-4o");
      expect(endpoint.url).toBe("https://gw.example.com/openai/v1/chat/completions");
      expect(endpoint.headers["Authorization"]).toBe("Bearer sk-openai-test");
    });
  });

  describe("parseResponse", () => {
    it("extracts content from OpenAI response", () => {
      const raw = {
        choices: [{ message: { content: "Response text" } }],
        usage: { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 },
      };
      const result = openaiAdapter.parseResponse(raw);
      expect(result.content).toBe("Response text");
      expect(result.usage.inputTokens).toBe(15);
      expect(result.usage.outputTokens).toBe(25);
      expect(result.usage.totalTokens).toBe(40);
    });

    it("handles missing choices", () => {
      const raw = { usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
      const result = openaiAdapter.parseResponse(raw);
      expect(result.content).toBe("");
    });

    it("handles missing usage", () => {
      const raw = { choices: [{ message: { content: "X" } }] };
      const result = openaiAdapter.parseResponse(raw);
      expect(result.usage.inputTokens).toBe(0);
      expect(result.usage.totalTokens).toBe(0);
    });
  });
});
