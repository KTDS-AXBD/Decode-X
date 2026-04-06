import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { corsMiddleware } from "../middleware/cors.js";

function createApp() {
  const app = new Hono();
  app.use("*", corsMiddleware);
  app.get("/test", (c) => c.text("ok"));
  return app;
}

describe("CORS 미들웨어", () => {
  it("허용된 origin에 CORS 헤더를 반환한다", async () => {
    const app = createApp();
    const res = await app.request("/test", {
      headers: { Origin: "https://ai-foundry.minu.best" },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://ai-foundry.minu.best");
  });

  it("localhost:5173을 허용한다", async () => {
    const app = createApp();
    const res = await app.request("/test", {
      headers: { Origin: "http://localhost:5173" },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });

  it("허용되지 않은 origin은 CORS 헤더를 비운다", async () => {
    const app = createApp();
    const res = await app.request("/test", {
      headers: { Origin: "https://evil.com" },
    });
    const acao = res.headers.get("Access-Control-Allow-Origin");
    expect(acao === null || acao === "").toBe(true);
  });

  it("OPTIONS preflight에 200을 반환한다", async () => {
    const app = createApp();
    const res = await app.request("/test", {
      method: "OPTIONS",
      headers: {
        Origin: "https://ai-foundry.minu.best",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});
