import { describe, it, expect } from "vitest";
import { anthropicAdapter } from "../../providers/anthropic.js";
import type { LlmRequest } from "@ai-foundry/types";

function makeRequest(overrides?: Partial<LlmRequest>): LlmRequest {
  return {
    tier: "sonnet",
    callerService: "svc-extraction",
    messages: [{ role: "user", content: "Hello" }],
    maxTokens: 1024,
    temperature: 0.3,
    stream: false,
    ...overrides,
  };
}

describe("anthropicAdapter", () => {
  describe("buildBody", () => {
    it("builds body with model, max_tokens, temperature, messages", () => {
      const body = anthropicAdapter.buildBody(makeRequest(), "claude-sonnet-4-6");
      expect(body["model"]).toBe("claude-sonnet-4-6");
      expect(body["max_tokens"]).toBe(1024);
      expect(body["temperature"]).toBe(0.3);
      expect(body["messages"]).toEqual([{ role: "user", content: "Hello" }]);
    });

    it("converts system role messages to user role", () => {
      const body = anthropicAdapter.buildBody(
        makeRequest({ messages: [{ role: "system", content: "System" }, { role: "user", content: "Hi" }] }),
        "claude-sonnet-4-6",
      );
      const messages = body["messages"] as Array<{ role: string }>;
      expect(messages[0]?.role).toBe("user");
    });

    it("includes system field when present", () => {
      const body = anthropicAdapter.buildBody(makeRequest({ system: "Be concise" }), "claude-sonnet-4-6");
      expect(body["system"]).toBe("Be concise");
    });

    it("does not include system field when absent", () => {
      const body = anthropicAdapter.buildBody(makeRequest(), "claude-sonnet-4-6");
      expect(body["system"]).toBeUndefined();
    });
  });

  describe("getEndpoint", () => {
    it("returns AI Gateway URL for Anthropic", () => {
      const env = {
        CLOUDFLARE_AI_GATEWAY_URL: "https://gw.example.com",
        ANTHROPIC_API_KEY: "sk-test",
      };
      const endpoint = anthropicAdapter.getEndpoint(env, "claude-sonnet-4-6");
      expect(endpoint.url).toBe("https://gw.example.com/anthropic/v1/messages");
      expect(endpoint.headers["x-api-key"]).toBe("sk-test");
      expect(endpoint.headers["anthropic-version"]).toBe("2023-06-01");
    });
  });

  describe("parseResponse", () => {
    it("extracts text content from Anthropic response", () => {
      const raw = {
        content: [{ type: "text", text: "Hello world" }],
        usage: { input_tokens: 10, output_tokens: 20 },
      };
      const result = anthropicAdapter.parseResponse(raw);
      expect(result.content).toBe("Hello world");
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(20);
      expect(result.usage.totalTokens).toBe(30);
    });

    it("joins multiple text blocks", () => {
      const raw = {
        content: [{ type: "text", text: "A" }, { type: "text", text: "B" }],
        usage: { input_tokens: 5, output_tokens: 10 },
      };
      expect(anthropicAdapter.parseResponse(raw).content).toBe("AB");
    });

    it("handles missing usage", () => {
      const raw = { content: [{ type: "text", text: "X" }] };
      const result = anthropicAdapter.parseResponse(raw);
      expect(result.usage.inputTokens).toBe(0);
      expect(result.usage.outputTokens).toBe(0);
    });
  });
});
