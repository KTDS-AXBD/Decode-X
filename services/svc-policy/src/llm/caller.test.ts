import { describe, it, expect, vi } from "vitest";
import { callOpusLlm } from "./caller.js";

function mockFetcher(response: Response): Fetcher {
  return { fetch: vi.fn().mockResolvedValue(response) } as unknown as Fetcher;
}

describe("callOpusLlm", () => {
  it("returns content on successful response", async () => {
    const fetcher = mockFetcher(
      new Response(
        JSON.stringify({ success: true, data: { content: "test-content" } }),
        { status: 200 },
      ),
    );

    const result = await callOpusLlm("system", "user", fetcher, "secret");
    expect(result).toBe("test-content");
  });

  it("sends correct request body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { content: "ok" } }),
        { status: 200 },
      ),
    );
    const fetcher = { fetch: fetchFn } as unknown as Fetcher;

    await callOpusLlm("sys-prompt", "user-msg", fetcher, "my-secret");

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, opts] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://svc-llm-router.internal/complete");
    expect(opts.method).toBe("POST");

    const headers = opts.headers as Record<string, string>;
    expect(headers["X-Internal-Secret"]).toBe("my-secret");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body["tier"]).toBe("opus");
    expect(body["system"]).toBe("sys-prompt");
    expect(body["callerService"]).toBe("svc-policy");
    expect(body["maxTokens"]).toBe(4096);
    expect(body["temperature"]).toBe(0.3);
  });

  it("throws on non-OK HTTP status", async () => {
    const fetcher = mockFetcher(
      new Response("Bad Request", { status: 400 }),
    );

    await expect(
      callOpusLlm("sys", "user", fetcher, "secret"),
    ).rejects.toThrow("LLM Router error 400: Bad Request");
  });

  it("throws when API returns success: false", async () => {
    const fetcher = mockFetcher(
      new Response(
        JSON.stringify({ success: false, error: { message: "quota exceeded" } }),
        { status: 200 },
      ),
    );

    await expect(
      callOpusLlm("sys", "user", fetcher, "secret"),
    ).rejects.toThrow("quota exceeded");
  });
});
