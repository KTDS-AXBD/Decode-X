export interface Env {
  // D1 database for Skill metadata and catalog records
  DB_SKILL: D1Database;

  // R2 bucket for .skill.json package storage
  R2_SKILL_PACKAGES: R2Bucket;

  // KV for caching MCP adapter projections
  KV_SKILL_CACHE: KVNamespace;

  // Queue producer for pipeline events
  QUEUE_PIPELINE: Queue;

  // External service URLs (HTTP, no service bindings)
  LLM_ROUTER_URL: string;
  FOUNDRY_X_URL: string;
  SVC_POLICY: Fetcher;
  SVC_ONTOLOGY: Fetcher;
  SVC_EXTRACTION: Fetcher;
  SVC_INGESTION: Fetcher;

  // Vars
  ENVIRONMENT: string;
  SERVICE_NAME: string;

  // Secrets (set via `wrangler secret put`)
  INTERNAL_API_SECRET: string;
  FOUNDRY_X_SECRET: string;

  // Optional secrets — LLM enhancement skipped if absent
  OPENROUTER_API_KEY?: string | undefined;
}
