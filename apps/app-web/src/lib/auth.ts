// F370: CF Access JWT parsing (client-side)
// CF Access handles OAuth redirect/callback at edge — this lib only decodes the resulting JWT.
// The JWT is in the CF_Authorization cookie (set by CF Access after login).
// Signature verification is done by CF edge; client-side decode is safe for display/routing.

export interface CfJwtClaims {
  email: string;
  name?: string | undefined;
  sub: string;
  aud: string | string[];
  iss: string;
  iat: number;
  exp: number;
}

function base64UrlDecode(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = padded.length % 4;
  return atob(remainder === 0 ? padded : padded + "=".repeat(4 - remainder));
}

export function parseCfJwt(token: string): CfJwtClaims | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || parts[1] === undefined) return null;
    const payload = JSON.parse(base64UrlDecode(parts[1])) as CfJwtClaims;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getCfJwtFromCookie(): CfJwtClaims | null {
  const cookie = document.cookie
    .split("; ")
    .find((c) => c.startsWith("CF_Authorization="));
  if (!cookie) return null;
  const token = cookie.slice("CF_Authorization=".length);
  return parseCfJwt(token);
}
