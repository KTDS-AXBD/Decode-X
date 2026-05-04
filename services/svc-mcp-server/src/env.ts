export interface Env {
  // Service binding to svc-skill (MCP adapter + evaluate)
  SVC_SKILL: Fetcher;
  // Service binding to svc-ontology (term lookup, used by org MCP meta-tools)
  SVC_ONTOLOGY?: Fetcher;

  // KV namespace for HITL agent session state (optional — degraded mode if unbound)
  // Create with: wrangler kv:namespace create AGENT_SESSIONS
  AGENT_SESSIONS?: KVNamespace;

  // Vars
  ENVIRONMENT: string;
  SERVICE_NAME: string;

  // Secrets (set via `wrangler secret put`)
  INTERNAL_API_SECRET: string;
}
