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
  audit: { service: "svc-security", port: 8707 },
  cost: { service: "svc-governance", port: 8708 },
  trust: { service: "svc-governance", port: 8708 },
  prompts: { service: "svc-governance", port: 8708 },
  "golden-tests": { service: "svc-governance", port: 8708 },
  "quality-evaluations": { service: "svc-governance", port: 8708 },
  chat: { service: "svc-governance", port: 8708 },
  notifications: { service: "svc-notification", port: 8709 },
  kpi: { service: "svc-analytics", port: 8710 },
  dashboards: { service: "svc-analytics", port: 8710 },
  quality: { service: "svc-analytics", port: 8710 },
  reports: { service: "svc-analytics", port: 8710 },
  deliverables: { service: "svc-analytics", port: 8710 },
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

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
