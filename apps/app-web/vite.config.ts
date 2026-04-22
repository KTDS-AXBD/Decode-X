import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

/**
 * Dev proxy — routes /api/* through the API Gateway or individual Workers.
 *
 * Modes (set via DEV_PROXY env var):
 *   DEV_PROXY=local    → proxy to individual wrangler dev ports (default)
 *   DEV_PROXY=gateway  → proxy to local Gateway Worker (port 8700)
 *   DEV_PROXY=remote   → proxy to deployed Pages (→ Gateway)
 */
const ACCOUNT = "ktds-axbd";
const GATEWAY_PORT = 8700;

const SERVICE_MAP: Record<string, { service: string; port: number }> = {
  documents: { service: "svc-ingestion", port: 8701 },
  extractions: { service: "svc-extraction", port: 8702 },
  extract: { service: "svc-extraction", port: 8702 },
  analysis: { service: "svc-extraction", port: 8702 },
  analyze: { service: "svc-extraction", port: 8702 },
  factcheck: { service: "svc-extraction", port: 8702 },
  specs: { service: "svc-extraction", port: 8702 },
  export: { service: "svc-extraction", port: 8702 },
  policies: { service: "svc-policy", port: 8703 },
  sessions: { service: "svc-policy", port: 8703 },
  terms: { service: "svc-ontology", port: 8704 },
  graph: { service: "svc-ontology", port: 8704 },
  normalize: { service: "svc-ontology", port: 8704 },
  skills: { service: "svc-skill", port: 8705 },
  // svc-security, svc-governance, svc-notification, svc-analytics → AI Foundry 포털로 이관 (Phase 5)
};

const DEPLOYED_ORIGIN = "https://rx.minu.best";
const GATEWAY_ORIGIN = `https://recon-x-api.${ACCOUNT}.workers.dev`;

function buildProxy(mode: string) {
  const proxy: Record<string, object> = {};

  // remote — proxy through deployed Pages (→ Gateway → Workers)
  if (mode === "remote") {
    proxy["/api/"] = {
      target: DEPLOYED_ORIGIN,
      changeOrigin: true,
      secure: true,
    };
    return proxy;
  }

  // gateway — proxy to local Gateway Worker (single entry point)
  if (mode === "gateway") {
    proxy["/api/"] = {
      target: `http://localhost:${String(GATEWAY_PORT)}`,
      changeOrigin: true,
    };
    return proxy;
  }

  // staging — proxy to deployed Gateway directly
  if (mode === "staging") {
    proxy["/api/"] = {
      target: GATEWAY_ORIGIN,
      changeOrigin: true,
      secure: true,
    };
    return proxy;
  }

  // local (default) — proxy to individual wrangler dev ports with path rewrite
  for (const [segment, { port }] of Object.entries(SERVICE_MAP)) {
    proxy[`/api/${segment}`] = {
      target: `http://localhost:${String(port)}`,
      rewrite: (p: string) => p.replace(/^\/api/, ""),
      changeOrigin: true,
    };
  }
  return proxy;
}

// F390/F404: CF Web Analytics token — real token via CF_BEACON_TOKEN env; strip beacon block when absent
const cfBeaconToken = process.env["CF_BEACON_TOKEN"] ?? "";
const BEACON_BLOCK_RE = /<!-- CF_BEACON_START -->[\s\S]*?<!-- CF_BEACON_END -->/;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "cf-beacon-token",
      transformIndexHtml(html) {
        if (!cfBeaconToken || cfBeaconToken === "PLACEHOLDER_DEV") {
          return html.replace(BEACON_BLOCK_RE, "<!-- CF Web Analytics disabled (no token) -->");
        }
        return html.replace("__CF_BEACON_TOKEN__", cfBeaconToken);
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: buildProxy(process.env["DEV_PROXY"] ?? "local"),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
