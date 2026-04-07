import { Hono } from "hono";
import type { Context } from "hono";
import { RESOURCE_MAP, PREFIX_STRIP_MAP, type AppEnv } from "./env.js";
import { corsMiddleware } from "./middleware/cors.js";
import { authMiddleware } from "./middleware/auth.js";
import { guardMiddleware } from "./middleware/guard.js";
import { health } from "./routes/health.js";

const app = new Hono<AppEnv>();

// --- Global Middleware (order matters: CORS → Guard → Auth) ---
app.use("*", corsMiddleware);
app.use("*", guardMiddleware);
app.use("*", authMiddleware);

// --- Health (aggregated) ---
app.route("/", health);

// --- Shared proxy helper ---
function proxyToService(c: Context<AppEnv>, fetcher: Fetcher, downstreamPath: string) {
  const headers = new Headers(c.req.raw.headers);
  headers.set("X-Internal-Secret", c.env.INTERNAL_API_SECRET);

  const userId = c.get("userId") as string;
  const userRole = c.get("userRole") as string;
  const organizationId = c.get("organizationId") as string;
  if (userId) headers.set("X-User-Id", userId);
  if (userRole) headers.set("X-User-Role", userRole);
  if (organizationId) headers.set("X-Organization-Id", organizationId);

  const downstreamUrl = new URL(downstreamPath, "https://internal");
  downstreamUrl.search = new URL(c.req.url).search;

  const method = c.req.method;
  return fetcher.fetch(
    new Request(downstreamUrl.toString(), {
      method,
      headers,
      body: method !== "GET" && method !== "HEAD" ? c.req.raw.body : undefined,
    }),
  );
}

/**
 * Resolve the first segment after /api/ to a binding key + downstream path.
 *
 * 1. PREFIX_STRIP_MAP: strip prefix — /api/mcp/health → /health
 * 2. RESOURCE_MAP: preserve resource name — /api/documents/123 → /documents/123
 */
function resolveRoute(
  segment: string,
  fullPath: string,
): { bindingKey: keyof AppEnv["Bindings"]; downstreamPath: string } | null {
  // 1) Prefix-strip services (routes at root, e.g. svc-mcp-server)
  const stripBinding = PREFIX_STRIP_MAP[segment];
  if (stripBinding) {
    const downstream = fullPath.replace(`/api/${segment}`, "") || "/";
    return { bindingKey: stripBinding, downstreamPath: downstream };
  }

  // 2) Resource-based (most services — routes include resource name)
  const binding = RESOURCE_MAP[segment];
  if (!binding) return null;

  const downstream = fullPath.replace("/api", "") || "/";
  return { bindingKey: binding, downstreamPath: downstream };
}

// --- Service Proxy (with trailing path) ---
app.all("/api/:service/*", async (c) => {
  const segment = c.req.param("service") as string;
  const resolved = resolveRoute(segment, c.req.path);

  if (!resolved) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: `Unknown route: /api/${segment}` } },
      404,
    );
  }

  const fetcher = c.env[resolved.bindingKey] as Fetcher;
  return proxyToService(c, fetcher, resolved.downstreamPath);
});

// --- Catch /api/:service without trailing path ---
app.all("/api/:service", async (c) => {
  const segment = c.req.param("service") as string;
  const resolved = resolveRoute(segment, c.req.path);

  if (!resolved) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: `Unknown route: /api/${segment}` } },
      404,
    );
  }

  const fetcher = c.env[resolved.bindingKey] as Fetcher;
  return proxyToService(c, fetcher, resolved.downstreamPath);
});

// --- 404 Fallback ---
app.notFound((c) =>
  c.json({ success: false, error: { code: "NOT_FOUND", message: "Route not found" } }, 404),
);

export default app;
