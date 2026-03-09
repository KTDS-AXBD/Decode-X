/**
 * Fact Check API Routes — svc-extraction (SVC-02) extension.
 *
 * POST /factcheck                          → Trigger fact check
 * GET  /factcheck/results                  → List results for org
 * GET  /factcheck/results/:resultId        → Single result detail
 * GET  /factcheck/results/:resultId/gaps   → Gaps with filters
 * GET  /factcheck/results/:resultId/report → Markdown report
 * POST /factcheck/gaps/:gapId/review       → Review a gap
 * POST /factcheck/results/:resultId/llm-match → LLM matching (placeholder)
 * GET  /factcheck/summary                  → Org-level coverage KPI
 *
 * Part of v0.7.4 Pivot Phase 2-B Session 3.
 */

import { ok, badRequest, notFound } from "@ai-foundry/utils";
import type { Env } from "../env.js";
import { generateFactCheckReport } from "../factcheck/report.js";
import { llmSemanticMatch } from "../factcheck/llm-matcher.js";
import { aggregateSourceSpec } from "../factcheck/source-aggregator.js";
import { extractDocSpec } from "../factcheck/doc-spec-extractor.js";
import { structuralMatch } from "../factcheck/matcher.js";
import type { MatchResult } from "../factcheck/matcher.js";
import type { SourceApi, SourceTable } from "../factcheck/types.js";
import type { FactCheckGap } from "@ai-foundry/types";
import { buildDomainSummary, categorizeGapDomain, type GapDomain } from "../factcheck/gap-categorizer.js";
import type { NoiseStats } from "../factcheck/gap-detector.js";
import type { ReportInput } from "../factcheck/report.js";

// ── D1 row types ──────────────────────────────────────────────────

interface ResultRow {
  result_id: string;
  organization_id: string;
  spec_type: string;
  source_document_ids: string | null;
  doc_document_ids: string | null;
  total_source_items: number;
  total_doc_items: number;
  matched_items: number;
  gap_count: number;
  coverage_pct: number;
  gaps_by_type: string | null;
  gaps_by_severity: string | null;
  status: string;
  match_result_json: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string | null;
}

interface GapRow {
  gap_id: string;
  result_id: string;
  organization_id: string;
  gap_type: string;
  severity: string;
  source_item: string;
  source_document_id: string | null;
  document_item: string | null;
  document_id: string | null;
  description: string;
  evidence: string | null;
  auto_resolved: number;
  review_status: string;
  reviewer_id: string | null;
  reviewer_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
}

// ── Row → API object converters ───────────────────────────────────

function resultRowToApi(row: ResultRow) {
  return {
    resultId: row.result_id,
    organizationId: row.organization_id,
    specType: row.spec_type,
    sourceDocumentIds: safeParseJsonArray(row.source_document_ids),
    docDocumentIds: safeParseJsonArray(row.doc_document_ids),
    totalSourceItems: row.total_source_items,
    totalDocItems: row.total_doc_items,
    matchedItems: row.matched_items,
    gapCount: row.gap_count,
    coveragePct: row.coverage_pct,
    gapsByType: safeParseJsonRecord(row.gaps_by_type),
    gapsBySeverity: safeParseJsonRecord(row.gaps_by_severity),
    status: row.status,
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
    createdAt: row.created_at,
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  };
}

function gapRowToApi(row: GapRow): FactCheckGap {
  return {
    gapId: row.gap_id,
    resultId: row.result_id,
    organizationId: row.organization_id,
    gapType: row.gap_type as FactCheckGap["gapType"],
    severity: row.severity as FactCheckGap["severity"],
    sourceItem: row.source_item,
    ...(row.source_document_id ? { sourceDocumentId: row.source_document_id } : {}),
    ...(row.document_item ? { documentItem: row.document_item } : {}),
    ...(row.document_id ? { documentId: row.document_id } : {}),
    description: row.description,
    ...(row.evidence ? { evidence: row.evidence } : {}),
    autoResolved: row.auto_resolved === 1,
    reviewStatus: row.review_status as FactCheckGap["reviewStatus"],
    ...(row.reviewer_id ? { reviewerId: row.reviewer_id } : {}),
    ...(row.reviewer_comment ? { reviewerComment: row.reviewer_comment } : {}),
    ...(row.reviewed_at ? { reviewedAt: row.reviewed_at } : {}),
    createdAt: row.created_at,
  };
}

// ── JSON helpers ──────────────────────────────────────────────────

function safeParseJsonArray(val: string | null): string[] {
  if (!val) return [];
  try {
    return JSON.parse(val) as string[];
  } catch {
    return [];
  }
}

function safeParseJsonRecord(val: string | null): Record<string, number> {
  if (!val) return {};
  try {
    return JSON.parse(val) as Record<string, number>;
  } catch {
    return {};
  }
}

// ── Main route handler ────────────────────────────────────────────

