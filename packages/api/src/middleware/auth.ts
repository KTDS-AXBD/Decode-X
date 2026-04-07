import type { Context, Next } from "hono";
import { jwtVerify } from "jose";
import type { AppEnv } from "../env.js";

interface JwtPayload {
  sub: string;
  role: string;
  org: string;
}

const PUBLIC_PATHS = ["/health", "/api/mcp"];

export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const path = c.req.path;

  if (PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"))) {
    return next();
  }

  // --- Auth Method 1: X-Internal-Secret (trusted caller — Pages Function, curl) ---
  const internalSecret = c.req.header("X-Internal-Secret");
  if (internalSecret && internalSecret === c.env.INTERNAL_API_SECRET) {
    // Trust forwarded identity headers from Pages Function
    c.set("userId", c.req.header("X-User-Id") ?? "anonymous");
    c.set("userRole", c.req.header("X-User-Role") ?? "Client");
    c.set("organizationId", c.req.header("X-Organization-Id") ?? "");
    return next();
  }

  // --- Auth Method 2: JWT Bearer token (direct client) ---
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Missing Bearer token or internal secret" } },
      401,
    );
  }

  const token = authHeader.slice(7);
  try {
    const secret = new TextEncoder().encode(c.env.GATEWAY_JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const jwt = payload as unknown as JwtPayload;

    c.set("userId", jwt.sub);
    c.set("userRole", jwt.role);
    c.set("organizationId", jwt.org);

    return next();
  } catch {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } },
      401,
    );
  }
}
