import { describe, it, expect } from "vitest";
import { buildWorkersAiInput, parseWorkersAiResponse } from "../../providers/workers-ai.js";
import type { LlmRequest } from "@ai-foundry/types";

function makeRequest(overrides?: Partial<LlmRequest>): LlmRequest {
  return {
    tier: "haiku",
    callerService: "svc-extraction",
    messages: [{ role: "user", content: "Hello" }],
    maxTokens: 512,
    temperature: 0.3,
    stream: false,
    ...overrides,
  };
}

describe("buildWorkersAiInput", () => {
  it("builds messages array with max_tokens and temperature", () => {
    const input = buildWorkersAiInput(makeRequest());
    expect(input["messages"]).toEqual([{ role: "user", content: "Hello" }]);
    expect(input["max_tokens"]).toBe(512);
    expect(input["temperature"]).toBe(0.3);
  });

  it("prepends system message when present", () => {
    const input = buildWorkersAiInput(makeRequest({ system: "Be helpful" }));
    const messages = input["messages"] as Array<{ role: string; content: string }>;
    expect(messages[0]).toEqual({ role: "system", content: "Be helpful" });
    expect(messages[1]).toEqual({ role: "user", content: "Hello" });
  });

  it("preserves all message roles", () => {
    const input = buildWorkersAiInput(makeRequest({
      messages: [
        { role: "user", content: "Q" },
        { role: "assistant", content: "A" },
      ],
    }));
    const messages = input["messages"] as Array<{ role: string }>;
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });
});

describe("parseWorkersAiResponse", () => {
  it("extracts response from { response: string } format", () => {
    const result = parseWorkersAiResponse({ response: "Hello from Llama" });
    expect(result.content).toBe("Hello from Llama");
  });

  it("extracts response from { result: { response: string } } format", () => {
    const result = parseWorkersAiResponse({ result: { response: "Nested response" } });
    expect(result.content).toBe("Nested response");
  });

  it("returns empty string for missing response", () => {
    const result = parseWorkersAiResponse({});
    expect(result.content).toBe("");
  });

  it("returns zero usage (Workers AI does not report tokens)", () => {
    const result = parseWorkersAiResponse({ response: "test" });
    expect(result.usage.inputTokens).toBe(0);
    expect(result.usage.outputTokens).toBe(0);
    expect(result.usage.totalTokens).toBe(0);
  });
});