export async function handleFactcheckRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  path: string,
  method: string,
  url: URL,
): Promise<Response | null> {

  // POST /factcheck — trigger fact check
  if (method === "POST" && path === "/factcheck") {
    return handleTriggerFactCheck(request, env);
  }

  // GET /factcheck/kpi — automated KPI metrics (PRD SS8.2)
  if (method === "GET" && path === "/factcheck/kpi") {
    return handleGetKpi(request, env);
  }

  // GET /factcheck/summary — org-level KPI
  if (method === "GET" && path === "/factcheck/summary") {
    return handleGetSummary(request, env);
  }

  // GET /factcheck/domain-summary — domain-level gap breakdown
  if (method === "GET" && path === "/factcheck/domain-summary") {
    return handleGetDomainSummary(request, env);
  }

  // GET /factcheck/trend — coverage trend over time
  if (method === "GET" && path === "/factcheck/trend") {
    return handleGetTrend(request, env);
  }

  // GET /factcheck/document-suggestions — prioritized document suggestions
  if (method === "GET" && path === "/factcheck/document-suggestions") {
    return handleGetDocumentSuggestions(request, env);
  }

  // GET /factcheck/results — list results
  if (method === "GET" && path === "/factcheck/results") {
    return handleListResults(request, env);
  }

  // GET /factcheck/results/:resultId/gaps
  const gapsMatch = path.match(/^\/factcheck\/results\/([^/]+)\/gaps$/);
  if (method === "GET" && gapsMatch) {
    const resultId = gapsMatch[1];
    if (!resultId) return notFound("result");
    return handleGetGaps(env, resultId, url);
  }

  // GET /factcheck/results/:resultId/report
  const reportMatch = path.match(/^\/factcheck\/results\/([^/]+)\/report$/);
  if (method === "GET" && reportMatch) {
    const resultId = reportMatch[1];
    if (!resultId) return notFound("result");
    return handleGetReport(env, resultId);
  }

  // POST /factcheck/results/:resultId/llm-match
  const llmMatch = path.match(/^\/factcheck\/results\/([^/]+)\/llm-match$/);
  if (method === "POST" && llmMatch) {
    const resultId = llmMatch[1];
    if (!resultId) return notFound("result");
    return handleLlmMatch(env, resultId, request);
  }

  // GET /factcheck/results/:resultId — single result
  const resultDetailMatch = path.match(/^\/factcheck\/results\/([^/]+)$/);
  if (method === "GET" && resultDetailMatch) {
    const resultId = resultDetailMatch[1];
    if (!resultId) return notFound("result");
    return handleGetResult(env, resultId);
  }

  // POST /factcheck/gaps/:gapId/review
  const reviewMatch = path.match(/^\/factcheck\/gaps\/([^/]+)\/review$/);
  if (method === "POST" && reviewMatch) {
    const gapId = reviewMatch[1];
    if (!gapId) return notFound("gap");
    return handleReviewGap(request, env, gapId);
  }

  // POST /factcheck/results/:resultId/dedup-gaps — remove duplicate gaps
  const dedupMatch = path.match(/^\/factcheck\/results\/([^/]+)\/dedup-gaps$/);
  if (method === "POST" && dedupMatch) {
    const resultId = dedupMatch[1];
    if (!resultId) return notFound("result");
    return handleDedupGaps(env, resultId);
  }

  // No matching factcheck route
  return null;
}

// ── POST /factcheck ───────────────────────────────────────────────

interface TriggerBody {
  organizationId: string;
  specType?: "api" | "table" | "mixed";
}

async function handleTriggerFactCheck(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: TriggerBody;
  try {
    body = (await request.json()) as TriggerBody;
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const { organizationId } = body;
  if (!organizationId || typeof organizationId !== "string") {
    return badRequest("organizationId is required");
  }

  const specType = body.specType ?? "mixed";
  if (!["api", "table", "mixed"].includes(specType)) {
    return badRequest("specType must be api | table | mixed");
  }

  const resultId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Create result record in D1
  await env.DB_EXTRACTION.prepare(
    `INSERT INTO fact_check_results
     (result_id, organization_id, spec_type, source_document_ids, doc_document_ids,
      total_source_items, total_doc_items, matched_items, gap_count, coverage_pct,
      status, created_at, updated_at)
     VALUES (?, ?, ?, '[]', '[]', 0, 0, 0, 0, 0, 'processing', ?, ?)`,
  )
    .bind(resultId, organizationId, specType, now, now)
    .run();

  // Queue factcheck.requested event
  await env.QUEUE_PIPELINE.send({
    eventId: crypto.randomUUID(),
    occurredAt: now,
    type: "factcheck.requested",
    payload: {
      resultId,
      organizationId,
      specType,
    },
  });

  return ok({ resultId, status: "processing" });
}

// ── GET /factcheck/results ────────────────────────────────────────

async function handleListResults(
  request: Request,
  env: Env,
): Promise<Response> {
  const organizationId = request.headers.get("X-Organization-Id");
  if (!organizationId) {
    return badRequest("X-Organization-Id header is required");
  }

  const { results } = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM fact_check_results
     WHERE organization_id = ?
     ORDER BY created_at DESC`,
  )
    .bind(organizationId)
    .all<ResultRow>();

  return ok({ results: results.map(resultRowToApi) });
}

// ── GET /factcheck/results/:resultId ──────────────────────────────

async function handleGetResult(
  env: Env,
  resultId: string,
): Promise<Response> {
  const row = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM fact_check_results WHERE result_id = ?`,
  )
    .bind(resultId)
    .first<ResultRow>();

  if (!row) {
    return notFound("result", resultId);
  }

  return ok(resultRowToApi(row));
}

