import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { health } from "../routes/health.js";
import type { AppEnv } from "../env.js";

function mockFetcher(ok: boolean): Fetcher {
  return {
    fetch: vi.fn().mockResolvedValue(new Response("ok", { status: ok ? 200 : 500 })),
    connect: vi.fn(),
  } as unknown as Fetcher;
}

function mockEnv(overrides: Partial<Record<string, Fetcher>> = {}) {
  const defaultFetcher = mockFetcher(true);
  return {
    SVC_INGESTION: defaultFetcher,
    SVC_EXTRACTION: defaultFetcher,
    SVC_POLICY: defaultFetcher,
    SVC_ONTOLOGY: defaultFetcher,
    SVC_SKILL: defaultFetcher,
    SVC_LLM_ROUTER: defaultFetcher,
    SVC_SECURITY: defaultFetcher,
    SVC_GOVERNANCE: defaultFetcher,
    SVC_NOTIFICATION: defaultFetcher,
    SVC_ANALYTICS: defaultFetcher,
    SVC_MCP_SERVER: defaultFetcher,
    ...overrides,
  } as unknown as Record<string, unknown>;
}

describe("Health 라우트", () => {
  it("전체 healthy이면 200을 반환한다", async () => {
    const app = new Hono<AppEnv>();
    app.route("/", health);
    const res = await app.request("/health", {}, mockEnv());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("healthy");
    expect(Object.keys(body.services)).toHaveLength(11);
  });

  it("일부 unhealthy이면 503 + degraded를 반환한다", async () => {
    const app = new Hono<AppEnv>();
    app.route("/", health);
    const res = await app.request("/health", {}, mockEnv({
      SVC_INGESTION: mockFetcher(false),
    }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.services.ingestion.status).toBe("unhealthy");
  });

  it("서비스 unreachable이면 503 + degraded를 반환한다", async () => {
    const failFetcher = {
      fetch: vi.fn().mockRejectedValue(new Error("connection refused")),
      connect: vi.fn(),
    } as unknown as Fetcher;
    const app = new Hono<AppEnv>();
    app.route("/", health);
    const res = await app.request("/health", {}, mockEnv({
      SVC_POLICY: failFetcher,
    }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.services.policy.status).toBe("unreachable");
  });

  it("timestamp를 포함한다", async () => {
    const app = new Hono<AppEnv>();
    app.route("/", health);
    const res = await app.request("/health", {}, mockEnv());
    const body = await res.json();
    expect(body.timestamp).toBeDefined();
  });
});
