import { describe, it, expect, vi } from "vitest";
import { SignJWT } from "jose";
import app from "../index.js";

const JWT_SECRET = "test-jwt-secret";
const SECRET_KEY = new TextEncoder().encode(JWT_SECRET);

async function createToken() {
  return new SignJWT({ sub: "user-1", role: "analyst", org: "org-1" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(SECRET_KEY);
}

function mockFetcher(responseBody = "downstream-ok", status = 200): Fetcher {
  return {
    fetch: vi.fn().mockResolvedValue(new Response(responseBody, { status })),
    connect: vi.fn(),
  } as unknown as Fetcher;
}

function mockEnv(overrides: Record<string, unknown> = {}) {
  const fetcher = mockFetcher();
  return {
    SVC_INGESTION: fetcher,
    SVC_EXTRACTION: fetcher,
    SVC_POLICY: fetcher,
    SVC_ONTOLOGY: fetcher,
    SVC_SKILL: fetcher,
    SVC_LLM_ROUTER: fetcher,
    SVC_SECURITY: fetcher,
    SVC_GOVERNANCE: fetcher,
    SVC_NOTIFICATION: fetcher,
    SVC_ANALYTICS: fetcher,
    SVC_MCP_SERVER: fetcher,
    INTERNAL_API_SECRET: "test-secret",
    GATEWAY_JWT_SECRET: JWT_SECRET,
    SERVICE_NAME: "recon-x-api",
    ENVIRONMENT: "test",
    ...overrides,
  } as unknown as Record<string, unknown>;
}

describe("프록시 라우팅", () => {
  it("알 수 없는 서비스(인증 후)에 404를 반환한다", async () => {
    const token = await createToken();
    const env = mockEnv();
    const res = await app.request("/api/unknown/test", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, any>;
    expect(body.error.message).toContain("unknown");
  });

  it("/api/mcp/tools → svc-mcp-server로 프록시한다 (public)", async () => {
    const fetcher = mockFetcher(JSON.stringify({ tools: [] }));
    const env = mockEnv({ SVC_MCP_SERVER: fetcher });
    const res = await app.request("/api/mcp/tools", {}, env);
    expect(res.status).toBe(200);
    expect((fetcher.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it("존재하지 않는 루트 경로(인증 후)에 404를 반환한다", async () => {
    const token = await createToken();
    const env = mockEnv();
    const res = await app.request("/nonexistent", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    expect(res.status).toBe(404);
  });

  it("/api/ingestion(trailing path 없음)도 인증 후 프록시한다", async () => {
    const token = await createToken();
    const fetcher = mockFetcher("root-ok");
    const env = mockEnv({ SVC_INGESTION: fetcher });
    const res = await app.request("/api/ingestion", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    expect(res.status).toBe(200);
    expect((fetcher.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it("X-Internal-Secret 헤더를 downstream에 주입한다", async () => {
    const fetcher = mockFetcher();
    const env = mockEnv({ SVC_MCP_SERVER: fetcher });
    await app.request("/api/mcp/tools", {}, env);
    const call = (fetcher.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call).toBeDefined();
    const req = call[0] as Request;
    expect(req.headers.get("X-Internal-Secret")).toBe("test-secret");
  });

  it("downstream 경로에서 /api/:service 접두사를 제거한다", async () => {
    const fetcher = mockFetcher();
    const env = mockEnv({ SVC_MCP_SERVER: fetcher });
    await app.request("/api/mcp/tools/list?q=test", {}, env);
    const call = (fetcher.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const req = call[0] as Request;
    const url = new URL(req.url);
    expect(url.pathname).toBe("/tools/list");
    expect(url.search).toBe("?q=test");
  });
});