// ── GET /factcheck/results/:resultId/gaps ─────────────────────────

async function handleGetGaps(
  env: Env,
  resultId: string,
  url: URL,
): Promise<Response> {
  // Verify result exists
  const resultRow = await env.DB_EXTRACTION.prepare(
    `SELECT result_id FROM fact_check_results WHERE result_id = ?`,
  )
    .bind(resultId)
    .first<{ result_id: string }>();

  if (!resultRow) {
    return notFound("result", resultId);
  }

  // Build filtered query
  const conditions: string[] = ["result_id = ?"];
  const bindings: (string | number)[] = [resultId];

  const typeFilter = url.searchParams.get("type");
  if (typeFilter) {
    conditions.push("gap_type = ?");
    bindings.push(typeFilter);
  }

  const severityFilter = url.searchParams.get("severity");
  if (severityFilter) {
    conditions.push("severity = ?");
    bindings.push(severityFilter);
  }

  const reviewStatusFilter = url.searchParams.get("reviewStatus");
  if (reviewStatusFilter) {
    conditions.push("review_status = ?");
    bindings.push(reviewStatusFilter);
  }

  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
  const offset = Number(url.searchParams.get("offset")) || 0;

  const whereClause = conditions.join(" AND ");

  // Count query
  const countRow = await env.DB_EXTRACTION.prepare(
    `SELECT COUNT(*) AS total FROM fact_check_gaps WHERE ${whereClause}`,
  )
    .bind(...bindings)
    .first<{ total: number }>();

  const total = countRow?.total ?? 0;

  // Data query
  const { results } = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM fact_check_gaps
     WHERE ${whereClause}
     ORDER BY CASE severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
              created_at ASC
     LIMIT ? OFFSET ?`,
  )
    .bind(...bindings, limit, offset)
    .all<GapRow>();

  return ok({
    gaps: results.map(gapRowToApi),
    total,
    limit,
    offset,
  });
}

// ── GET /factcheck/results/:resultId/report ───────────────────────

async function handleGetReport(
  env: Env,
  resultId: string,
): Promise<Response> {
  // Fetch result
  const resultRow = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM fact_check_results WHERE result_id = ?`,
  )
    .bind(resultId)
    .first<ResultRow>();

  if (!resultRow) {
    return notFound("result", resultId);
  }

  // Fetch all gaps for this result
  const { results: gapRows } = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM fact_check_gaps WHERE result_id = ?
     ORDER BY CASE severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
              created_at ASC`,
  )
    .bind(resultId)
    .all<GapRow>();

  const gaps: FactCheckGap[] = gapRows.map(gapRowToApi);

  // Extract noiseStats from match_result_json if available
  let noiseStats: NoiseStats | undefined;
  try {
    const matchData = JSON.parse(resultRow.match_result_json ?? "{}") as Record<string, unknown>;
    if (matchData["noiseStats"]) {
      noiseStats = matchData["noiseStats"] as NoiseStats;
    }
  } catch { /* ignore parse errors */ }

  const reportInput: ReportInput = {
    resultId,
    organizationId: resultRow.organization_id,
    totalSourceItems: resultRow.total_source_items,
    totalDocItems: resultRow.total_doc_items,
    matchedItems: resultRow.matched_items,
    gapCount: resultRow.gap_count,
    coveragePct: resultRow.coverage_pct,
    gapsByType: safeParseJsonRecord(resultRow.gaps_by_type),
    gapsBySeverity: safeParseJsonRecord(resultRow.gaps_by_severity),
    gaps,
  };
  if (noiseStats) {
    reportInput.noiseStats = noiseStats;
  }

  const markdown = generateFactCheckReport(reportInput);

  return new Response(markdown, {
    status: 200,
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

// ── POST /factcheck/gaps/:gapId/review ────────────────────────────

interface ReviewBody {
  reviewStatus: "confirmed" | "dismissed" | "modified";
  reviewerId: string;
  comment?: string;
}

async function handleReviewGap(
  request: Request,
  env: Env,
  gapId: string,
): Promise<Response> {
  let body: ReviewBody;
  try {
    body = (await request.json()) as ReviewBody;
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const { reviewStatus, reviewerId, comment } = body;

  if (!reviewStatus || !["confirmed", "dismissed", "modified"].includes(reviewStatus)) {
    return badRequest("reviewStatus must be confirmed | dismissed | modified");
  }
  if (!reviewerId || typeof reviewerId !== "string") {
    return badRequest("reviewerId is required");
  }

  const reviewedAt = new Date().toISOString();

  const result = await env.DB_EXTRACTION.prepare(
    `UPDATE fact_check_gaps
     SET review_status = ?, reviewer_id = ?, reviewer_comment = ?, reviewed_at = ?
     WHERE gap_id = ?`,
  )
    .bind(reviewStatus, reviewerId, comment ?? null, reviewedAt, gapId)
    .run();

  if (result.meta.rows_written === 0) {
    return notFound("gap", gapId);
  }

  return ok({ gapId, reviewStatus, reviewedAt });
}

// ── POST /factcheck/results/:resultId/llm-match ──────────────────

interface LlmMatchBody {
  batchSize?: number;
  offset?: number;
}

async function handleLlmMatch(
  env: Env,
  resultId: string,
  request: Request,
): Promise<Response> {
  // Parse optional batch params from body
  let batchSize = 10;
  let offset = 0;
  try {
    const body = (await request.json()) as LlmMatchBody;
    if (body.batchSize && body.batchSize > 0) batchSize = Math.min(body.batchSize, 50);
    if (body.offset && body.offset >= 0) offset = body.offset;
  } catch {
    // Empty body is fine — use defaults
  }

  // Verify result exists and is completed
  const resultRow = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM fact_check_results WHERE result_id = ?`,
  )
    .bind(resultId)
    .first<ResultRow>();

  if (!resultRow) {
    return notFound("result", resultId);
  }

  if (resultRow.status !== "completed") {
    return badRequest("Fact check must be completed before running LLM matching");
  }

  const organizationId = resultRow.organization_id;

  // Re-aggregate source and doc specs
  const sourceSpec = await aggregateSourceSpec(env, organizationId);
  const docSpec = await extractDocSpec(env, organizationId);

  // Re-run structural matching to get unmatched items
  const matchResult = structuralMatch(sourceSpec, docSpec);

  // Collect all unmatched items into a flat list for pagination
  const allUnmatched: Array<{ type: "api" | "table"; item: unknown }> = [
    ...matchResult.unmatchedSourceApis.map((a) => ({ type: "api" as const, item: a })),
    ...matchResult.unmatchedSourceTables.map((t) => ({ type: "table" as const, item: t })),
  ];

  const total = allUnmatched.length;
  const batch = allUnmatched.slice(offset, offset + batchSize);

  if (batch.length === 0) {
    return ok({
      resultId,
      llmMatching: { processed: 0, newMatches: 0, confirmedGaps: 0, errors: 0 },
      pagination: { offset, batchSize, total, hasMore: false },
      newMatches: [],
      confirmedGaps: [],
    });
  }

  // Build sliced MatchResult for batch processing
  const batchMatchResult: MatchResult = {
    matchedItems: [],
    unmatchedSourceApis: batch
      .filter((b) => b.type === "api")
      .map((b) => b.item as SourceApi),
    unmatchedDocApis: [],
    unmatchedSourceTables: batch
      .filter((b) => b.type === "table")
      .map((b) => b.item as SourceTable),
    unmatchedDocTables: [],
  };

  // Run LLM semantic matching on this batch
  const llmResult = await llmSemanticMatch(
    batchMatchResult,
    docSpec,
    env.LLM_ROUTER,
    env.INTERNAL_API_SECRET,
  );

  const now = new Date().toISOString();

  // Mark resolved gaps as auto_resolved in D1
  // source_item is stored as JSON (e.g. {"path":"/foo","method":["POST"],...})
  // so we match using LIKE on the path value
  if (llmResult.newMatches.length > 0) {
    for (const match of llmResult.newMatches) {
      const docName = match.docRef?.name ?? "unknown";
      const pathPattern = `%"path":"${match.sourceRef.name}"%`;
      await env.DB_EXTRACTION.prepare(
        `UPDATE fact_check_gaps
         SET auto_resolved = 1, review_status = 'dismissed',
             reviewer_comment = ?, reviewed_at = ?
         WHERE result_id = ? AND source_item LIKE ? AND gap_type = 'MID'
           AND auto_resolved = 0`,
      )
        .bind(
          `LLM match: ${docName} (score: ${match.matchScore})`,
          now,
          resultId,
          pathPattern,
        )
        .run();
    }

    // Recalculate totals from D1
    const statsRow = await env.DB_EXTRACTION.prepare(
      `SELECT
         COUNT(*) AS gap_count,
         SUM(CASE WHEN auto_resolved = 0 THEN 1 ELSE 0 END) AS active_gaps
       FROM fact_check_gaps WHERE result_id = ?`,
    )
      .bind(resultId)
      .first<{ gap_count: number; active_gaps: number }>();

    const newMatchedCount = resultRow.matched_items + llmResult.newMatches.length;
    const totalSourceItems = resultRow.total_source_items;
    const newCoverage = totalSourceItems > 0
      ? (newMatchedCount / totalSourceItems) * 100
      : 0;

    // Update match_result_json to include LLM matches (for KPI API/Table split)
    let updatedMatchJson = resultRow.match_result_json;
    if (resultRow.match_result_json) {
      try {
        const cached = JSON.parse(resultRow.match_result_json) as {
          matchedItems: unknown[];
          unmatchedSourceApis: number;
          unmatchedDocApis: number;
          unmatchedSourceTables: number;
          unmatchedDocTables: number;
        };
        // Add LLM matches and decrement unmatched counts
        cached.matchedItems = [...cached.matchedItems, ...llmResult.newMatches];
        let apiDelta = 0;
        let tableDelta = 0;
        for (const m of llmResult.newMatches) {
          if (m.sourceRef.type === "table") tableDelta++;
          else apiDelta++;
        }
        cached.unmatchedSourceApis = Math.max(0, cached.unmatchedSourceApis - apiDelta);
        cached.unmatchedSourceTables = Math.max(0, cached.unmatchedSourceTables - tableDelta);
        updatedMatchJson = JSON.stringify(cached);
      } catch {
        // Keep original if parse fails
      }
    }

    await env.DB_EXTRACTION.prepare(
      `UPDATE fact_check_results
       SET matched_items = ?, coverage_pct = ?, gap_count = ?,
           match_result_json = ?, updated_at = ?
       WHERE result_id = ?`,
    )
      .bind(
        newMatchedCount,
        Math.round(newCoverage * 10) / 10,
        statsRow?.active_gaps ?? resultRow.gap_count,
        updatedMatchJson,
        now,
        resultId,
      )
      .run();
  }

  const hasMore = offset + batchSize < total;

  return ok({
    resultId,
    llmMatching: {
      processed: llmResult.stats.processed,
      newMatches: llmResult.stats.matched,
      confirmedGaps: llmResult.stats.confirmed,
      errors: llmResult.stats.errors,
    },
    pagination: { offset, batchSize, total, hasMore },
    newMatches: llmResult.newMatches,
    confirmedGaps: llmResult.confirmedGaps,
  });
}

