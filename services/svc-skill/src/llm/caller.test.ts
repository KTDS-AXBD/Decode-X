import { describe, it, expect, vi } from "vitest";
import { callSonnetLlm } from "./caller.js";

function mockFetcher(response: Response): Fetcher {
  return { fetch: vi.fn().mockResolvedValue(response) } as unknown as Fetcher;
}

describe("callSonnetLlm", () => {
  it("returns content on successful response", async () => {
    const fetcher = mockFetcher(
      new Response(
        JSON.stringify({ success: true, data: { content: "generated-doc" } }),
        { status: 200 },
      ),
    );
    const result = await callSonnetLlm("sys", "user", fetcher, "secret");
    expect(result).toBe("generated-doc");
  });

  it("sends sonnet tier in request", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { content: "ok" } }),
        { status: 200 },
      ),
    );
    const fetcher = { fetch: fetchFn } as unknown as Fetcher;

    await callSonnetLlm("sys", "user", fetcher, "secret");

    const [, opts] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body["tier"]).toBe("sonnet");
    expect(body["callerService"]).toBe("svc-skill");
    expect(body["maxTokens"]).toBe(2048);
  });

  it("throws on non-OK HTTP status", async () => {
    const fetcher = mockFetcher(new Response("Server Error", { status: 500 }));
    await expect(
      callSonnetLlm("sys", "user", fetcher, "secret"),
    ).rejects.toThrow("LLM Router error 500");
  });

  it("throws when API returns failure", async () => {
    const fetcher = mockFetcher(
      new Response(
        JSON.stringify({ success: false, error: { message: "rate limited" } }),
        { status: 200 },
      ),
    );
    await expect(
      callSonnetLlm("sys", "user", fetcher, "secret"),
    ).rejects.toThrow("rate limited");
  });
});
