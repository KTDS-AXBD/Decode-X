/**
 * Gap Analysis Routes — svc-extraction (SVC-02)
 *
 * GET /gap-analysis/overview  → 4-perspective As-Is/To-Be gap summary
 *
 * Aggregates existing data from:
 * - fact_check_results/gaps → API + Table perspectives
 * - analyses + extraction_chunks → Process + Architecture perspectives
 * - diagnosis_findings → cross-cutting findings
 *
 * Part of AIF-REQ-010.
 */

import { ok, badRequest } from "@ai-foundry/utils";
import type { Env } from "../env.js";

// ── Types ─────────────────────────────────────────────────────────

interface PerspectiveSummary {
  asIsCount: number;
  toBeCount: number;
  matchedCount: number;
  gapCount: number;
  coveragePct: number;
  items: PerspectiveItem[];
}

interface PerspectiveItem {
  name: string;
  source: "document" | "code" | "both";
  status: "matched" | "gap-in-doc" | "gap-in-code" | "mismatch";
  severity: "HIGH" | "MEDIUM" | "LOW";
  detail?: string;
  documentId?: string;
}

interface GapOverview {
  organizationId: string;
  perspectives: {
    process: PerspectiveSummary;
    architecture: PerspectiveSummary;
    api: PerspectiveSummary;
    table: PerspectiveSummary;
  };
  findings: FindingSummary;
  generatedAt: string;
}

interface FindingSummary {
  total: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  topFindings: Array<{
    findingId: string;
    type: string;
    severity: string;
    finding: string;
    recommendation: string;
  }>;
}

// ── Router ────────────────────────────────────────────────────────

export async function handleGapAnalysisRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  path: string,
  method: string,
): Promise<Response | null> {
  if (method === "GET" && path === "/gap-analysis/overview") {
    return handleOverview(request, env);
  }
  return null;
}

// ── GET /gap-analysis/overview ────────────────────────────────────

async function handleOverview(
  request: Request,
  env: Env,
): Promise<Response> {
  const orgId = request.headers.get("X-Organization-Id");
  if (!orgId) return badRequest("X-Organization-Id header required");

  const [apiTable, process, architecture, findings] = await Promise.all([
    buildApiTablePerspectives(env, orgId),
    buildProcessPerspective(env, orgId),
    buildArchitecturePerspective(env, orgId),
    buildFindingsSummary(env, orgId),
  ]);

  const overview: GapOverview = {
    organizationId: orgId,
    perspectives: {
      process,
      architecture,
      api: apiTable.api,
      table: apiTable.table,
    },
    findings,
    generatedAt: new Date().toISOString(),
  };

  return ok(overview);
}

// ── API + Table perspectives (from FactCheck) ─────────────────────

interface FactCheckAggRow {
  spec_type: string;
  total_source: number;
  total_doc: number;
  total_matched: number;
  total_gaps: number;
}

interface GapItemRow {
  gap_id: string;
  gap_type: string;
  severity: string;
  source_item: string;
  document_item: string | null;
  description: string;
}

async function buildApiTablePerspectives(
  env: Env,
  orgId: string,
): Promise<{ api: PerspectiveSummary; table: PerspectiveSummary }> {
  // Aggregate latest factcheck results per spec_type
  const { results: aggRows } = await env.DB_EXTRACTION.prepare(
    `SELECT
       CASE WHEN spec_type = 'mixed' THEN 'api' ELSE spec_type END AS spec_type,
       COALESCE(SUM(total_source_items), 0) AS total_source,
       COALESCE(SUM(total_doc_items), 0) AS total_doc,
       COALESCE(SUM(matched_items), 0) AS total_matched,
       COALESCE(SUM(gap_count), 0) AS total_gaps
     FROM fact_check_results
     WHERE organization_id = ? AND status = 'completed'
     GROUP BY CASE WHEN spec_type = 'mixed' THEN 'api' ELSE spec_type END`,
  )
    .bind(orgId)
    .all<FactCheckAggRow>();

  // Get latest completed result IDs for gap detail
  const { results: resultIds } = await env.DB_EXTRACTION.prepare(
    `SELECT result_id FROM fact_check_results
     WHERE organization_id = ? AND status = 'completed'
     ORDER BY created_at DESC LIMIT 5`,
  )
    .bind(orgId)
    .all<{ result_id: string }>();

  const rids = resultIds.map((r) => r.result_id);

  // Fetch top gap items
  const apiItems: PerspectiveItem[] = [];
  const tableItems: PerspectiveItem[] = [];

  if (rids.length > 0) {
    const placeholders = rids.map(() => "?").join(",");
    const { results: gapRows } = await env.DB_EXTRACTION.prepare(
      `SELECT g.gap_id, g.gap_type, g.severity, g.source_item, g.document_item, g.description
       FROM fact_check_gaps g
       WHERE g.result_id IN (${placeholders}) AND g.organization_id = ?
       ORDER BY CASE g.severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END
       LIMIT 200`,
    )
      .bind(...rids, orgId)
      .all<GapItemRow>();

    for (const row of gapRows) {
      const item = gapRowToItem(row);
      // Determine if API or Table based on source_item content
      const sourceObj = safeParseJson(row.source_item);
      if (isRecord(sourceObj)) {
        if ("path" in sourceObj || "httpMethods" in sourceObj || "methodName" in sourceObj) {
          apiItems.push(item);
        } else if ("tableName" in sourceObj || "columns" in sourceObj) {
          tableItems.push(item);
        } else {
          apiItems.push(item);
        }
      } else {
        apiItems.push(item);
      }
    }
  }

  const apiAgg = aggRows.find((r) => r.spec_type === "api");
  const tableAgg = aggRows.find((r) => r.spec_type === "table");

  return {
    api: {
      asIsCount: apiAgg?.total_doc ?? 0,
      toBeCount: apiAgg?.total_source ?? 0,
      matchedCount: apiAgg?.total_matched ?? 0,
      gapCount: apiAgg?.total_gaps ?? 0,
      coveragePct: apiAgg && apiAgg.total_source > 0
        ? Math.round((apiAgg.total_matched / apiAgg.total_source) * 1000) / 10
        : 0,
      items: apiItems,
    },
    table: {
      asIsCount: tableAgg?.total_doc ?? 0,
      toBeCount: tableAgg?.total_source ?? 0,
      matchedCount: tableAgg?.total_matched ?? 0,
      gapCount: tableAgg?.total_gaps ?? 0,
      coveragePct: tableAgg && tableAgg.total_source > 0
        ? Math.round((tableAgg.total_matched / tableAgg.total_source) * 1000) / 10
        : 0,
      items: tableItems,
    },
  };
}

