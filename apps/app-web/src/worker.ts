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
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
