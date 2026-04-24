/// <reference types="@cloudflare/workers-types" />

// F406: Workers Static Assets entry — SPA serving via [assets] binding.
// Migrated from Cloudflare Pages to resolve /cdn-cgi/access/* 404 (Pages asset
// serving intercepts CF Access callback paths, blocking login flow).

export interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  DEPLOY_ENV: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // F407 Phase 9: bypass ASSETS for /cdn-cgi/* so Cloudflare edge (CF Access)
    // handles the path. Without this, SPA fallback would absorb Access 404s
    // into index.html 200, hiding login dispatcher outages from users.
    const url = new URL(request.url);
    if (url.pathname.startsWith("/cdn-cgi/")) {
      return fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
