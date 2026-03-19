/**
 * Pages Function — API Proxy for Working Mock-up
 *
 * Subset of app-web proxy, focused on demo endpoints:
 *   /api/policies/** → svc-policy
 *   /api/skills/**   → svc-skill
 *   /api/terms/**    → svc-ontology
 *   /api/graph/**    → svc-ontology
 *   /api/deliverables/** → svc-analytics
 *   /api/mcp/**      → svc-mcp-server
 */

interface ProxyEnv {
  DEPLOY_ENV: string;
  INTERNAL_API_SECRET: string;
}

const ROUTE_TABLE: Record<string, string> = {
  policies: "svc-policy",
  sessions: "svc-policy",
  skills: "svc-skill",
  terms: "svc-ontology",
  graph: "svc-ontology",
  deliverables: "svc-analytics",
  mcp: "svc-mcp-server",
};

const ACCOUNT_SUBDOMAIN = "ktds-axbd";

function getWorkerUrl(serviceName: string, env: string): string {
  const suffix = env === "production" ? "-production" : "-staging";
  return `https://${serviceName}${suffix}.${ACCOUNT_SUBDOMAIN}.workers.dev`;
}

export const onRequest: PagesFunction<ProxyEnv> = async (context) => {
  const { request, env } = context;

  const pathSegments = context.params["path"];
  if (!pathSegments) {
    return Response.json(
      { success: false, error: "Missing API path" },
      { status: 400 },
    );
  }
  const segments = Array.isArray(pathSegments) ? pathSegments : [pathSegments];
  const firstSegment = segments[0];
  if (!firstSegment) {
    return Response.json(
      { success: false, error: "Missing API path" },
      { status: 400 },
    );
  }

  const targetService = ROUTE_TABLE[firstSegment];
  if (!targetService) {
    return Response.json(
      { success: false, error: `Unknown API route: /api/${firstSegment}` },
      { status: 404 },
    );
  }

  const environment = env.DEPLOY_ENV ?? "production";
  const workerBaseUrl = getWorkerUrl(targetService, environment);
  const targetPath = `/${segments.join("/")}`;
  const url = new URL(request.url);
  const targetUrl = `${workerBaseUrl}${targetPath}${url.search}`;

  const headers = new Headers(request.headers);
  if (env.INTERNAL_API_SECRET) {
    headers.set("X-Internal-Secret", env.INTERNAL_API_SECRET);
  }
  headers.delete("host");

  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers,
    body: request.body,
    // @ts-expect-error -- duplex required for streaming body
    duplex: request.body ? "half" : undefined,
  });

  try {
    const response = await fetch(proxyRequest);
    const corsHeaders = new Headers(response.headers);
    corsHeaders.set("Access-Control-Allow-Origin", "*");
    corsHeaders.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    corsHeaders.set(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Organization-Id, X-User-Id, X-User-Role",
    );
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: corsHeaders,
    });
  } catch (err) {
    return Response.json(
      {
        success: false,
        error: "Proxy error",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
};
