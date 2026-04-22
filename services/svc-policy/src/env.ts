export interface Env {
  // D1 database for policy candidates and HITL review records
  DB_POLICY: D1Database;

  // Service bindings
  SVC_EXTRACTION: Fetcher;

  // Queue producer for pipeline events
  QUEUE_PIPELINE: Queue;

  // Durable Object namespace for HITL session state
  HITL_SESSION: DurableObjectNamespace;

  // Vars
  ENVIRONMENT: string;
  SERVICE_NAME: string;

  // Secrets (set via `wrangler secret put`)
  INTERNAL_API_SECRET: string;             // inter-service auth (X-Internal-Secret)
  CLOUDFLARE_AI_GATEWAY_URL: string;       // full URL to OpenRouter chat-completions via CF AI Gateway
  OPENROUTER_API_KEY: string;              // OpenRouter bearer token
}
