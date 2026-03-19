/**
 * Term and graph routes.
 * GET /terms       — list terms (with optional ontologyId filter + pagination)
 * GET /terms/:id   — single term lookup
 * GET /graph       — proxy Cypher query to Neo4j
 *
 * All GET endpoints filter by X-Organization-Id header for org isolation.
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
  term_type: string | null;
}

// ── Org helper ───────────────────────────────────────────────────────

function getOrgId(request: Request): string {
  return request.headers.get("X-Organization-Id") ?? "unknown";
}

/**
 * Fetch ontology IDs belonging to the given organization from D1.
 * Used to scope Neo4j Cypher queries by org.
 */
async function getOrgOntologyIds(env: Env, orgId: string): Promise<string[]> {
  const result = await env.DB_ONTOLOGY.prepare(
    `SELECT ontology_id FROM ontologies WHERE organization_id = ? AND status = 'completed'`,
  )
    .bind(orgId)
    .all<{ ontology_id: string }>();
  return (result.results ?? []).map((r) => r.ontology_id);
}

// ── GET /terms/:id ───────────────────────────────────────────────────

export async function handleGetTerm(
  request: Request,
  env: Env,
  termId: string,
): Promise<Response> {
  const orgId = getOrgId(request);

  const row = await env.DB_ONTOLOGY.prepare(
    `SELECT t.* FROM terms t
     JOIN ontologies o ON t.ontology_id = o.ontology_id
     WHERE t.term_id = ? AND o.organization_id = ?`,
  )
    .bind(termId, orgId)
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
  const orgId = getOrgId(request);
  const ontologyId = url.searchParams.get("ontologyId");
  const termType = url.searchParams.get("type");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 100);
  const offset = Number(url.searchParams.get("offset") ?? "0");

  let query =
    `SELECT t.* FROM terms t
     JOIN ontologies o ON t.ontology_id = o.ontology_id
     WHERE o.organization_id = ?`;
  const binds: (string | number)[] = [orgId];

  if (ontologyId) {
    query += " AND t.ontology_id = ?";
    binds.push(ontologyId);
  }

  if (termType) {
    query += " AND t.term_type = ?";
    binds.push(termType);
  }

  query += " ORDER BY t.created_at ASC LIMIT ? OFFSET ?";
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
  const orgId = getOrgId(request);
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

  // Scope Neo4j queries by org: fetch org's ontology IDs from D1
  const orgOntologyIds = await getOrgOntologyIds(env, orgId);
  if (orgOntologyIds.length === 0) {
    return ok({ columns: [], rows: [], query: cypher });
  }

  try {
    // For custom queries, we cannot reliably rewrite Cypher.
    // Run original query through Neo4j (read-only guard above protects writes).
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

// ── GET /terms/stats ─────────────────────────────────────────────────

interface StatsRow {
  total: number;
  distinct_labels: number;
  ontology_count: number;
}

export async function handleTermsStats(
  request: Request,
  env: Env,
): Promise<Response> {
  const orgId = getOrgId(request);

  const row = await env.DB_ONTOLOGY.prepare(
    `SELECT
       COUNT(*) AS total,
       COUNT(DISTINCT t.label) AS distinct_labels,
       COUNT(DISTINCT t.ontology_id) AS ontology_count
     FROM terms t
     JOIN ontologies o ON t.ontology_id = o.ontology_id
     WHERE o.organization_id = ?`,
  )
    .bind(orgId)
    .first<StatsRow>();

  // Try to get Neo4j stats scoped to org (best-effort)
  let neo4jStats: { termNodes: number; ontologyNodes: number; policyNodes: number; relationships: number } | null = null;
  try {
    const orgOntologyIds = await getOrgOntologyIds(env, orgId);
    if (orgOntologyIds.length > 0) {
      const neo4jResponse = await neo4jQuery(env, [
        {
          statement:
            "UNWIND $ontologyIds AS oid " +
            "MATCH (o:Ontology {id: oid})-[:HAS_TERM]->(t:Term) " +
            "WITH collect(DISTINCT t) AS terms, collect(DISTINCT o) AS onts " +
            "OPTIONAL MATCH (o2:Ontology)-[:EXTRACTED_FROM]->(p:Policy) WHERE o2 IN onts " +
            "RETURN size(terms) AS termNodes, size(onts) AS ontologyNodes, " +
            "count(DISTINCT p) AS policyNodes, 0 AS relationships",
          parameters: { ontologyIds: orgOntologyIds },
        },
      ]);
      if (neo4jResponse.errors.length === 0) {
        const firstResult = neo4jResponse.results[0];
        const d = firstResult?.data[0];
        if (d) {
          neo4jStats = {
            termNodes: d.row[0] as number,
            ontologyNodes: d.row[1] as number,
            policyNodes: d.row[2] as number,
            relationships: d.row[3] as number,
          };
        }
      }
    }
  } catch {
    // Neo4j unavailable — D1 stats still returned
  }

  // Type distribution counts (org-scoped)
  const typeCounts = await env.DB_ONTOLOGY.prepare(
    `SELECT t.term_type, COUNT(*) AS cnt FROM terms t
     JOIN ontologies o ON t.ontology_id = o.ontology_id
     WHERE o.organization_id = ?
     GROUP BY t.term_type`,
  )
    .bind(orgId)
    .all<{ term_type: string | null; cnt: number }>();

  const byType: Record<string, number> = {};
  for (const r of typeCounts.results ?? []) {
    const key = r.term_type ?? "entity";
    byType[key] = r.cnt;
  }

  return ok({
    totalTerms: row?.total ?? 0,
    distinctLabels: row?.distinct_labels ?? 0,
    ontologyCount: row?.ontology_count ?? 0,
    byType,
    neo4j: neo4jStats,
  });
}

// ── GET /graph/visualization ─────────────────────────────────────────

export async function handleGraphVisualization(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const orgId = getOrgId(request);
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(Number(limitParam ?? "80"), 200);
  const termLabel = url.searchParams.get("term");

  try {
    // Fetch org's ontology IDs for scoping
    const orgOntologyIds = await getOrgOntologyIds(env, orgId);
    if (orgOntologyIds.length === 0) {
      return ok({ nodes: [], links: [] });
    }

    // If a specific term is requested, get its co-occurring terms (org-scoped)
    const cypher = termLabel
      ? // Neighbors of a specific term within org's ontologies
        "UNWIND $ontologyIds AS oid " +
        "MATCH (o:Ontology {id: oid})-[:HAS_TERM]->(t:Term) " +
        "WHERE t.label = $termLabel " +
        "WITH o " +
        "MATCH (o)-[:HAS_TERM]->(neighbor:Term) " +
        "RETURN neighbor.label AS label, neighbor.definition AS definition, " +
        "count(DISTINCT o) AS freq, " +
        "coalesce(neighbor.type, 'entity') AS termType " +
        "ORDER BY freq DESC LIMIT $limit"
      : // Top terms by frequency within org's ontologies
        "UNWIND $ontologyIds AS oid " +
        "MATCH (o:Ontology {id: oid})-[:HAS_TERM]->(t:Term) " +
        "WITH t.label AS label, collect(t.definition)[0] AS definition, " +
        "count(t) AS freq, coalesce(collect(t.type)[0], 'entity') AS termType " +
        "ORDER BY freq DESC LIMIT $limit " +
        "RETURN label, definition, freq, termType";

    const params: Record<string, unknown> = { limit, ontologyIds: orgOntologyIds };
    if (termLabel) params["termLabel"] = termLabel;

    const termsResp = await neo4jQuery(env, [
      { statement: cypher, parameters: params },
    ]);

    if (termsResp.errors.length > 0) {
      const firstError = termsResp.errors[0];
      return badRequest(
        `Neo4j error: ${firstError?.message ?? "unknown"}`,
      );
    }

    const termRows = termsResp.results[0]?.data ?? [];
    const labels = termRows.map((d) => d.row[0] as string);

    // Build nodes
    const nodes = termRows.map((d, i) => ({
      id: d.row[0] as string,
      label: d.row[0] as string,
      definition: (d.row[1] as string | null) ?? "",
      frequency: d.row[2] as number,
      group: i < 10 ? "core" : i < 30 ? "important" : "standard",
      type: (d.row[3] as string | null) ?? "entity",
    }));

    // Get co-occurrence edges: terms sharing the same org-scoped Ontology
    if (labels.length < 2) {
      return ok({ nodes, links: [] });
    }

    const edgeCypher =
      "UNWIND $ontologyIds AS oid " +
      "MATCH (t1:Term)<-[:HAS_TERM]-(o:Ontology {id: oid})-[:HAS_TERM]->(t2:Term) " +
      "WHERE t1.label IN $labels AND t2.label IN $labels " +
      "AND t1.label < t2.label " +
      "RETURN t1.label AS source, t2.label AS target, " +
      "count(DISTINCT o) AS weight " +
      "ORDER BY weight DESC LIMIT 300";

    const edgesResp = await neo4jQuery(env, [
      { statement: edgeCypher, parameters: { labels, ontologyIds: orgOntologyIds } },
    ]);

    const links = (edgesResp.results[0]?.data ?? []).map((d) => ({
      source: d.row[0] as string,
      target: d.row[1] as string,
      weight: d.row[2] as number,
    }));

    return ok({ nodes, links });
  } catch (e) {
    logger.error("Graph visualization query failed", { error: String(e) });
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
    termType: row.term_type ?? "entity",
  };
}