// ── POST /factcheck/results/:resultId/dedup-gaps ──────────────────

async function handleDedupGaps(
  env: Env,
  resultId: string,
): Promise<Response> {
  // Count before
  const beforeRow = await env.DB_EXTRACTION.prepare(
    `SELECT COUNT(*) AS cnt FROM fact_check_gaps WHERE result_id = ?`,
  )
    .bind(resultId)
    .first<{ cnt: number }>();

  const before = beforeRow?.cnt ?? 0;

  // Delete duplicate gaps keeping only the earliest per (result_id, gap_type, source_item)
  await env.DB_EXTRACTION.prepare(
    `DELETE FROM fact_check_gaps
     WHERE rowid NOT IN (
       SELECT MIN(rowid) FROM fact_check_gaps
       WHERE result_id = ?
       GROUP BY result_id, gap_type, source_item, document_item
     ) AND result_id = ?`,
  )
    .bind(resultId, resultId)
    .run();

  // Count after
  const afterRow = await env.DB_EXTRACTION.prepare(
    `SELECT COUNT(*) AS cnt FROM fact_check_gaps WHERE result_id = ?`,
  )
    .bind(resultId)
    .first<{ cnt: number }>();

  const after = afterRow?.cnt ?? 0;

  // Update result gap_count
  await env.DB_EXTRACTION.prepare(
    `UPDATE fact_check_results SET gap_count = ?, updated_at = ? WHERE result_id = ?`,
  )
    .bind(after, new Date().toISOString(), resultId)
    .run();

  return ok({
    resultId,
    before,
    after,
    removed: before - after,
  });
}

