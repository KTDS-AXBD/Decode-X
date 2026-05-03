import { describe, it, expect, vi, beforeEach } from "vitest";
import { callLlmRouterWithMeta } from "./llm-client.js";
import type { LlmClientEnv } from "./llm-client.js";

const mockEnv: LlmClientEnv = {
  CLOUDFLARE_AI_GATEWAY_URL: "https://gateway.ai.example.com/openrouter/v1/chat/completions",
  OPENROUTER_API_KEY: "sk-test-key",
};

const validJsonResponse = {
  model: "anthropic/claude-haiku-4-5",
  choices: [{ message: { role: "assistant", content: '{"score": 0.9, "rationale": "Good"}' } }],
};

function makeResponse(
  body: string | object,
  contentType: string,
  status = 200,
): Response {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(bodyStr, {
    status,
    headers: { "content-type": contentType },
  });
}

describe("callLlmRouterWithMeta — HTML guard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("HTML 응답 1회 후 정상 JSON → retry 성공", async () => {
    const htmlResponse = makeResponse("<!DOCTYPE html><html>503 Rate Limit</html>", "text/html; charset=utf-8");
    const jsonResponse = makeResponse(validJsonResponse, "application/json");

    let callCount = 0;
    vi.stubGlobal("fetch", () => {
      callCount++;
      return Promise.resolve(callCount === 1 ? htmlResponse : jsonResponse);
    });

    const result = await callLlmRouterWithMeta(mockEnv, "test-service", "haiku", "test prompt");
    expect(result.content).toBe('{"score": 0.9, "rationale": "Good"}');
    expect(result.model).toBe("anthropic/claude-haiku-4-5");
    expect(callCount).toBe(2);
  });

  it("HTML 응답 3회 모두 → Error throw", async () => {
    const htmlResponse = makeResponse(
      "<!DOCTYPE html><html>Service Unavailable</html>",
      "text/html",
    );

    vi.stubGlobal("fetch", () => Promise.resolve(htmlResponse));

    await expect(
      callLlmRouterWithMeta(mockEnv, "test-service", "haiku", "test prompt"),
    ).rejects.toThrow(/LLM returned HTML response after 3 attempts/);
  });

  it("정상 JSON 응답 → retry 없이 즉시 반환", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", () => {
      callCount++;
      return Promise.resolve(makeResponse(validJsonResponse, "application/json"));
    });

    const result = await callLlmRouterWithMeta(mockEnv, "test-service", "sonnet", "test prompt");
    expect(result.provider).toBe("openrouter");
    expect(callCount).toBe(1);
  });

  it("HTTP 4xx 오류 → 즉시 Error throw (retry 없음)", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        makeResponse("Unauthorized", "text/plain", 401),
      ),
    );

    await expect(
      callLlmRouterWithMeta(mockEnv, "test-service", "haiku", "test prompt"),
    ).rejects.toThrow(/LLM Router \(OpenRouter\) error 401/);
  });
});
