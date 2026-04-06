import { Hono } from "hono";
import { SERVICE_MAP, type AppEnv, type ServiceName } from "./env.js";
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

// --- Service Proxy ---
app.all("/api/:service/*", async (c) => {
  const serviceName = c.req.param("service") as string;
  const bindingKey = SERVICE_MAP[serviceName as ServiceName];

  if (!bindingKey) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: `Unknown service: ${serviceName}` } },
      404,
    );
  }

  const fetcher = c.env[bindingKey] as Fetcher;

  // /api/ingestion/documents → /documents
  const downstreamPath = c.req.path.replace(`/api/${serviceName}`, "") || "/";
  const downstreamUrl = new URL(downstreamPath, "https://internal");
  downstreamUrl.search = new URL(c.req.url).search;

  const headers = new Headers(c.req.raw.headers);
  headers.set("X-Internal-Secret", c.env.INTERNAL_API_SECRET);

  const userId = c.get("userId") as string;
  const userRole = c.get("userRole") as string;
  const organizationId = c.get("organizationId") as string;
  if (userId) headers.set("X-User-Id", userId);
  if (userRole) headers.set("X-User-Role", userRole);
  if (organizationId) headers.set("X-Organization-Id", organizationId);

  const method = c.req.method;
  const proxyReq = new Request(downstreamUrl.toString(), {
    method,
    headers,
    body: method !== "GET" && method !== "HEAD" ? c.req.raw.body : undefined,
  });

  return fetcher.fetch(proxyReq);
});

// --- Catch /api/:service without trailing path ---
app.all("/api/:service", async (c) => {
  const serviceName = c.req.param("service") as string;
  const bindingKey = SERVICE_MAP[serviceName as ServiceName];

  if (!bindingKey) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: `Unknown service: ${serviceName}` } },
      404,
    );
  }

  const fetcher = c.env[bindingKey] as Fetcher;
  const headers = new Headers(c.req.raw.headers);
  headers.set("X-Internal-Secret", c.env.INTERNAL_API_SECRET);

  const userId = c.get("userId") as string;
  const userRole = c.get("userRole") as string;
  const organizationId = c.get("organizationId") as string;
  if (userId) headers.set("X-User-Id", userId);
  if (userRole) headers.set("X-User-Role", userRole);
  if (organizationId) headers.set("X-Organization-Id", organizationId);

  const downstreamUrl = new URL("/", "https://internal");
  downstreamUrl.search = new URL(c.req.url).search;

  const method = c.req.method;
  return fetcher.fetch(
    new Request(downstreamUrl.toString(), {
      method,
      headers,
      body: method !== "GET" && method !== "HEAD" ? c.req.raw.body : undefined,
    }),
  );
});

// --- 404 Fallback ---
app.notFound((c) =>
  c.json({ success: false, error: { code: "NOT_FOUND", message: "Route not found" } }, 404),
);

export default app;