function gapRowToItem(row: GapItemRow): PerspectiveItem {
  const sourceObj = safeParseJson(row.source_item);
  let name: string = row.gap_id;
  if (isRecord(sourceObj)) {
    const candidate =
      (sourceObj["path"] as string | undefined)
      ?? (sourceObj["tableName"] as string | undefined)
      ?? (sourceObj["methodName"] as string | undefined);
    if (candidate) name = candidate;
  }

  const statusMap: Record<string, PerspectiveItem["status"]> = {
    MID: "gap-in-doc",
    MC: "gap-in-code",
    SM: "mismatch",
    TM: "mismatch",
    PM: "mismatch",
  };

  return {
    name: String(name),
    source: row.gap_type === "MID" ? "code" : row.gap_type === "MC" ? "document" : "both",
    status: statusMap[row.gap_type] ?? "mismatch",
    severity: row.severity as PerspectiveItem["severity"],
    detail: row.description,
  };
}

// ── Process perspective (from analyses) ───────────────────────────

interface AnalysisSummaryRow {
  document_id: string;
  process_count: number;
  entity_count: number;
  rule_count: number;
  summary_json: string;
}

async function buildProcessPerspective(
  env: Env,
  orgId: string,
): Promise<PerspectiveSummary> {
  // Document-side processes (from analyses table)
  const { results: analysisRows } = await env.DB_EXTRACTION.prepare(
    `SELECT document_id, process_count, entity_count, rule_count, summary_json
     FROM analyses
     WHERE organization_id = ? AND status = 'completed'`,
  )
    .bind(orgId)
    .all<AnalysisSummaryRow>();

  // Aggregate document processes from summary_json
  const docProcesses = new Map<string, {
    documentCount: number;
    category: string;
    avgScore: number;
    scores: number[];
  }>();

  for (const row of analysisRows) {
    const summary = safeParseJson(row.summary_json) as {
      processes?: Array<{
        name: string;
        importanceScore: number;
        category: string;
      }>;
    } | null;
    if (!summary?.processes) continue;
    for (const proc of summary.processes) {
      const entry = docProcesses.get(proc.name);
      if (entry) {
        entry.documentCount++;
        entry.scores.push(proc.importanceScore);
        entry.avgScore = entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length;
      } else {
        docProcesses.set(proc.name, {
          documentCount: 1,
          category: proc.category,
          avgScore: proc.importanceScore,
          scores: [proc.importanceScore],
        });
      }
    }
  }

  // Source-side: count source_controller + source_transaction chunks
  const txCountRow = await env.DB_EXTRACTION.prepare(
    `SELECT COUNT(DISTINCT c.chunk_id) AS total_processes
     FROM extraction_chunks c
     JOIN extractions e ON c.extraction_id = e.id
     WHERE e.organization_id = ? AND e.status = 'completed'
       AND c.chunk_type IN ('process', 'api')`,
  )
    .bind(orgId)
    .first<{ total_processes: number }>();

  const sourceProcessCount = txCountRow?.total_processes ?? 0;
  const docProcessCount = docProcesses.size;

  // Build items — document processes that may or may not map to code
  const items: PerspectiveItem[] = [];
  for (const [name, data] of docProcesses) {
    items.push({
      name,
      source: "document",
      status: data.category === "mega" || data.category === "core" ? "matched" : "gap-in-code",
      severity: data.avgScore >= 0.7 ? "HIGH" : data.avgScore >= 0.4 ? "MEDIUM" : "LOW",
      detail: `${data.category} 프로세스, 중요도 ${Math.round(data.avgScore * 100)}%, ${data.documentCount}개 문서`,
    });
  }

  items.sort((a, b) => {
    const sevOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return sevOrder[a.severity] - sevOrder[b.severity];
  });

  // Coverage = how many doc processes can be traced to code
  const matchedCount = items.filter((i) => i.status === "matched").length;

  return {
    asIsCount: docProcessCount,
    toBeCount: sourceProcessCount,
    matchedCount,
    gapCount: docProcessCount - matchedCount,
    coveragePct: docProcessCount > 0
      ? Math.round((matchedCount / docProcessCount) * 1000) / 10
      : 0,
    items: items.slice(0, 100),
  };
}

