/**
 * Term and graph routes.
 * GET /terms       — list terms (with optional ontologyId filter + pagination)
 * GET /terms/:id   — single term lookup
 * GET /graph       — proxy Cypher query to Neo4j
 */

import { createLogger, ok, notFound, badRequest, errFromUnknown } from "@ai-foundry/utils";
import { neo4jQuery } from "../neo4j/client.js";
import type { Env } from "../env.js";

const logger = createLogger("svc-ontology:terms");

interface TermRow {
  term_id: string;
  ontology_id: string;
  label: string;
  definition: string | null;
  skos_uri: string;
  broader_term_id: string | null;
  embedding_model: string | null;
  created_at: string;
}

// ── GET /terms/:id ───────────────────────────────────────────────────

export async function handleGetTerm(
  _request: Request,
  env: Env,
  termId: string,
): Promise<Response> {
  const row = await env.DB_ONTOLOGY.prepare(
    "SELECT * FROM terms WHERE term_id = ?",
  )
    .bind(termId)
    .first<TermRow>();

  if (!row) {
    return notFound("Term", termId);
  }

  return ok(formatTermRow(row));
}

// ── GET /terms ───────────────────────────────────────────────────────

export async function handleListTerms(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const ontologyId = url.searchParams.get("ontologyId");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 100);
  const offset = Number(url.searchParams.get("offset") ?? "0");

  let query = "SELECT * FROM terms WHERE 1=1";
  const binds: (string | number)[] = [];

  if (ontologyId) {
    query += " AND ontology_id = ?";
    binds.push(ontologyId);
  }

  query += " ORDER BY created_at ASC LIMIT ? OFFSET ?";
  binds.push(limit, offset);

  const result = await env.DB_ONTOLOGY.prepare(query).bind(...binds).all<TermRow>();

  const terms = (result.results ?? []).map(formatTermRow);
  return ok({ terms, limit, offset });
}

// ── GET /graph ───────────────────────────────────────────────────────

const DEFAULT_GRAPH_QUERY =
  "MATCH (t:Term)-[r]->(n) RETURN t, r, n LIMIT 100";

export async function handleGetGraph(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const customQuery = url.searchParams.get("query");
  const cypher = customQuery ?? DEFAULT_GRAPH_QUERY;

  // Basic guard: block obviously destructive Cypher keywords
  const upperCypher = cypher.toUpperCase();
  if (
    upperCypher.includes("DELETE") ||
    upperCypher.includes("DETACH") ||
    upperCypher.includes("DROP") ||
    upperCypher.includes("CREATE") ||
    upperCypher.includes("MERGE") ||
    upperCypher.includes("SET") ||
    upperCypher.includes("REMOVE")
  ) {
    return badRequest("Only read-only Cypher queries are allowed on /graph");
  }

  try {
    const neo4jResponse = await neo4jQuery(env, [{ statement: cypher }]);

    if (neo4jResponse.errors.length > 0) {
      const firstError = neo4jResponse.errors[0];
      logger.warn("Neo4j graph query error", { errors: neo4jResponse.errors });
      return badRequest(
        `Neo4j query error: ${firstError?.message ?? "unknown error"}`,
      );
    }

    const firstResult = neo4jResponse.results[0];
    return ok({
      columns: firstResult?.columns ?? [],
      rows: firstResult?.data.map((d) => d.row) ?? [],
      query: cypher,
    });
  } catch (e) {
    logger.error("Neo4j graph query failed", { error: String(e) });
    return errFromUnknown(e);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatTermRow(row: TermRow) {
  return {
    termId: row.term_id,
    ontologyId: row.ontology_id,
    label: row.label,
    definition: row.definition,
    skosUri: row.skos_uri,
    broaderTermId: row.broader_term_id,
    embeddingModel: row.embedding_model,
    createdAt: row.created_at,
  };
}
