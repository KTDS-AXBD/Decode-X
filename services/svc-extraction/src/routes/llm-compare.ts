/**
 * LLM Provider A/B Comparison — AIF-REQ-002
 *
 * POST /llm-compare  — Run extraction with two providers on the same document
 * GET  /llm-compare  — List comparisons for an organization
 * GET  /llm-compare/:id — Get specific comparison result
 */

import { ok, badRequest, notFound, createLogger } from "@ai-foundry/utils";
import type { LlmProvider } from "@ai-foundry/types";
import { callLlmWithMeta } from "../llm/caller.js";
import { buildExtractionPrompt } from "../prompts/structure.js";
import type { ChunkWithMeta } from "../queue/handler.js";
import type { Env } from "../env.js";

const logger = createLogger("llm-compare");

// ── Types ────────────────────────────────────────────────────────────

interface ExtractionResult {
  processes: Array<{ name: string; description: string; steps: string[] }>;
  entities: Array<{ name: string; type: string; attributes: string[] }>;
  relationships: Array<{ from: string; to: string; type: string }>;
  rules: Array<{ condition: string; outcome: string; domain: string }>;
}

interface ProviderResult {
  provider: string;
  model: string;
  durationMs: number;
  processCount: number;
  entityCount: number;
  relationshipCount: number;
  ruleCount: number;
  result: ExtractionResult;
  rawContentPreview?: string;
}

interface ComparisonMetrics {
  overlapEntities: number;
  overlapProcesses: number;
  jaccardEntities: number;
  jaccardProcesses: number;
  entityNamesA: string[];
  entityNamesB: string[];
  processNamesA: string[];
  processNamesB: string[];
}

// ── Route handler ────────────────────────────────────────────────────

export async function handleLlmCompareRoutes(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === "POST" && path === "/llm-compare") {
    return handleRunComparison(request, env);
  }

  if (method === "GET" && path === "/llm-compare") {
    return handleListComparisons(url, env);
  }

  const detailMatch = path.match(/^\/llm-compare\/([^/]+)$/);
  if (method === "GET" && detailMatch) {
    const id = detailMatch[1];
    if (!id) return notFound("comparison");
    return handleGetComparison(env, id);
  }

  return notFound("route");
}

// ── POST /llm-compare ────────────────────────────────────────────────

interface CompareBody {
  documentId: string;
  organizationId: string;
  providerA?: LlmProvider;
  providerB?: LlmProvider;
  tier?: "sonnet" | "haiku";
}

