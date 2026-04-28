/// <reference types="@cloudflare/workers-types" />

// F406: Workers Static Assets entry — SPA serving via [assets] binding.
// Migrated from Cloudflare Pages to resolve /cdn-cgi/access/* 404 (Pages asset
// serving intercepts CF Access callback paths, blocking login flow).

export interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  DEPLOY_ENV: string;
  INTERNAL_API_SECRET: string;
}

const ACCOUNT_SUBDOMAIN = "ktds-axbd";

function getGatewayUrl(deployEnv: string): string {
  if (deployEnv === "staging") return `https://recon-x-api-staging.${ACCOUNT_SUBDOMAIN}.workers.dev`;
  return `https://recon-x-api.${ACCOUNT_SUBDOMAIN}.workers.dev`;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Organization-Id, X-User-Id, X-User-Role",
  "Access-Control-Max-Age": "86400",
};

async function proxyToGateway(request: Request, url: URL, env: Env): Promise<Response> {
  const gatewayBase = getGatewayUrl(env.DEPLOY_ENV ?? "production");
  const targetUrl = `${gatewayBase}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  if (env.INTERNAL_API_SECRET) {
    headers.set("X-Internal-Secret", env.INTERNAL_API_SECRET);
  }
  headers.delete("host");

  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers,
    body: request.body,
    // @ts-expect-error — duplex required for streaming body but not in all type defs
    duplex: request.body ? "half" : undefined,
  });

  try {
    const response = await fetch(proxyRequest);
    const corsHeaders = new Headers(response.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) corsHeaders.set(k, v);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: corsHeaders,
    });
  } catch (err) {
    return Response.json(
      { success: false, error: "Gateway proxy error", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight — respond immediately before any routing
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // F407 Phase 9: bypass ASSETS for /cdn-cgi/* so Cloudflare edge (CF Access)
    // handles the path. Without this, SPA fallback would absorb Access 404s
    // into index.html 200, hiding login dispatcher outages from users.
    if (url.pathname.startsWith("/cdn-cgi/")) {
      return fetch(request);
    }

    // F409: proxy /api/* to Gateway Worker. Pages Functions (functions/api/[[path]].ts)
    // are inactive in Workers mode — this handler replaces that dead code path.
    if (url.pathname.startsWith("/api/")) {
      return proxyToGateway(request, url, env);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
