import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { guardMiddleware } from "../middleware/guard.js";

function createApp() {
  const app = new Hono();
  app.use("*", guardMiddleware);
  app.all("*", (c) => c.text("ok"));
  return app;
}

describe("Guard 미들웨어", () => {
  it("/internal/ 경로를 403으로 차단한다", async () => {
    const app = createApp();
    const res = await app.request("/internal/queue-event");
    expect(res.status).toBe(403);
    const body = await res.json() as Record<string, any>;
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("/api/extraction/internal/something도 차단한다", async () => {
    const app = createApp();
    const res = await app.request("/api/extraction/internal/debug");
    expect(res.status).toBe(403);
  });

  it("정상 경로는 통과한다", async () => {
    const app = createApp();
    const res = await app.request("/api/ingestion/documents");
    expect(res.status).toBe(200);
  });

  it("/health는 통과한다", async () => {
    const app = createApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });
});