// ── GET /factcheck/kpi ────────────────────────────────────────────

/** Empty KPI response matching frontend FactCheckKpi flat interface. */
function emptyKpi(): Record<string, unknown> {
  return {
    apiCoverage: 0, apiCoverageTarget: 80, apiCoveragePass: false,
    tableCoverage: 0, tableCoverageTarget: 80, tableCoveragePass: false,
    apiDocCompleteness: 0, tableDocCompleteness: 0,
    gapPrecision: 0, gapPrecisionTarget: 75, gapPrecisionPass: false,
    reviewerAcceptance: 0, reviewerAcceptanceTarget: 70, reviewerAcceptancePass: false,
    specEditTimeReduction: 0, specEditTimeReductionTarget: 30, specEditTimeReductionPass: false,
    apiDetail: { sourceApis: 0, documentApis: 0, matchedApis: 0 },
    tableDetail: { sourceTables: 0, documentTables: 0, matchedTables: 0 },
    gapDetail: { totalGaps: 0, confirmedGaps: 0, dismissedGaps: 0, pendingGaps: 0 },
    computedAt: new Date().toISOString(),
  };
}

/**
 * Parse match_result_json to split API vs Table matched counts.
 * Returns { apiMatched, tableMatched, unmatchedSourceApis/Tables, unmatchedDocApis/Tables }.
 */
export function parseMatchResultForKpi(
  json: string | null,
  fallbackMatched: number,
  fallbackTotalSource: number,
): {
  apiMatched: number;
  tableMatched: number;
  unmatchedSourceApis: number;
  unmatchedSourceTables: number;
  unmatchedDocApis: number;
  unmatchedDocTables: number;
} {
  if (!json) {
    // No cached data: treat all as API (backward-compatible)
    return {
      apiMatched: fallbackMatched,
      tableMatched: 0,
      unmatchedSourceApis: Math.max(0, fallbackTotalSource - fallbackMatched),
      unmatchedSourceTables: 0,
      unmatchedDocApis: 0,
      unmatchedDocTables: 0,
    };
  }

  try {
    const cached = JSON.parse(json) as {
      matchedItems?: Array<{ sourceRef: { type: string } }>;
      unmatchedSourceApis?: number;
      unmatchedDocApis?: number;
      unmatchedSourceTables?: number;
      unmatchedDocTables?: number;
    };

    let apiMatched = 0;
    let tableMatched = 0;
    for (const item of cached.matchedItems ?? []) {
      if (item.sourceRef.type === "table") tableMatched++;
      else apiMatched++;
    }

    return {
      apiMatched,
      tableMatched,
      unmatchedSourceApis: cached.unmatchedSourceApis ?? 0,
      unmatchedSourceTables: cached.unmatchedSourceTables ?? 0,
      unmatchedDocApis: cached.unmatchedDocApis ?? 0,
      unmatchedDocTables: cached.unmatchedDocTables ?? 0,
    };
  } catch {
    return {
      apiMatched: fallbackMatched,
      tableMatched: 0,
      unmatchedSourceApis: Math.max(0, fallbackTotalSource - fallbackMatched),
      unmatchedSourceTables: 0,
      unmatchedDocApis: 0,
      unmatchedDocTables: 0,
    };
  }
}

