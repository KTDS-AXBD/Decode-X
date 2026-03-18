import { buildHeaders } from "./headers";

export interface Term {
  termId: string;
  ontologyId: string;
  label: string;
  definition?: string;
  skosUri: string;
  broaderTermId?: string;
  termType: string;
  createdAt: string;
}

export interface GraphNode {
  id: string;
  label: string;
  definition?: string;
  frequency: number;
  group: "core" | "important" | "standard";
  type: string;
}

export interface GraphLink {
  source: string;
  target: string;
  weight: number;
}

export async function fetchTerms(
  orgId: string,
  opts?: { type?: string; limit?: number; offset?: number },
): Promise<{ terms: Term[] }> {
  const params = new URLSearchParams();
  if (opts?.type) params.set("type", opts.type);
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  const res = await fetch(`/api/terms${qs ? `?${qs}` : ""}`, {
    headers: buildHeaders(orgId),
  });
  if (!res.ok) throw new Error(`Terms fetch failed: ${res.status}`);
  const json = (await res.json()) as { data: { terms: Term[] } };
  return json.data;
}

export async function fetchTermStats(
  orgId: string,
): Promise<{
  totalTerms: number;
  distinctLabels: number;
  ontologyCount: number;
  byType: Record<string, number>;
}> {
  const res = await fetch("/api/terms/stats", {
    headers: buildHeaders(orgId),
  });
  if (!res.ok) throw new Error(`Term stats failed: ${res.status}`);
  const json = (await res.json()) as {
    data: {
      totalTerms: number;
      distinctLabels: number;
      ontologyCount: number;
      byType: Record<string, number>;
    };
  };
  return json.data;
}

export async function fetchGraphVisualization(
  orgId: string,
  opts?: { limit?: number; term?: string },
): Promise<{ nodes: GraphNode[]; links: GraphLink[] }> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.term) params.set("term", opts.term);
  const qs = params.toString();
  const res = await fetch(`/api/graph/visualization${qs ? `?${qs}` : ""}`, {
    headers: buildHeaders(orgId),
  });
  if (!res.ok) throw new Error(`Graph fetch failed: ${res.status}`);
  const json = (await res.json()) as { data: { nodes: GraphNode[]; links: GraphLink[] } };
  return json.data;
}

export interface CypherResult {
  columns: string[];
  rows: unknown[][];
}

export async function fetchCypherQuery(
  orgId: string,
  query: string,
): Promise<CypherResult> {
  const params = new URLSearchParams();
  params.set("query", query);
  const res = await fetch(`/api/graph?${params.toString()}`, {
    headers: buildHeaders(orgId),
  });
  if (!res.ok) throw new Error(`Cypher query failed: ${res.status}`);
  return res.json() as Promise<CypherResult>;
}
