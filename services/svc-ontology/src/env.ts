export interface Env {
  // D1 database for ontology term records and SKOS concept metadata
  DB_ONTOLOGY: D1Database;

  // Service bindings
  SECURITY: Fetcher;
  LLM_ROUTER: Fetcher;

  // Queue producer for pipeline events
  QUEUE_PIPELINE: Queue;

  // Vars
  ENVIRONMENT: string;
  SERVICE_NAME: string;

  // Secrets (set via `wrangler secret put`)
  INTERNAL_API_SECRET: string;
  NEO4J_URI: string;
  NEO4J_PASSWORD: string;
}