async function handleGetKpi(
  request: Request,
  env: Env,
): Promise<Response> {
  const organizationId = request.headers.get("X-Organization-Id");
  if (!organizationId) {
    return badRequest("X-Organization-Id header is required");
  }

  // Get the latest completed result WITH match_result_json for API/Table split
  const resultRow = await env.DB_EXTRACTION.prepare(
    `SELECT result_id, total_source_items, total_doc_items, matched_items,
            gap_count, coverage_pct, spec_type, match_result_json
     FROM fact_check_results
     WHERE organization_id = ? AND status = 'completed'
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(organizationId)
    .first<{
      result_id: string;
      total_source_items: number;
      total_doc_items: number;
      matched_items: number;
      gap_count: number;
      coverage_pct: number;
      spec_type: string;
      match_result_json: string | null;
    }>();

  if (!resultRow) {
    return ok(emptyKpi());
  }

  // Split API vs Table from cached match_result_json
  const split = parseMatchResultForKpi(
    resultRow.match_result_json,
    resultRow.matched_items,
    resultRow.total_source_items,
  );

  // Reconcile: D1 matched_items may be higher than JSON sum if LLM
  // matches were applied before match_result_json sync was deployed.
  // Attribute the delta proportionally (or all to API if no tables).
  const jsonTotal = split.apiMatched + split.tableMatched;
  const d1Delta = Math.max(0, resultRow.matched_items - jsonTotal);
  if (d1Delta > 0) {
    // Distribute delta proportionally; if no table matches yet, all go to API
    if (split.tableMatched === 0) {
      split.apiMatched += d1Delta;
      split.unmatchedSourceApis = Math.max(0, split.unmatchedSourceApis - d1Delta);
    } else {
      const apiRatio = split.apiMatched / jsonTotal;
      const apiDelta = Math.round(d1Delta * apiRatio);
      const tableDelta = d1Delta - apiDelta;
      split.apiMatched += apiDelta;
      split.tableMatched += tableDelta;
      split.unmatchedSourceApis = Math.max(0, split.unmatchedSourceApis - apiDelta);
      split.unmatchedSourceTables = Math.max(0, split.unmatchedSourceTables - tableDelta);
    }
  }

  const totalSourceApis = split.apiMatched + split.unmatchedSourceApis;
  const totalSourceTables = split.tableMatched + split.unmatchedSourceTables;
  const totalDocApis = split.apiMatched + split.unmatchedDocApis;
  const totalDocTables = split.tableMatched + split.unmatchedDocTables;

  // PRD SS8.2: Coverage = matched / 문서 기재 항목 수 (분모 = document items)
  const apiCoverage = totalDocApis > 0
    ? Math.round((split.apiMatched / totalDocApis) * 1000) / 10
    : 0;
  const tableCoverage = totalDocTables > 0
    ? Math.round((split.tableMatched / totalDocTables) * 1000) / 10
    : 0;
  // Supplementary: documentation completeness = matched / source items
  const apiDocCompleteness = totalSourceApis > 0
    ? Math.round((split.apiMatched / totalSourceApis) * 1000) / 10
    : 0;
  const tableDocCompleteness = totalSourceTables > 0
    ? Math.round((split.tableMatched / totalSourceTables) * 1000) / 10
    : 0;

  // KPI-3: Gap Precision — confirmed / (confirmed + dismissed)
  const gapStatsRow = await env.DB_EXTRACTION.prepare(
    `SELECT
       COUNT(*) AS total_gaps,
       SUM(CASE WHEN review_status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
       SUM(CASE WHEN review_status = 'dismissed' THEN 1 ELSE 0 END) AS dismissed,
       SUM(CASE WHEN review_status = 'pending' THEN 1 ELSE 0 END) AS pending
     FROM fact_check_gaps
     WHERE result_id = ?`,
  )
    .bind(resultRow.result_id)
    .first<{
      total_gaps: number;
      confirmed: number;
      dismissed: number;
      pending: number;
    }>();

  const confirmed = gapStatsRow?.confirmed ?? 0;
  const dismissed = gapStatsRow?.dismissed ?? 0;
  const totalGaps = gapStatsRow?.total_gaps ?? 0;
  const pending = gapStatsRow?.pending ?? 0;

  const reviewedTotal = confirmed + dismissed;
  const gapPrecision = reviewedTotal > 0
    ? Math.round((confirmed / reviewedTotal) * 1000) / 10
    : 0;

  // Return flat structure matching frontend FactCheckKpi interface
  return ok({
    apiCoverage,
    apiCoverageTarget: 80,
    apiCoveragePass: apiCoverage >= 80,
    tableCoverage,
    tableCoverageTarget: 80,
    tableCoveragePass: tableCoverage >= 80,
    gapPrecision,
    gapPrecisionTarget: 75,
    gapPrecisionPass: gapPrecision >= 75,
    reviewerAcceptance: 0,
    reviewerAcceptanceTarget: 70,
    reviewerAcceptancePass: false,
    specEditTimeReduction: 0,
    specEditTimeReductionTarget: 30,
    specEditTimeReductionPass: false,
    apiDocCompleteness,
    tableDocCompleteness,
    apiDetail: {
      sourceApis: totalSourceApis,
      documentApis: totalDocApis,
      matchedApis: split.apiMatched,
    },
    tableDetail: {
      sourceTables: totalSourceTables,
      documentTables: totalDocTables,
      matchedTables: split.tableMatched,
    },
    gapDetail: {
      totalGaps,
      confirmedGaps: confirmed,
      dismissedGaps: dismissed,
      pendingGaps: pending,
    },
    computedAt: new Date().toISOString(),
  });
}

// ── GET /factcheck/domain-summary ─────────────────────────────────

async function handleGetDomainSummary(
  request: Request,
  env: Env,
): Promise<Response> {
  const organizationId = request.headers.get("X-Organization-Id");
  if (!organizationId) {
    return badRequest("X-Organization-Id header is required");
  }

  // Get the latest completed result
  const resultRow = await env.DB_EXTRACTION.prepare(
    `SELECT result_id, matched_items, total_source_items, coverage_pct
     FROM fact_check_results
     WHERE organization_id = ? AND status = 'completed'
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(organizationId)
    .first<{
      result_id: string;
      matched_items: number;
      total_source_items: number;
      coverage_pct: number;
    }>();

  if (!resultRow) {
    return ok({ domains: [], resultId: null, coveragePct: 0 });
  }

  // Fetch all gaps for this result
  const { results: gapRows } = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM fact_check_gaps WHERE result_id = ?
     ORDER BY CASE severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END`,
  )
    .bind(resultRow.result_id)
    .all<GapRow>();

  const gaps: FactCheckGap[] = gapRows.map(gapRowToApi);

  // Identify noise gap IDs (auto-resolved)
  const noiseGapIds = new Set<string>();
  for (const gap of gaps) {
    if (gap.autoResolved) noiseGapIds.add(gap.gapId);
  }

  const domains = buildDomainSummary(gaps, noiseGapIds);

  return ok({
    resultId: resultRow.result_id,
    matchedItems: resultRow.matched_items,
    totalSourceItems: resultRow.total_source_items,
    coveragePct: resultRow.coverage_pct,
    domains,
  });
}

// ── GET /factcheck/trend ─────────────────────────────────────────

async function handleGetTrend(
  request: Request,
  env: Env,
): Promise<Response> {
  const organizationId = request.headers.get("X-Organization-Id");
  if (!organizationId) {
    return badRequest("X-Organization-Id header is required");
  }

  const { results } = await env.DB_EXTRACTION.prepare(
    `SELECT result_id, total_source_items, total_doc_items, matched_items,
            gap_count, coverage_pct, spec_type, created_at
     FROM fact_check_results
     WHERE organization_id = ? AND status = 'completed'
     ORDER BY created_at ASC`,
  )
    .bind(organizationId)
    .all<{
      result_id: string;
      total_source_items: number;
      total_doc_items: number;
      matched_items: number;
      gap_count: number;
      coverage_pct: number;
      spec_type: string;
      created_at: string;
    }>();

  const trend = results.map((r, idx) => ({
    resultId: r.result_id,
    run: idx + 1,
    totalSourceItems: r.total_source_items,
    totalDocItems: r.total_doc_items,
    matchedItems: r.matched_items,
    gapCount: r.gap_count,
    coveragePct: r.coverage_pct,
    specType: r.spec_type,
    createdAt: r.created_at,
  }));

  return ok({ trend });
}

// ── GET /factcheck/document-suggestions ──────────────────────────

interface DocumentSuggestion {
  domain: GapDomain;
  domainLabel: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  gapCount: number;
  highGaps: number;
  sampleApis: string[];
  sampleTables: string[];
  suggestedDocType: string;
}

async function handleGetDocumentSuggestions(
  request: Request,
  env: Env,
): Promise<Response> {
  const organizationId = request.headers.get("X-Organization-Id");
  if (!organizationId) {
    return badRequest("X-Organization-Id header is required");
  }

  // Get latest completed result
  const resultRow = await env.DB_EXTRACTION.prepare(
    `SELECT result_id FROM fact_check_results
     WHERE organization_id = ? AND status = 'completed'
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(organizationId)
    .first<{ result_id: string }>();

  if (!resultRow) {
    return ok({ suggestions: [] });
  }

  // Fetch unresolved gaps (non-noise, pending review)
  const { results: gapRows } = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM fact_check_gaps
     WHERE result_id = ? AND auto_resolved = 0 AND review_status = 'pending'
     ORDER BY CASE severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END`,
  )
    .bind(resultRow.result_id)
    .all<GapRow>();

  const gaps: FactCheckGap[] = gapRows.map(gapRowToApi);

  // Group by domain
  const domainMap = new Map<GapDomain, FactCheckGap[]>();
  for (const gap of gaps) {
    const domain = categorizeGapDomain(gap);
    const existing = domainMap.get(domain) ?? [];
    existing.push(gap);
    domainMap.set(domain, existing);
  }

  const DOMAIN_LABELS: Record<GapDomain, string> = {
    charge: "충전/결제", gift: "선물/쿠폰", payment: "결제 처리",
    member: "회원 관리", auth: "인증/로그인", wallet: "지갑/잔액",
    store: "가맹점", settlement: "정산/뱅킹", message: "메시지/알림",
    batch: "배치/스케줄", admin: "관리/수동 조작", openbank: "오픈뱅킹",
    point: "포인트", common: "공통/유틸", deal: "거래 내역",
    data: "데이터 모델", unknown: "미분류",
  };

  const DOC_TYPE_HINT: Record<GapDomain, string> = {
    charge: "충전 처리 인터페이스 정의서",
    gift: "선물/쿠폰 API 명세서",
    payment: "결제 처리 인터페이스 정의서",
    member: "회원 관리 기능 명세서",
    auth: "인증/보안 인터페이스 정의서",
    wallet: "지갑/잔액 관리 기능 명세서",
    store: "가맹점 관리 API 명세서",
    settlement: "정산/뱅킹 인터페이스 정의서",
    message: "메시지/알림 API 명세서",
    batch: "배치 처리 운영 매뉴얼",
    admin: "관리자 기능 명세서",
    openbank: "오픈뱅킹 연동 인터페이스 정의서",
    point: "포인트 관리 기능 명세서",
    common: "공통 유틸 API 명세서",
    deal: "거래 내역 인터페이스 정의서",
    data: "테이블 정의서 / ERD 보완",
    unknown: "기능 명세서",
  };

  const suggestions: DocumentSuggestion[] = [];

  for (const [domain, domainGaps] of domainMap) {
    const highGaps = domainGaps.filter((g) => g.severity === "HIGH").length;
    const priority: "HIGH" | "MEDIUM" | "LOW" = highGaps >= 5 ? "HIGH" : highGaps >= 1 ? "MEDIUM" : "LOW";

    // Extract sample API paths and table names
    const sampleApis: string[] = [];
    const sampleTables: string[] = [];

    for (const gap of domainGaps.slice(0, 5)) {
      try {
        const parsed = JSON.parse(gap.sourceItem) as Record<string, unknown>;
        const path = parsed["path"] as string | undefined;
        const tableName = parsed["tableName"] as string | undefined;
        if (path && sampleApis.length < 3) sampleApis.push(path);
        if (tableName && sampleTables.length < 3) sampleTables.push(tableName);
      } catch { /* skip non-JSON */ }
    }

    suggestions.push({
      domain,
      domainLabel: DOMAIN_LABELS[domain],
      priority,
      gapCount: domainGaps.length,
      highGaps,
      sampleApis,
      sampleTables,
      suggestedDocType: DOC_TYPE_HINT[domain],
    });
  }

  // Sort by priority (HIGH first), then gap count
  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  suggestions.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    return pDiff !== 0 ? pDiff : b.gapCount - a.gapCount;
  });

  return ok({ resultId: resultRow.result_id, suggestions });
}

// ── GET /factcheck/summary ────────────────────────────────────────

async function handleGetSummary(
  request: Request,
  env: Env,
): Promise<Response> {
  const organizationId = request.headers.get("X-Organization-Id");
  if (!organizationId) {
    return badRequest("X-Organization-Id header is required");
  }

  const aggRow = await env.DB_EXTRACTION.prepare(
    `SELECT COUNT(*) AS result_count,
            COALESCE(SUM(total_source_items), 0) AS total_source,
            COALESCE(SUM(total_doc_items), 0) AS total_doc,
            COALESCE(SUM(matched_items), 0) AS total_matched,
            COALESCE(SUM(gap_count), 0) AS total_gaps,
            MAX(created_at) AS last_check_at
     FROM fact_check_results
     WHERE organization_id = ? AND status = 'completed'`,
  )
    .bind(organizationId)
    .first<{
      result_count: number;
      total_source: number;
      total_doc: number;
      total_matched: number;
      total_gaps: number;
      last_check_at: string | null;
    }>();

  if (!aggRow || aggRow.result_count === 0) {
    return ok({
      organizationId,
      resultCount: 0,
      totalSourceItems: 0,
      totalDocItems: 0,
      totalMatchedItems: 0,
      totalGaps: 0,
      overallCoveragePct: 0,
      lastCheckAt: null,
    });
  }

  const totalItems = aggRow.total_source + aggRow.total_doc;
  const overallCoverage = totalItems > 0
    ? (aggRow.total_matched * 2 / totalItems) * 100
    : 0;

  return ok({
    organizationId,
    resultCount: aggRow.result_count,
    totalSourceItems: aggRow.total_source,
    totalDocItems: aggRow.total_doc,
    totalMatchedItems: aggRow.total_matched,
    totalGaps: aggRow.total_gaps,
    overallCoveragePct: Math.round(overallCoverage * 10) / 10,
    lastCheckAt: aggRow.last_check_at ?? null,
  });
}
