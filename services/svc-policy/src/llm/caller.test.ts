import { describe, it, expect, vi, afterEach } from "vitest";
import { callOpusLlm } from "./caller.js";
import type { LlmClientEnv } from "@ai-foundry/utils";

function makeEnv(): LlmClientEnv {
  return {
    CLOUDFLARE_AI_GATEWAY_URL: "http://test-gateway",
    OPENROUTER_API_KEY: "test-openrouter-key",
  };
}

function openRouterResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-test",
      model: "anthropic/claude-opus-4-5",
      choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    { status: 200 },
  );
}

describe("callOpusLlm (via OpenRouter @ CF AI Gateway)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns content on successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(openRouterResponse("test-content")));

    const result = await callOpusLlm("system", "user", makeEnv());
    expect(result).toBe("test-content");
  });

  it("sends OpenRouter chat-completions body to CLOUDFLARE_AI_GATEWAY_URL", async () => {
    const fetchFn = vi.fn().mockResolvedValue(openRouterResponse("ok"));
    vi.stubGlobal("fetch", fetchFn);

    await callOpusLlm("sys-prompt", "user-msg", makeEnv());

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, opts] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://test-gateway");
    expect(opts.method).toBe("POST");

    const headers = opts.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-openrouter-key");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body["model"]).toBe("anthropic/claude-opus-4-5");
    const messages = body["messages"] as Array<{ role: string; content: string }>;
    expect(messages[0]).toEqual({ role: "system", content: "sys-prompt" });
    expect(messages[1]).toEqual({ role: "user", content: "user-msg" });
    expect(body["max_tokens"]).toBe(4096);
    expect(body["temperature"]).toBe(0.3);
  });

  it("throws on non-OK HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Bad Request", { status: 400 })),
    );

    await expect(callOpusLlm("sys", "user", makeEnv())).rejects.toThrow(
      "LLM Router (OpenRouter) error 400: Bad Request",
    );
  });

  it("throws when OpenRouter returns error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: "quota exceeded", code: "rate_limited" } }),
          { status: 200 },
        ),
      ),
    );

    await expect(callOpusLlm("sys", "user", makeEnv())).rejects.toThrow("quota exceeded");
  });
});
