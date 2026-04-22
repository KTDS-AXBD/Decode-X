export interface Env {
  // D1 database for ontology term records and SKOS concept metadata
  DB_ONTOLOGY: D1Database;

  // Service bindings
  SVC_POLICY: Fetcher;

  // Queue producer for pipeline events
  QUEUE_PIPELINE: Queue;

  // Vars
  ENVIRONMENT: string;
  SERVICE_NAME: string;

  // Secrets (set via `wrangler secret put`)
  INTERNAL_API_SECRET: string;             // inter-service auth (X-Internal-Secret)
  CLOUDFLARE_AI_GATEWAY_URL: string;       // full URL to OpenRouter chat-completions via CF AI Gateway
  OPENROUTER_API_KEY: string;              // OpenRouter bearer token
  NEO4J_URI: string;       // HTTPS endpoint, e.g. "https://xxx.databases.neo4j.io:7474"
  NEO4J_USERNAME: string;  // Aura instance username
  NEO4J_PASSWORD: string;
  NEO4J_DATABASE: string;  // Aura database name (often same as instance ID)
}
