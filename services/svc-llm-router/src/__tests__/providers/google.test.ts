import { describe, it, expect } from "vitest";
import { googleAdapter } from "../../providers/google.js";
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

describe("googleAdapter", () => {
  describe("buildBody", () => {
    it("builds Gemini generateContent body with contents/parts format", () => {
      const body = googleAdapter.buildBody(makeRequest(), "gemini-2.0-flash");
      const contents = body["contents"] as Array<{ role: string; parts: Array<{ text: string }> }>;
      expect(contents).toHaveLength(1);
      expect(contents[0]?.role).toBe("user");
      expect(contents[0]?.parts[0]?.text).toBe("Hello");
    });

    it("converts assistant role to model role", () => {
      const body = googleAdapter.buildBody(
        makeRequest({
          messages: [
            { role: "user", content: "Q" },
            { role: "assistant", content: "A" },
          ],
        }),
        "gemini-2.0-flash",
      );
      const contents = body["contents"] as Array<{ role: string }>;
      expect(contents[0]?.role).toBe("user");
      expect(contents[1]?.role).toBe("model");
    });

    it("includes systemInstruction when system is present", () => {
      const body = googleAdapter.buildBody(makeRequest({ system: "Be helpful" }), "gemini-2.0-flash");
      const sysInstruction = body["systemInstruction"] as { parts: Array<{ text: string }> };
      expect(sysInstruction.parts[0]?.text).toBe("Be helpful");
    });

    it("does not include systemInstruction when system is absent", () => {
      const body = googleAdapter.buildBody(makeRequest(), "gemini-2.0-flash");
      expect(body["systemInstruction"]).toBeUndefined();
    });

    it("includes generationConfig with maxOutputTokens and temperature", () => {
      const body = googleAdapter.buildBody(makeRequest(), "gemini-2.0-flash");
      const config = body["generationConfig"] as { maxOutputTokens: number; temperature: number };
      expect(config.maxOutputTokens).toBe(1024);
      expect(config.temperature).toBe(0.3);
    });
  });

  describe("getEndpoint", () => {
    it("returns correct Gemini URL with model name", () => {
      const env = {
        CLOUDFLARE_AI_GATEWAY_URL: "https://gw.example.com",
        GOOGLE_AI_API_KEY: "AIza-test",
      };
      const endpoint = googleAdapter.getEndpoint(env, "gemini-2.0-flash");
      expect(endpoint.url).toBe("https://gw.example.com/google-ai-studio/v1beta/models/gemini-2.0-flash:generateContent");
      expect(endpoint.headers["x-goog-api-key"]).toBe("AIza-test");
    });
  });

  describe("parseResponse", () => {
    it("extracts text from Gemini response", () => {
      const raw = {
        candidates: [{ content: { parts: [{ text: "Hello from Gemini" }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
      };
      const result = googleAdapter.parseResponse(raw);
      expect(result.content).toBe("Hello from Gemini");
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(20);
      expect(result.usage.totalTokens).toBe(30);
    });

    it("joins multiple parts", () => {
      const raw = {
        candidates: [{ content: { parts: [{ text: "A" }, { text: "B" }] } }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10, totalTokenCount: 15 },
      };
      expect(googleAdapter.parseResponse(raw).content).toBe("AB");
    });

    it("handles missing candidates", () => {
      const raw = {};
      const result = googleAdapter.parseResponse(raw);
      expect(result.content).toBe("");
      expect(result.usage.inputTokens).toBe(0);
    });
  });
});
