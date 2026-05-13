import { unauthorized } from "./response.js";

export interface CfAccessJwtClaims {
  sub: string;
  email: string;
  name?: string | undefined;
  exp: number;
  iat?: number | undefined;
  iss?: string | undefined;
  aud?: string | string[] | undefined;
}

function base64UrlDecode(str: string): string {
  const pad = 4 - (str.length % 4);
  return atob(
    str.replace(/-/g, "+").replace(/_/g, "/") + (pad === 4 ? "" : "=".repeat(pad)),
  );
}

/**
 * Decode a CF Access JWT payload without signature verification.
 * CF Access edge validates signatures; workers only need expiry enforcement.
 */
export function decodeCfAccessJwt(token: string): CfAccessJwtClaims | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || parts[1] === undefined) return null;
    return JSON.parse(base64UrlDecode(parts[1])) as CfAccessJwtClaims;
  } catch {
    return null;
  }
}

/**
 * Extract and validate CF Access JWT claims from the Cf-Access-Jwt-Assertion header.
 * Returns null if the header is absent, the token is malformed, or the token is expired.
 */
export function extractCfAccessJwtClaims(request: Request): CfAccessJwtClaims | null {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;
  const claims = decodeCfAccessJwt(token);
  if (!claims) return null;
  if (claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}

/**
 * Middleware guard: returns a 401 Response if the CF Access JWT is missing or expired.
 * Returns null when the request is authenticated and may proceed.
 *
 * Usage in worker fetch handlers (before RBAC):
 *   if (!path.startsWith("/internal/")) {
 *     const denied = requireCfAccessJwt(request);
 *     if (denied) return denied;
 *   }
 */
export function requireCfAccessJwt(request: Request): Response | null {
  const claims = extractCfAccessJwtClaims(request);
  if (!claims) return unauthorized("CF Access JWT required or expired");
  return null;
}
