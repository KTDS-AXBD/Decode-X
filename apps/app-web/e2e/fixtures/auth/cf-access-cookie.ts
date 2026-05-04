// CF Access JWT mock builder for Playwright E2E tests.
// getCfJwtFromCookie() in src/lib/auth.ts decodes without signature verification,
// so an unsigned token (header.payload.) is sufficient for testing.

interface CfJwtClaims {
  email: string;
  name?: string;
  sub: string;
  aud: string[];
  iss: string;
  iat: number;
  exp: number;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function buildCfJwt(overrides?: Partial<CfJwtClaims>): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: CfJwtClaims = {
    email: "e2e@test.local",
    name: "E2E Test User",
    sub: "e2e-sub-001",
    aud: ["e2e-audience"],
    iss: "https://e2e.cloudflareaccess.com",
    iat: now,
    exp: now + 3600,
    ...overrides,
  };

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify(claims));
  // Empty signature — CF edge validation is not present in E2E environment
  return `${header}.${payload}.`;
}

export interface PlaywrightCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Lax" | "Strict" | "None";
}

export function buildCfAuthorizationCookie(
  overrides?: Partial<CfJwtClaims>,
): PlaywrightCookie {
  return {
    name: "CF_Authorization",
    value: buildCfJwt(overrides),
    domain: "localhost",
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
  };
}
