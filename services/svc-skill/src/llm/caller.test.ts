import { describe, it, expect, vi } from "vitest";
import { callSonnetLlm } from "./caller.js";
import type { LlmClientEnv } from "@ai-foundry/utils";

function openRouterResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-test",
      model: "anthropic/claude-sonnet-4-5",
      choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
    }),
    { status: 200 },
  );
}

function mockEnv(content: string, ok = true): LlmClientEnv {
  const response = ok ? openRouterResponse(content) : new Response("Server Error", { status: 500 });

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

  return {
    CLOUDFLARE_AI_GATEWAY_URL: "http://test-gateway",
    OPENROUTER_API_KEY: "test-openrouter-key",
  };
}

describe("callSonnetLlm (via OpenRouter @ CF AI Gateway)", () => {
  it("returns content on successful response", async () => {
    const env = mockEnv("generated-doc");
    const result = await callSonnetLlm("sys", "user", env);
    expect(result).toBe("generated-doc");
  });

  it("sends OpenRouter chat-completions body with sonnet slug", async () => {
    const env = mockEnv("ok");

    await callSonnetLlm("sys", "user", env);

    const fetchFn = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [url, opts] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://test-gateway");

    const headers = opts.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-openrouter-key");
    expect(headers["X-Title"]).toBe("Decode-X/svc-skill");

    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body["model"]).toBe("anthropic/claude-sonnet-4-5");
    expect(body["max_tokens"]).toBe(2048);
    const messages = body["messages"] as Array<{ role: string; content: string }>;
    expect(messages[0]).toEqual({ role: "system", content: "sys" });
    expect(messages[1]).toEqual({ role: "user", content: "user" });
  });

  it("throws on non-OK HTTP status", async () => {
    const env = mockEnv("", false);
    await expect(callSonnetLlm("sys", "user", env)).rejects.toThrow(
      "LLM Router (OpenRouter) error 500",
    );
  });

  it("throws when OpenRouter returns error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: "rate limited", code: "rate_limited" } }),
          { status: 200 },
        ),
      ),
    );
    const env: LlmClientEnv = {
      CLOUDFLARE_AI_GATEWAY_URL: "http://test-gateway",
      OPENROUTER_API_KEY: "test-openrouter-key",
    };
    await expect(callSonnetLlm("sys", "user", env)).rejects.toThrow("rate limited");
  });
});
