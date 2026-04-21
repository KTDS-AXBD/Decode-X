// F370: GET /auth/me — CF Access JWT → D1 users upsert → role response
// Called by SPA on load to resolve user role from D1 users table.
// CF Access injects Cf-Access-Jwt-Assertion header; no app-level OAuth logic.

import type { Env } from "../env.js";
import { unauthorized } from "@ai-foundry/utils";

interface CfJwtPayload {
  email: string;
  name?: string;
  sub: string;
  exp: number;
}

function decodeCfJwt(token: string): CfJwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || parts[1] === undefined) return null;
    const pad = 4 - (parts[1].length % 4);
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/") + (pad === 4 ? "" : "=".repeat(pad));
    return JSON.parse(atob(b64)) as CfJwtPayload;
  } catch {
    return null;
  }
}

export async function handleGetMe(request: Request, env: Env): Promise<Response> {
  const jwtToken = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!jwtToken) {
    return unauthorized("CF Access JWT required");
  }

  const claims = decodeCfJwt(jwtToken);
  if (!claims?.email) {
    return unauthorized("Invalid JWT claims");
  }

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp < now) {
    return unauthorized("JWT expired");
  }

  const existing = await env.DB_SKILL
    .prepare("SELECT email, primary_role, status FROM users WHERE email = ?")
    .bind(claims.email)
    .first<{ email: string; primary_role: string; status: string }>();

  if (!existing) {
    await env.DB_SKILL
      .prepare(
        `INSERT INTO users (email, primary_role, status, last_login, created_at, display_name)
         VALUES (?, 'engineer', 'active', ?, ?, ?)`
      )
      .bind(claims.email, now, now, claims.name ?? claims.email)
      .run();

    return Response.json({ email: claims.email, role: "engineer", status: "active", isNew: true });
  }

  await env.DB_SKILL
    .prepare("UPDATE users SET last_login = ? WHERE email = ?")
    .bind(now, claims.email)
    .run();

  if (existing.status === "suspended") {
    return new Response(
      JSON.stringify({ error: "Account suspended" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  return Response.json({
    email: claims.email,
    role: existing.primary_role,
    status: existing.status,
    isNew: false,
  });
}
