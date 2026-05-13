import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  decodeCfAccessJwt,
  extractCfAccessJwtClaims,
  requireCfAccessJwt,
} from "../cf-access-jwt.js";

// Build a minimal valid CF Access JWT (header.payload.signature)
function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${header}.${body}.fakesig`;
}

function makeRequest(jwt?: string): Request {
  const headers: Record<string, string> = {};
  if (jwt !== undefined) headers["Cf-Access-Jwt-Assertion"] = jwt;
  return new Request("https://worker.internal/api/resource", { headers });
}

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600;
const PAST_EXP = Math.floor(Date.now() / 1000) - 60;

const validPayload = {
  sub: "user-abc-123",
  email: "test@example.com",
  name: "Test User",
  exp: FUTURE_EXP,
  iat: Math.floor(Date.now() / 1000) - 10,
};

// ── decodeCfAccessJwt ──────────────────────────────────────────

describe("decodeCfAccessJwt", () => {
  it("decodes a valid JWT and returns claims", () => {
    const jwt = makeJwt(validPayload);
    const claims = decodeCfAccessJwt(jwt);
    expect(claims).not.toBeNull();
    expect(claims?.email).toBe("test@example.com");
    expect(claims?.sub).toBe("user-abc-123");
    expect(claims?.exp).toBe(FUTURE_EXP);
  });

  it("returns null for a token with fewer than 3 parts", () => {
    expect(decodeCfAccessJwt("only.two")).toBeNull();
    expect(decodeCfAccessJwt("one")).toBeNull();
  });

  it("returns null for a token with invalid base64 payload", () => {
    expect(decodeCfAccessJwt("header.!!!invalid!!.sig")).toBeNull();
  });

  it("returns null for a token with non-JSON payload", () => {
    const bad = `header.${btoa("not-json")}.sig`;
    expect(decodeCfAccessJwt(bad)).toBeNull();
  });

  it("handles a JWT with optional fields absent", () => {
    const jwt = makeJwt({ sub: "s", email: "e@e.com", exp: FUTURE_EXP });
    const claims = decodeCfAccessJwt(jwt);
    expect(claims?.name).toBeUndefined();
    expect(claims?.iss).toBeUndefined();
  });
});

// ── extractCfAccessJwtClaims ───────────────────────────────────

describe("extractCfAccessJwtClaims", () => {
  it("returns claims for a valid non-expired JWT", () => {
    const req = makeRequest(makeJwt(validPayload));
    const claims = extractCfAccessJwtClaims(req);
    expect(claims?.email).toBe("test@example.com");
  });

  it("returns null when header is absent", () => {
    const req = makeRequest();
    expect(extractCfAccessJwtClaims(req)).toBeNull();
  });

  it("returns null for an expired JWT (exp < now)", () => {
    const req = makeRequest(makeJwt({ ...validPayload, exp: PAST_EXP }));
    expect(extractCfAccessJwtClaims(req)).toBeNull();
  });

  it("returns null for a malformed JWT", () => {
    const req = makeRequest("not.a.jwt.at.all");
    expect(extractCfAccessJwtClaims(req)).toBeNull();
  });
});

// ── requireCfAccessJwt ─────────────────────────────────────────

describe("requireCfAccessJwt", () => {
  it("returns null (allow) for a valid JWT", () => {
    const req = makeRequest(makeJwt(validPayload));
    expect(requireCfAccessJwt(req)).toBeNull();
  });

  it("returns 401 Response when JWT header is missing", async () => {
    const req = makeRequest();
    const res = requireCfAccessJwt(req);
    expect(res).toBeInstanceOf(Response);
    expect(res?.status).toBe(401);
  });

  it("returns 401 Response for an expired JWT", async () => {
    const req = makeRequest(makeJwt({ ...validPayload, exp: PAST_EXP }));
    const res = requireCfAccessJwt(req);
    expect(res).toBeInstanceOf(Response);
    expect(res?.status).toBe(401);
  });

  it("response body contains error message", async () => {
    const req = makeRequest();
    const res = requireCfAccessJwt(req);
    const body = await res?.json() as { error?: { message?: string } };
    expect(body?.error?.message).toContain("CF Access JWT");
  });
});
