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

  it("X-Internal-Secret 헤더를 downstream에 주입한다", async () => {
    const fetcher = mockFetcher();
    const env = mockEnv({ SVC_MCP_SERVER: fetcher });
    await app.request("/api/mcp/tools", {}, env);
    const call = (fetcher.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call).toBeDefined();
    const req = call[0] as Request;
    expect(req.headers.get("X-Internal-Secret")).toBe("test-secret");
  });

  it("PREFIX_STRIP_MAP 서비스는 prefix를 제거한다 (mcp)", async () => {
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

describe("리소스 기반 라우팅 (레거시 호환)", () => {
  it("/api/documents/123 → SVC_INGESTION으로 프록시한다", async () => {
    const token = await createToken();
    const fetcher = mockFetcher(JSON.stringify({ success: true }));
    const env = mockEnv({ SVC_INGESTION: fetcher });
    const res = await app.request("/api/documents/123", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    expect(res.status).toBe(200);
    expect((fetcher.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it("리소스 라우팅은 리소스명을 downstream 경로에 보존한다", async () => {
    const token = await createToken();
    const fetcher = mockFetcher();
    const env = mockEnv({ SVC_INGESTION: fetcher });
    await app.request("/api/documents/123/chunks?limit=10", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    const call = (fetcher.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const req = call[0] as Request;
    const url = new URL(req.url);
    expect(url.pathname).toBe("/documents/123/chunks");
    expect(url.search).toBe("?limit=10");
  });

  it("/api/factcheck → SVC_EXTRACTION으로 프록시한다", async () => {
    const token = await createToken();
    const fetcher = mockFetcher(JSON.stringify({ success: true }));
    const env = mockEnv({ SVC_EXTRACTION: fetcher });
    const res = await app.request("/api/factcheck/results", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    expect(res.status).toBe(200);
    const call = (fetcher.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const req = call[0] as Request;
    expect(new URL(req.url).pathname).toBe("/factcheck/results");
  });

  it("/api/policies → SVC_POLICY로 프록시한다", async () => {
    const token = await createToken();
    const fetcher = mockFetcher();
    const env = mockEnv({ SVC_POLICY: fetcher });
    await app.request("/api/policies/123/approve", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    const call = (fetcher.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const req = call[0] as Request;
    expect(new URL(req.url).pathname).toBe("/policies/123/approve");
    expect(req.method).toBe("POST");
  });

  it("/api/cost → SVC_GOVERNANCE로 프록시한다", async () => {
    const token = await createToken();
    const fetcher = mockFetcher();
    const env = mockEnv({ SVC_GOVERNANCE: fetcher });
    await app.request("/api/cost", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    expect((fetcher.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it("/api/reports → SVC_ANALYTICS로 프록시한다", async () => {
    const token = await createToken();
    const fetcher = mockFetcher();
    const env = mockEnv({ SVC_ANALYTICS: fetcher });
    await app.request("/api/reports/sections?orgId=lpon", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    const call = (fetcher.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const req = call[0] as Request;
    const url = new URL(req.url);
    expect(url.pathname).toBe("/reports/sections");
    expect(url.search).toBe("?orgId=lpon");
  });

  it("/api/skills/stats → SVC_SKILL로 프록시하며 /skills/stats를 보존한다", async () => {
    const token = await createToken();
    const fetcher = mockFetcher();
    const env = mockEnv({ SVC_SKILL: fetcher });
    await app.request("/api/skills/stats", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    const call = (fetcher.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const req = call[0] as Request;
    expect(new URL(req.url).pathname).toBe("/skills/stats");
  });

  it("/api/export → SVC_EXTRACTION으로 프록시한다 (trailing path 없음)", async () => {
    const token = await createToken();
    const fetcher = mockFetcher();
    const env = mockEnv({ SVC_EXTRACTION: fetcher });
    await app.request("/api/export", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    const call = (fetcher.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const req = call[0] as Request;
    expect(new URL(req.url).pathname).toBe("/export");
  });
});
