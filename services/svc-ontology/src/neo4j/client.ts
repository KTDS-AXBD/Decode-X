/**
 * Neo4j HTTP Transaction API client.
 * Workers cannot use Bolt protocol — all queries go through the HTTP API.
 * NEO4J_URI example: "https://abc123.databases.neo4j.io"
 */

import type { Env } from "../env.js";

export interface Neo4jStatement {
  statement: string;
  parameters?: Record<string, unknown>;
}

export interface Neo4jResultRow {
  row: unknown[];
  meta: unknown[];
}

export interface Neo4jResult {
  columns: string[];
  data: Neo4jResultRow[];
}

export interface Neo4jError {
  code: string;
  message: string;
}

export interface Neo4jResponse {
  results: Neo4jResult[];
  errors: Neo4jError[];
}

/**
 * Execute one or more Cypher statements against Neo4j via HTTP Transaction API.
 * Throws on network errors or HTTP failures.
 * Returns the parsed Neo4j response (check .errors for query-level failures).
 */
export async function neo4jQuery(
  env: Env,
  statements: Neo4jStatement[],
): Promise<Neo4jResponse> {
  const auth = btoa(`neo4j:${env.NEO4J_PASSWORD}`);
  const url = `${env.NEO4J_URI}/db/neo4j/tx/commit`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json;charset=UTF-8",
    },
    body: JSON.stringify({ statements }),
  });

  if (!response.ok) {
    throw new Error(`Neo4j HTTP error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<Neo4jResponse>;
}
