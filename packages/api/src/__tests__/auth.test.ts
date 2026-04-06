import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { SignJWT } from "jose";
import { authMiddleware } from "../middleware/auth.js";
import type { AppEnv } from "../env.js";

const JWT_SECRET = "test-secret-key-for-gateway";
const SECRET_KEY = new TextEncoder().encode(JWT_SECRET);

async function createToken(payload: Record<string, string>, expiresIn = "1h") {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .sign(SECRET_KEY);
}

function createApp() {
  const app = new Hono<AppEnv>();
  app.use("*", authMiddleware);
  app.get("/api/test", (c) => {
    return c.json({
      userId: c.get("userId"),
      userRole: c.get("userRole"),
      organizationId: c.get("organizationId"),
    });
  });
  app.get("/health", (c) => c.text("ok"));
  app.get("/api/mcp/tools", (c) => c.text("mcp"));
  return app;
}

function mockEnv() {
  return { GATEWAY_JWT_SECRET: JWT_SECRET } as unknown as Record<string, unknown>;
}

describe("Auth 미들웨어", () => {
  it("유효한 JWT로 사용자 정보를 추출한다", async () => {
    const token = await createToken({ sub: "user-1", role: "analyst", org: "org-1" });
    const app = createApp();
    const res = await app.request("/api/test", {
      headers: { Authorization: `Bearer ${token}` },
    }, mockEnv());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe("user-1");
    expect(body.userRole).toBe("analyst");
    expect(body.organizationId).toBe("org-1");
  });

  it("Authorization 헤더 없으면 401을 반환한다", async () => {
    const app = createApp();
    const res = await app.request("/api/test", {}, mockEnv());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("잘못된 토큰이면 401을 반환한다", async () => {
    const app = createApp();
    const res = await app.request("/api/test", {
      headers: { Authorization: "Bearer invalid.token.here" },
    }, mockEnv());
    expect(res.status).toBe(401);
  });

  it("만료된 토큰이면 401을 반환한다", async () => {
    const token = await createToken({ sub: "user-1", role: "analyst", org: "org-1" }, "0s");
    // 만료 대기
    await new Promise((r) => setTimeout(r, 1100));
    const app = createApp();
    const res = await app.request("/api/test", {
      headers: { Authorization: `Bearer ${token}` },
    }, mockEnv());
    expect(res.status).toBe(401);
  });

  it("/health는 인증 없이 통과한다", async () => {
    const app = createApp();
    const res = await app.request("/health", {}, mockEnv());
    expect(res.status).toBe(200);
  });

  it("/api/mcp/*는 인증 없이 통과한다", async () => {
    const app = createApp();
    const res = await app.request("/api/mcp/tools", {}, mockEnv());
    expect(res.status).toBe(200);
  });
});
