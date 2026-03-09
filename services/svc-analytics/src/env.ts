export interface Env {
  DB_ANALYTICS: D1Database;
  SECURITY: Fetcher;
  ENVIRONMENT: string;
  SERVICE_NAME: string;
  INTERNAL_API_SECRET: string;
  // Service bindings for deliverable export (AIF-REQ-017)
  SVC_POLICY: Fetcher;
  SVC_ONTOLOGY: Fetcher;
  SVC_EXTRACTION: Fetcher;
}
