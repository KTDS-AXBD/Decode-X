export interface Env {
  DB_GOVERNANCE: D1Database;
  KV_PROMPTS: KVNamespace;
  SECURITY: Fetcher;
  LLM_ROUTER: Fetcher;
  ENVIRONMENT: string;
  SERVICE_NAME: string;
  INTERNAL_API_SECRET: string;
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  GOOGLE_API_KEY: string;
  AI: Ai;
  // Service bindings for agent tools
  SVC_INGESTION: Fetcher;
  SVC_EXTRACTION: Fetcher;
  SVC_POLICY: Fetcher;
  SVC_SKILL: Fetcher;
  SVC_ONTOLOGY: Fetcher;
  SVC_ANALYTICS: Fetcher;
}
