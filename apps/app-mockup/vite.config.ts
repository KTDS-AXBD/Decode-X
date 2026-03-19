import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const ACCOUNT = "ktds-axbd";

const SERVICE_MAP: Record<string, { service: string; port: number }> = {
  policies: { service: "svc-policy", port: 8703 },
  sessions: { service: "svc-policy", port: 8703 },
  skills: { service: "svc-skill", port: 8705 },
  terms: { service: "svc-ontology", port: 8704 },
  graph: { service: "svc-ontology", port: 8704 },
  deliverables: { service: "svc-analytics", port: 8710 },
  mcp: { service: "svc-mcp-server", port: 8711 },
  "pipeline-evaluations": { service: "svc-governance", port: 8708 },
};

function buildProxy(mode: string) {
  const proxy: Record<string, object> = {};
  if (mode === "remote") {
    proxy["/api"] = {
      target: "https://ai-foundry.minu.best",
      changeOrigin: true,
      secure: true,
    };
    return proxy;
  }
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
    port: 5174,
    proxy: buildProxy(process.env["DEV_PROXY"] ?? "local"),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
