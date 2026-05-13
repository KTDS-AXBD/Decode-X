// F370: GET /auth/me — CF Access JWT → D1 users upsert → role response
// Called by SPA on load to resolve user role from D1 users table.
// CF Access injects Cf-Access-Jwt-Assertion header; no app-level OAuth logic.

import type { Env } from "../env.js";
import { unauthorized, extractCfAccessJwtClaims } from "@ai-foundry/utils";

export async function handleGetMe(request: Request, env: Env): Promise<Response> {
  const claims = extractCfAccessJwtClaims(request);
  if (!claims?.email) {
    return unauthorized("CF Access JWT required or expired");
  }

  const now = Math.floor(Date.now() / 1000);

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
