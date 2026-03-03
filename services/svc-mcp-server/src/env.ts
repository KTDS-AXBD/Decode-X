export interface Env {
  // Service binding to svc-skill (MCP adapter + evaluate)
  SVC_SKILL: Fetcher;

  // Vars
  ENVIRONMENT: string;
  SERVICE_NAME: string;

  // Secrets (set via `wrangler secret put`)
  INTERNAL_API_SECRET: string;
}
