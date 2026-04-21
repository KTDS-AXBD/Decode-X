/**
 * Pages Function — API Gateway Proxy
 *
 * Forwards all /api/* requests to the recon-x-api Gateway Worker.
 * The Gateway handles routing (service-based + resource-based),
 * JWT auth, CORS, and Service Bindings to downstream Workers.
 *
 * This function passes through X-Internal-Secret so the Gateway
 * can authenticate with downstream services. The Gateway also injects
 * its own secret, but we pass the Pages-level secret for the transition
 * period where the Gateway may not yet have all secrets configured.
 */

interface ProxyEnv {
  DEPLOY_ENV: string;
  INTERNAL_API_SECRET: string;
  DEMO_MODE?: string; // CI E2E only — never set in production/preview
}

const ACCOUNT_SUBDOMAIN = "ktds-axbd";

function getGatewayUrl(env: string): string {
  if (env === "staging") return `https://recon-x-api-staging.${ACCOUNT_SUBDOMAIN}.workers.dev`;
  return `https://recon-x-api.${ACCOUNT_SUBDOMAIN}.workers.dev`;
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

  // Demo mode: CI E2E bypass — DEMO_MODE env var + ?demo=1 param → stub user
  if (
    env.DEMO_MODE === "1" &&
    url.searchParams.get("demo") === "1" &&
    segments.join("/") === "auth/me"
  ) {
    return Response.json({ email: "e2e@test", role: "engineer", status: "active" });
  }

  const environment = env.DEPLOY_ENV ?? "production";
  const gatewayBase = getGatewayUrl(environment);

  // Forward full path: /api/documents/123/chunks → Gateway /api/documents/123/chunks
  const targetPath = `/api/${segments.join("/")}`;
  const url = new URL(request.url);
  const targetUrl = `${gatewayBase}${targetPath}${url.search}`;

  const headers = new Headers(request.headers);
  if (env.INTERNAL_API_SECRET) {
    headers.set("X-Internal-Secret", env.INTERNAL_API_SECRET);
  }
  headers.delete("host");

  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers,
    body: request.body,
    // @ts-expect-error -- duplex is required for streaming body but not in all type defs
    duplex: request.body ? "half" : undefined,
  });

  try {
    const response = await fetch(proxyRequest);

    const corsHeaders = new Headers(response.headers);
    corsHeaders.set("Access-Control-Allow-Origin", "*");
    corsHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    corsHeaders.set("Access-Control-Allow-Headers", "Content-Type, X-Organization-Id, X-User-Id, X-User-Role, Authorization");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: corsHeaders,
    });
  } catch (err) {
    return Response.json(
      {
        success: false,
        error: "Gateway proxy error",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
};