// ── Architecture perspective (from extraction_chunks) ─────────────

async function buildArchitecturePerspective(
  env: Env,
  orgId: string,
): Promise<PerspectiveSummary> {
  // Document-side entities (from analyses)
  const { results: analysisRows } = await env.DB_EXTRACTION.prepare(
    `SELECT document_id, entity_count, summary_json
     FROM analyses
     WHERE organization_id = ? AND status = 'completed'`,
  )
    .bind(orgId)
    .all<{ document_id: string; entity_count: number; summary_json: string }>();

  // Aggregate doc entities from summary_json
  const docEntities = new Map<string, {
    documentCount: number;
    type: string;
    attributes: number;
  }>();

  for (const row of analysisRows) {
    const summary = safeParseJson(row.summary_json) as {
      entities?: Array<{
        name: string;
        type?: string;
        attributeCount?: number;
      }>;
    } | null;
    if (!summary?.entities) continue;
    for (const ent of summary.entities) {
      const entry = docEntities.get(ent.name);
      if (entry) {
        entry.documentCount++;
      } else {
        docEntities.set(ent.name, {
          documentCount: 1,
          type: ent.type ?? "entity",
          attributes: ent.attributeCount ?? 0,
        });
      }
    }
  }

  // Source-side: data models + DDL tables
  const sourceCountRow = await env.DB_EXTRACTION.prepare(
    `SELECT COUNT(DISTINCT c.chunk_id) AS total_entities
     FROM extraction_chunks c
     JOIN extractions e ON c.extraction_id = e.id
     WHERE e.organization_id = ? AND e.status = 'completed'
       AND c.chunk_type IN ('entity', 'relationship')`,
  )
    .bind(orgId)
    .first<{ total_entities: number }>();

  const sourceEntityCount = sourceCountRow?.total_entities ?? 0;
  const docEntityCount = docEntities.size;

  // Build items
  const items: PerspectiveItem[] = [];
  for (const [name, data] of docEntities) {
    items.push({
      name,
      source: "document",
      status: data.documentCount > 1 ? "matched" : "gap-in-code",
      severity: data.attributes > 5 ? "HIGH" : data.attributes > 2 ? "MEDIUM" : "LOW",
      detail: `${data.type}, ${data.attributes}개 속성, ${data.documentCount}개 문서에서 언급`,
    });
  }

  items.sort((a, b) => {
    const sevOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return sevOrder[a.severity] - sevOrder[b.severity];
  });

  const matchedCount = items.filter((i) => i.status === "matched").length;

  return {
    asIsCount: docEntityCount,
    toBeCount: sourceEntityCount,
    matchedCount,
    gapCount: docEntityCount - matchedCount,
    coveragePct: docEntityCount > 0
      ? Math.round((matchedCount / docEntityCount) * 1000) / 10
      : 0,
    items: items.slice(0, 100),
  };
}

// ── Findings summary ──────────────────────────────────────────────

interface FindingAggRow {
  type: string;
  severity: string;
  cnt: number;
}

interface TopFindingRow {
  finding_id: string;
  type: string;
  severity: string;
  finding: string;
  recommendation: string;
}

async function buildFindingsSummary(
  env: Env,
  orgId: string,
): Promise<FindingSummary> {
  const [aggResult, topResult] = await Promise.all([
    env.DB_EXTRACTION.prepare(
      `SELECT type, severity, COUNT(*) AS cnt
       FROM diagnosis_findings WHERE organization_id = ?
       GROUP BY type, severity`,
    )
      .bind(orgId)
      .all<FindingAggRow>(),
    env.DB_EXTRACTION.prepare(
      `SELECT finding_id, type, severity, finding, recommendation
       FROM diagnosis_findings WHERE organization_id = ?
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END
       LIMIT 10`,
    )
      .bind(orgId)
      .all<TopFindingRow>(),
  ]);

  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  let total = 0;

  for (const row of aggResult.results) {
    total += row.cnt;
    byType[row.type] = (byType[row.type] ?? 0) + row.cnt;
    bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + row.cnt;
  }

  return {
    total,
    byType,
    bySeverity,
    topFindings: topResult.results.map((r) => ({
      findingId: r.finding_id,
      type: r.type,
      severity: r.severity,
      finding: r.finding,
      recommendation: r.recommendation,
    })),
  };
}

// ── Helpers ───────────────────────────────────────────────────────

function safeParseJson(str: string | null | undefined): unknown {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