async function handleRunComparison(request: Request, env: Env): Promise<Response> {
  let body: CompareBody;
  try {
    body = (await request.json()) as CompareBody;
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const {
    documentId,
    organizationId,
    providerA = "anthropic" as LlmProvider,
    providerB = "openai" as LlmProvider,
    tier = "sonnet",
  } = body;

  if (!documentId || !organizationId) {
    return badRequest("documentId and organizationId are required");
  }

  // 1. Fetch chunks from svc-ingestion
  const chunks = await fetchChunks(env, documentId);
  if (!chunks || chunks.length === 0) {
    return badRequest(`No chunks found for document ${documentId}`);
  }

  // 2. Get classification from existing extraction (if any)
  const existingExtraction = await env.DB_EXTRACTION.prepare(
    "SELECT result_json FROM extractions WHERE document_id = ? AND status = 'completed' LIMIT 1",
  )
    .bind(documentId)
    .first<{ result_json: string | null }>();

  const classification = existingExtraction ? "general" : "general";

  // 3. Build prompt — limit chunks to reduce output size (avoid maxTokens truncation)
  const cappedChunks = chunks.slice(0, 12);
  const prompt = buildExtractionPrompt(cappedChunks, classification);

  // 4. Call both providers in parallel (avoid 30s Worker timeout)
  logger.info("Starting parallel extraction", { documentId, providerA, providerB, tier });
  const [resultA, resultB] = await Promise.all([
    runExtraction(prompt, tier, providerA, env),
    runExtraction(prompt, tier, providerB, env),
  ]);

  // 6. Compute comparison metrics
  const metrics = computeMetrics(resultA.result, resultB.result);

  // 7. Store in DB
  const comparisonId = crypto.randomUUID();
  await env.DB_EXTRACTION.prepare(
    `INSERT INTO extraction_comparisons
     (comparison_id, document_id, organization_id, classification, chunk_count,
      provider_a, model_a, result_a_json, process_count_a, entity_count_a, relationship_count_a, rule_count_a, duration_ms_a,
      provider_b, model_b, result_b_json, process_count_b, entity_count_b, relationship_count_b, rule_count_b, duration_ms_b,
      overlap_entities, overlap_processes, jaccard_entities, jaccard_processes, created_at)
     VALUES (?, ?, ?, ?, ?,  ?, ?, ?, ?, ?, ?, ?, ?,  ?, ?, ?, ?, ?, ?, ?, ?,  ?, ?, ?, ?, ?)`,
  )
    .bind(
      comparisonId, documentId, organizationId, classification, chunks.length,
      resultA.provider, resultA.model, JSON.stringify(resultA.result),
      resultA.processCount, resultA.entityCount, resultA.relationshipCount, resultA.ruleCount, resultA.durationMs,
      resultB.provider, resultB.model, JSON.stringify(resultB.result),
      resultB.processCount, resultB.entityCount, resultB.relationshipCount, resultB.ruleCount, resultB.durationMs,
      metrics.overlapEntities, metrics.overlapProcesses, metrics.jaccardEntities, metrics.jaccardProcesses,
      new Date().toISOString(),
    )
    .run();

  logger.info("Comparison complete", {
    comparisonId,
    documentId,
    providerA: resultA.provider,
    providerB: resultB.provider,
    jaccardEntities: metrics.jaccardEntities.toFixed(3),
    jaccardProcesses: metrics.jaccardProcesses.toFixed(3),
  });

  return ok({
    comparisonId,
    documentId,
    organizationId,
    chunkCount: chunks.length,
    providerA: {
      provider: resultA.provider,
      model: resultA.model,
      durationMs: resultA.durationMs,
      counts: {
        processes: resultA.processCount,
        entities: resultA.entityCount,
        relationships: resultA.relationshipCount,
        rules: resultA.ruleCount,
      },
      ...(resultA.rawContentPreview ? { rawContentPreview: resultA.rawContentPreview } : {}),
    },
    providerB: {
      provider: resultB.provider,
      model: resultB.model,
      durationMs: resultB.durationMs,
      counts: {
        processes: resultB.processCount,
        entities: resultB.entityCount,
        relationships: resultB.relationshipCount,
        rules: resultB.ruleCount,
      },
      ...(resultB.rawContentPreview ? { rawContentPreview: resultB.rawContentPreview } : {}),
    },
    metrics: {
      overlapEntities: metrics.overlapEntities,
      overlapProcesses: metrics.overlapProcesses,
      jaccardEntities: metrics.jaccardEntities,
      jaccardProcesses: metrics.jaccardProcesses,
      entityNamesOnlyA: metrics.entityNamesA.filter((n) => !metrics.entityNamesB.includes(n)),
      entityNamesOnlyB: metrics.entityNamesB.filter((n) => !metrics.entityNamesA.includes(n)),
    },
  });
}

// ── GET /llm-compare ─────────────────────────────────────────────────

async function handleListComparisons(url: URL, env: Env): Promise<Response> {
  const orgId = url.searchParams.get("organizationId");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  let query = `SELECT comparison_id, document_id, organization_id,
    provider_a, model_a, process_count_a, entity_count_a, duration_ms_a,
    provider_b, model_b, process_count_b, entity_count_b, duration_ms_b,
    jaccard_entities, jaccard_processes, created_at
    FROM extraction_comparisons`;

  const binds: string[] = [];
  if (orgId) {
    query += " WHERE organization_id = ?";
    binds.push(orgId);
  }
  query += " ORDER BY created_at DESC LIMIT ?";
  binds.push(String(limit));

  const stmt = env.DB_EXTRACTION.prepare(query);
  const { results } = await stmt.bind(...binds).all();

  return ok({ comparisons: results });
}

// ── GET /llm-compare/:id ─────────────────────────────────────────────

async function handleGetComparison(env: Env, comparisonId: string): Promise<Response> {
  const row = await env.DB_EXTRACTION.prepare(
    "SELECT * FROM extraction_comparisons WHERE comparison_id = ?",
  )
    .bind(comparisonId)
    .first<Record<string, unknown>>();

  if (!row) return notFound("comparison", comparisonId);

  // Parse JSON fields
  const resultA = row["result_a_json"] ? JSON.parse(row["result_a_json"] as string) as ExtractionResult : null;
  const resultB = row["result_b_json"] ? JSON.parse(row["result_b_json"] as string) as ExtractionResult : null;

  return ok({
    comparisonId: row["comparison_id"],
    documentId: row["document_id"],
    organizationId: row["organization_id"],
    classification: row["classification"],
    chunkCount: row["chunk_count"],
    providerA: {
      provider: row["provider_a"],
      model: row["model_a"],
      durationMs: row["duration_ms_a"],
      result: resultA,
      counts: {
        processes: row["process_count_a"],
        entities: row["entity_count_a"],
        relationships: row["relationship_count_a"],
        rules: row["rule_count_a"],
      },
    },
    providerB: {
      provider: row["provider_b"],
      model: row["model_b"],
      durationMs: row["duration_ms_b"],
      result: resultB,
      counts: {
        processes: row["process_count_b"],
        entities: row["entity_count_b"],
        relationships: row["relationship_count_b"],
        rules: row["rule_count_b"],
      },
    },
    metrics: {
      overlapEntities: row["overlap_entities"],
      overlapProcesses: row["overlap_processes"],
      jaccardEntities: row["jaccard_entities"],
      jaccardProcesses: row["jaccard_processes"],
    },
    createdAt: row["created_at"],
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

async function fetchChunks(env: Env, documentId: string): Promise<ChunkWithMeta[]> {
  const res = await env.SVC_INGESTION.fetch(
    new Request(`https://internal/documents/${documentId}/chunks`, {
      headers: { "X-Internal-Secret": env.INTERNAL_API_SECRET },
    }),
  );
  if (!res.ok) {
    logger.error("Failed to fetch chunks", { documentId, status: res.status });
    return [];
  }
  const json = (await res.json()) as { success: boolean; data: { chunks: ChunkWithMeta[] } };
  if (json.success && json.data) {
    return json.data.chunks;
  }
  // Try unwrapped format
  const raw = json as unknown as { chunks: ChunkWithMeta[] };
  return raw.chunks ?? [];
}

async function runExtraction(
  prompt: string,
  tier: "sonnet" | "haiku",
  provider: LlmProvider,
  env: Env,
): Promise<ProviderResult> {
  const start = Date.now();
  const meta = await callLlmWithMeta(prompt, tier, env.LLM_ROUTER, env.INTERNAL_API_SECRET, 8192, { provider });
  const durationMs = Date.now() - start;

  const parsed = parseExtractionJson(meta.content);

  const isEmpty = parsed.entities.length === 0 && parsed.processes.length === 0;

  if (isEmpty) {
    logger.warn("Extraction returned empty result", {
      provider: meta.provider,
      model: meta.model,
      rawContentLength: meta.content.length,
      rawContentHead: meta.content.slice(0, 300),
    });
  }

  return {
    provider: meta.provider,
    model: meta.model,
    durationMs,
    processCount: parsed.processes.length,
    entityCount: parsed.entities.length,
    relationshipCount: parsed.relationships.length,
    ruleCount: parsed.rules.length,
    result: parsed,
    // Include raw preview when result is empty (for debugging)
    ...(isEmpty ? { rawContentPreview: meta.content.slice(0, 500) } : {}),
  };
}

function parseExtractionJson(raw: string): ExtractionResult {
  const empty: ExtractionResult = { processes: [], entities: [], relationships: [], rules: [] };
  try {
    // Strip markdown code fences if present
    let cleaned = raw.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();

    // Attempt direct parse first
    try {
      const parsed = JSON.parse(cleaned) as Partial<ExtractionResult>;
      return toExtractionResult(parsed);
    } catch {
      // JSON might be truncated (e.g., Gemini hitting maxOutputTokens)
      // Try to repair by closing open brackets/braces
      cleaned = repairTruncatedJson(cleaned);
      const parsed = JSON.parse(cleaned) as Partial<ExtractionResult>;
      logger.info("Repaired truncated JSON successfully", { originalLength: raw.length });
      return toExtractionResult(parsed);
    }
  } catch {
    logger.warn("Failed to parse extraction JSON", { rawLength: raw.length, head: raw.slice(0, 200) });
    return empty;
  }
}

function toExtractionResult(parsed: Partial<ExtractionResult>): ExtractionResult {
  return {
    processes: Array.isArray(parsed.processes) ? parsed.processes : [],
    entities: Array.isArray(parsed.entities) ? parsed.entities : [],
    relationships: Array.isArray(parsed.relationships) ? parsed.relationships : [],
    rules: Array.isArray(parsed.rules) ? parsed.rules : [],
  };
}

/**
 * Attempt to repair truncated JSON by closing open brackets and braces.
 * Uses a stack to close in correct nesting order.
 */
function repairTruncatedJson(json: string): string {
  // Remove trailing incomplete string (cut mid-value)
  let s = json.replace(/,\s*"[^"]*$/, "").replace(/,\s*$/, "");

  // Track nesting with a stack for correct close order
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (const ch of s) {
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  // Close unclosed string
  if (inString) s += '"';

  // Close in reverse nesting order
  while (stack.length > 0) {
    s += stack.pop();
  }

  return s;
}

function computeMetrics(a: ExtractionResult, b: ExtractionResult): ComparisonMetrics {
  const entityNamesA = a.entities.map((e) => normalizeName(e.name));
  const entityNamesB = b.entities.map((e) => normalizeName(e.name));
  const processNamesA = a.processes.map((p) => normalizeName(p.name));
  const processNamesB = b.processes.map((p) => normalizeName(p.name));

  const overlapEntities = entityNamesA.filter((n) => entityNamesB.includes(n)).length;
  const overlapProcesses = processNamesA.filter((n) => processNamesB.includes(n)).length;

  return {
    overlapEntities,
    overlapProcesses,
    jaccardEntities: jaccard(new Set(entityNamesA), new Set(entityNamesB)),
    jaccardProcesses: jaccard(new Set(processNamesA), new Set(processNamesB)),
    entityNamesA,
    entityNamesB,
    processNamesA,
    processNamesB,
  };
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size > 0 ? intersection.size / union.size : 0;
}
