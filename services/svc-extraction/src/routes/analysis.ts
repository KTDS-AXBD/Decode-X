/**
 * 분석 리포트 API 라우트 — svc-extraction (SVC-02) 확장
 *
 * GET  /analysis/triage                       → TriageResponse (문서 선별)
 * POST /analysis/batch-analyze                → 일괄 분석 요청 (Queue)
 * GET  /analysis/domain-report                → DomainReport (도메인 집계)
 * GET  /analysis/:documentId/summary          → ExtractionSummary (Layer 1)
 * GET  /analysis/:documentId/core-processes   → CoreIdentification (Layer 2)
 * GET  /analysis/:documentId/findings         → DiagnosisResult (Layer 3)
 * GET  /analysis/:documentId/findings/:id     → DiagnosisFinding (단일 소견)
 * POST /analysis/:documentId/findings/:id/review → HITL 리뷰 상태 업데이트
 * POST /analyze                               → 3-Pass 분석 트리거 (scoring → diagnosis)
 */

import { ok, notFound, badRequest } from "@ai-foundry/utils";
import {
  ExtractionSummarySchema,
  CoreIdentificationSchema,
  ZipChunkSummarySchema,
  type DiagnosisFinding,
  type TriageDocument,
  type AggregatedProcess,
  type ZipChunkSummary,
  type PartialExtraction,
} from "@ai-foundry/types";
import { buildScoringPrompt, parseScoringResult, buildCoreSummary } from "../prompts/scoring.js";
import { buildDiagnosisPrompt, parseDiagnosisResult } from "../prompts/diagnosis.js";
import { callLlm, callLlmWithMeta } from "../llm/caller.js";
import type { LlmCallOptions } from "../llm/caller.js";
import type { LlmProvider } from "@ai-foundry/types";
import { scoreProgrammatically, type ExtractionInput } from "../analysis/programmatic-scorer.js";
import { diagnoseProgrammatically } from "../analysis/programmatic-diagnosis.js";
import type { Env } from "../env.js";

// ── D1 행 타입 ─────────────────────────────────────────────────────────

interface FindingRow {
  finding_id: string;
  analysis_id: string;
  document_id: string;
  organization_id: string;
  type: string;
  severity: string;
  finding: string;
  evidence: string;
  recommendation: string;
  related_processes: string | null;
  related_entities: string | null;
  source_document_ids: string | null;
  confidence: number;
  hitl_status: string;
  reviewer_id: string | null;
  reviewer_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
}

function rowToFinding(row: FindingRow): DiagnosisFinding {
  return {
    findingId: row.finding_id,
    type: row.type as DiagnosisFinding["type"],
    severity: row.severity as DiagnosisFinding["severity"],
    finding: row.finding,
    evidence: row.evidence,
    recommendation: row.recommendation,
    sourceDocumentIds: row.source_document_ids ? (JSON.parse(row.source_document_ids) as string[]) : [],
    relatedProcesses: row.related_processes ? (JSON.parse(row.related_processes) as string[]) : [],
    ...(row.related_entities ? { relatedEntities: JSON.parse(row.related_entities) as string[] } : {}),
    confidence: row.confidence,
    hitlStatus: row.hitl_status as DiagnosisFinding["hitlStatus"],
    ...(row.reviewer_comment ? { reviewerComment: row.reviewer_comment } : {}),
    ...(row.reviewer_id ? { reviewedBy: row.reviewer_id } : {}),
    ...(row.reviewed_at ? { reviewedAt: row.reviewed_at } : {}),
  };
}

// ── 라우트 핸들러 ──────────────────────────────────────────────────────

export async function handleAnalysisRoutes(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // GET /analysis/triage — 문서 선별 (Triage)
  if (method === "GET" && path === "/analysis/triage") {
    const organizationId = url.searchParams.get("organizationId");
    if (!organizationId) return badRequest("organizationId query param required");
    return handleGetTriage(env, organizationId);
  }

  // POST /analysis/batch-analyze — 일괄 분석 요청
  if (method === "POST" && path === "/analysis/batch-analyze") {
    return handleBatchAnalyze(request, env);
  }

  // GET /analysis/domain-report — 도메인 집계 리포트
  if (method === "GET" && path === "/analysis/domain-report") {
    const organizationId = url.searchParams.get("organizationId");
    if (!organizationId) return badRequest("organizationId query param required");
    return handleGetDomainReport(env, organizationId);
  }

  // GET /analysis/organizations — 분석 완료된 조직 목록
  if (method === "GET" && path === "/analysis/organizations") {
    return handleGetOrganizations(env);
  }

  // POST /analyze — 3-Pass 분석 트리거
  if (method === "POST" && path === "/analyze") {
    return handleAnalyzeTrigger(request, env, ctx);
  }

  // POST /analysis/:documentId/findings/:findingId/review
  const reviewMatch = path.match(/^\/analysis\/([^/]+)\/findings\/([^/]+)\/review$/);
  if (method === "POST" && reviewMatch) {
    const documentId = reviewMatch[1];
    const findingId = reviewMatch[2];
    if (!documentId || !findingId) return notFound("route");
    return handleFindingReview(request, env, findingId);
  }

  // GET /analysis/:documentId/findings/:findingId
  const findingDetailMatch = path.match(/^\/analysis\/([^/]+)\/findings\/([^/]+)$/);
  if (method === "GET" && findingDetailMatch) {
    const documentId = findingDetailMatch[1];
    const findingId = findingDetailMatch[2];
    if (!documentId || !findingId) return notFound("route");
    return handleGetFinding(env, findingId);
  }

  // GET /analysis/:documentId/findings
  const findingsMatch = path.match(/^\/analysis\/([^/]+)\/findings$/);
  if (method === "GET" && findingsMatch) {
    const documentId = findingsMatch[1];
    if (!documentId) return notFound("route");
    return handleGetFindings(env, documentId);
  }

  // GET /analysis/:documentId/core-processes
  const coreMatch = path.match(/^\/analysis\/([^/]+)\/core-processes$/);
  if (method === "GET" && coreMatch) {
    const documentId = coreMatch[1];
    if (!documentId) return notFound("route");
    return handleGetCoreProcesses(env, documentId);
  }

  // GET /analysis/:documentId/summary
  const summaryMatch = path.match(/^\/analysis\/([^/]+)\/summary$/);
  if (method === "GET" && summaryMatch) {
    const documentId = summaryMatch[1];
    if (!documentId) return notFound("route");
    return handleGetSummary(env, documentId);
  }

  return notFound("route");
}

// ── GET /analysis/organizations ──────────────────────────────────────

async function handleGetOrganizations(env: Env): Promise<Response> {
  const { results } = await env.DB_EXTRACTION.prepare(
    `SELECT organization_id,
            COUNT(*) AS analysis_count,
            SUM(process_count) AS total_processes,
            MAX(created_at) AS last_analysis_at
     FROM analyses
     WHERE status = 'completed'
     GROUP BY organization_id
     ORDER BY last_analysis_at DESC`
  )
    .all<{
      organization_id: string;
      analysis_count: number;
      total_processes: number;
      last_analysis_at: string;
    }>();

  return ok({
    organizations: results.map((r) => ({
      organizationId: r.organization_id,
      analysisCount: r.analysis_count,
      totalProcesses: r.total_processes,
      lastAnalysisAt: r.last_analysis_at,
    })),
  });
}

// ── Triage 스코어 계산 ────────────────────────────────────────────────

function computeTriageScore(doc: {
  ruleCount: number;
  relationshipCount: number;
  entityCount: number;
  processCount: number;
}): number {
  const ruleNorm = Math.min(doc.ruleCount / 10, 1.0);
  const relNorm = Math.min(doc.relationshipCount / 15, 1.0);
  const entityNorm = Math.min(doc.entityCount / 25, 1.0);
  const processNorm = Math.min(doc.processCount / 15, 1.0);
  return ruleNorm * 0.35 + relNorm * 0.25 + entityNorm * 0.25 + processNorm * 0.15;
}

function triageRank(score: number): "high" | "medium" | "low" {
  if (score >= 0.6) return "high";
  if (score >= 0.3) return "medium";
  return "low";
}

// ── GET /analysis/triage ─────────────────────────────────────────────

interface TriageRow {
  id: string;
  document_id: string;
  process_node_count: number | null;
  entity_count: number | null;
  result_json: string | null;
  created_at: string;
  analysis_id: string | null;
  analysis_status: string | null;
  analyzed_at: string | null;
  a_rule_count: number | null;
  a_relationship_count: number | null;
}

async function handleGetTriage(env: Env, organizationId: string): Promise<Response> {
  const { results } = await env.DB_EXTRACTION.prepare(
    `SELECT e.id, e.document_id, e.process_node_count, e.entity_count,
            e.result_json, e.created_at,
            a.analysis_id, a.status AS analysis_status, a.created_at AS analyzed_at,
            a.rule_count AS a_rule_count, a.relationship_count AS a_relationship_count
     FROM extractions e
     LEFT JOIN analyses a ON a.document_id = e.document_id
       AND a.status = 'completed'
       AND a.rowid = (SELECT MAX(a2.rowid) FROM analyses a2
                       WHERE a2.document_id = e.document_id AND a2.status = 'completed')
     WHERE e.organization_id = ? AND e.status = 'completed'
     ORDER BY e.process_node_count DESC`
  )
    .bind(organizationId)
    .all<TriageRow>();

  // Fetch zip summaries via SVC_INGESTION service binding
  const allDocIds = results.map((r) => r.document_id);
  const zipSummaries = await fetchZipSummariesViaServiceBinding(env, organizationId, allDocIds);

  const documents: TriageDocument[] = [];
  let analyzed = 0;
  let highPriority = 0;
  let mediumPriority = 0;
  let lowPriority = 0;

  for (const row of results) {
    let ruleCount = row.a_rule_count ?? 0;
    let relationshipCount = row.a_relationship_count ?? 0;

    // 미분석 문서: result_json에서 rules/relationships count 파싱
    if (!row.analysis_id && row.result_json) {
      try {
        const parsed = JSON.parse(row.result_json) as {
          rules?: unknown[];
          relationships?: unknown[];
        };
        ruleCount = Array.isArray(parsed.rules) ? parsed.rules.length : 0;
        relationshipCount = Array.isArray(parsed.relationships) ? parsed.relationships.length : 0;
      } catch {
        // JSON 파싱 실패 시 0으로 유지
      }
    }

    const processCount = row.process_node_count ?? 0;
    const entityCount = row.entity_count ?? 0;
    const score = computeTriageScore({ ruleCount, relationshipCount, entityCount, processCount });
    const rank = triageRank(score);

    if (row.analysis_id) analyzed++;
    if (rank === "high") highPriority++;
    else if (rank === "medium") mediumPriority++;
    else lowPriority++;

    const summary = zipSummaries.get(row.document_id);
    const isLibOnly = summary !== undefined ? deriveLibOnly(summary) : undefined;
    const partial = summary !== undefined ? derivePartialExtraction(summary) : undefined;

    const doc: TriageDocument = {
      documentId: row.document_id,
      extractionId: row.id,
      processCount,
      entityCount,
      ruleCount,
      relationshipCount,
      triageScore: Math.round(score * 100) / 100,
      triageRank: rank,
      analysisStatus: row.analysis_id ? "completed" : null,
      analysisId: row.analysis_id ?? null,
      analyzedAt: row.analyzed_at ?? null,
      extractedAt: row.created_at,
    };
    if (summary !== undefined) doc.chunkSummary = summary;
    if (isLibOnly !== undefined) doc.isLibOnly = isLibOnly;
    if (summary !== undefined) doc.partialExtraction = partial ?? null;
    documents.push(doc);
  }

  // 스코어 내림차순 정렬
  documents.sort((a, b) => b.triageScore - a.triageScore);

  return ok({
    documents,
    summary: {
      total: documents.length,
      analyzed,
      notAnalyzed: documents.length - analyzed,
      highPriority,
      mediumPriority,
      lowPriority,
    },
  });
}

// ── Zip summary helpers ──────────────────────────────────────────────

async function fetchZipSummariesViaServiceBinding(
  env: Env,
  organizationId: string,
  documentIds: string[],
): Promise<Map<string, ZipChunkSummary>> {
  const map = new Map<string, ZipChunkSummary>();
  if (documentIds.length === 0) return map;

  // Fetch SourceProjectSummary chunks for each document in parallel (max 10 concurrent)
  const results = await Promise.allSettled(
    documentIds.map((docId) => fetchSummaryChunkForDoc(env, organizationId, docId))
  );

  for (let i = 0; i < documentIds.length; i++) {
    const result = results[i];
    const docId = documentIds[i];
    if (result?.status === "fulfilled" && result.value !== null && docId !== undefined) {
      map.set(docId, result.value);
    }
  }
  return map;
}

async function fetchSummaryChunkForDoc(
  env: Env,
  organizationId: string,
  documentId: string,
): Promise<ZipChunkSummary | null> {
  try {
    const resp = await env.SVC_INGESTION.fetch(
      `http://internal/documents/${documentId}/chunks`,
      {
        headers: {
          "X-Internal-Secret": env.INTERNAL_API_SECRET,
          "X-Organization-Id": organizationId,
        },
      },
    );
    if (!resp.ok) return null;

    const body = await resp.json() as {
      success: boolean;
      data: { chunks: Array<{ element_type: string; masked_text: string }> };
    };
    if (!body.success) return null;

    const summaryChunk = body.data.chunks.find((c) => c.element_type === "SourceProjectSummary");
    if (!summaryChunk) return null;

    const raw = JSON.parse(summaryChunk.masked_text) as { projectName?: string; stats?: unknown };
    const parsed = ZipChunkSummarySchema.safeParse({
      projectName: raw.projectName ?? "",
      ...(raw.stats as object),
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function deriveLibOnly(s: ZipChunkSummary): boolean {
  return s.controllerCount === 0
    && s.dataModelCount === 0
    && s.transactionCount === 0
    && s.mapperCount === 0;
}

function derivePartialExtraction(s: ZipChunkSummary): PartialExtraction | null {
  const rate = s.extractionRate;
  const reasons: string[] = [];
  if (s.cappedAtMaxFiles) reasons.push("MAX_FILES 한도 도달");
  if ((s.oversizedSkippedCount ?? 0) > 0) reasons.push(`${s.oversizedSkippedCount}개 파일 size 초과 skip`);
  if (rate !== undefined && rate < 0.95) reasons.push(`추출률 ${Math.round(rate * 100)}%`);
  if (reasons.length === 0) return null;

  let severity: "HIGH" | "MEDIUM" | "LOW" = "LOW";
  if (s.cappedAtMaxFiles || (rate !== undefined && rate < 0.5)) severity = "HIGH";
  else if (rate !== undefined && rate < 0.8) severity = "MEDIUM";
  return { rate: rate ?? 1, severity, reasons };
}

// ── POST /analysis/batch-analyze ─────────────────────────────────────

interface BatchAnalyzeBody {
  documentIds: string[];
  organizationId: string;
  preferredProvider?: string;
  preferredTier?: string;
  preferredMode?: "llm" | "programmatic";
}

async function handleBatchAnalyze(request: Request, env: Env): Promise<Response> {
  let body: BatchAnalyzeBody;
  try {
    body = (await request.json()) as BatchAnalyzeBody;
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const { documentIds, organizationId, preferredProvider, preferredTier, preferredMode } = body;
  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return badRequest("documentIds must be a non-empty array");
  }
  if (!organizationId) {
    return badRequest("organizationId is required");
  }

  const isProgrammatic = preferredMode === "programmatic";
  let submitted = 0;
  let completed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const docId of documentIds) {
    // 이미 분석 완료 확인
    const existing = await env.DB_EXTRACTION.prepare(
      `SELECT analysis_id FROM analyses WHERE document_id = ? AND status = 'completed' LIMIT 1`
    )
      .bind(docId)
      .first<{ analysis_id: string }>();

    if (existing) {
      skipped++;
      continue;
    }

    // extraction 확인
    const extraction = await env.DB_EXTRACTION.prepare(
      `SELECT id, result_json FROM extractions WHERE document_id = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 1`
    )
      .bind(docId)
      .first<{ id: string; result_json: string | null }>();

    if (!extraction) {
      errors.push(`${docId}: no completed extraction`);
      continue;
    }

    if (isProgrammatic) {
      // 프로그래밍 모드: Queue 없이 직접 실행
      if (!extraction.result_json) {
        errors.push(`${docId}: no extraction result_json`);
        continue;
      }
      try {
        const extractionResult = JSON.parse(extraction.result_json) as ExtractionInput;
        await runProgrammaticAnalysis(env, {
          analysisId: crypto.randomUUID(),
          documentId: docId,
          extractionId: extraction.id,
          organizationId,
          extractionResult,
        });
        completed++;
      } catch (e) {
        errors.push(`${docId}: ${String(e)}`);
      }
    } else {
      // LLM 모드: Queue에 analysis.requested 이벤트 발행
      await env.QUEUE_PIPELINE.send({
        eventId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        type: "analysis.requested",
        payload: {
          documentId: docId,
          extractionId: extraction.id,
          organizationId,
          mode: "diagnosis-sync",
          ...(preferredProvider ? { preferredProvider } : {}),
          ...(preferredTier ? { preferredTier } : {}),
        },
      });
      submitted++;
    }
  }

  return ok({
    submitted,
    completed,
    skipped,
    errors,
    ...(isProgrammatic ? { mode: "programmatic" as const } : {}),
  });
}

// ── GET /analysis/domain-report ──────────────────────────────────────

interface AggCountRow {
  doc_count: number;
  total_processes: number;
  total_entities: number;
  total_rules: number;
  total_relationships: number;
  total_core: number;
  last_analyzed_at: string | null;
}

interface FindingAggRow {
  type: string;
  severity: string;
  cnt: number;
}

interface TopFindingRow {
  finding_id: string;
  document_id: string;
  type: string;
  severity: string;
  finding: string;
  evidence: string;
  recommendation: string;
  related_processes: string | null;
  confidence: number;
  hitl_status: string;
}

interface SummaryJsonRow {
  document_id: string;
  summary_json: string;
}

async function handleGetDomainReport(env: Env, organizationId: string): Promise<Response> {
  // 4a: 집계 카운트
  const aggRow = await env.DB_EXTRACTION.prepare(
    `SELECT COUNT(*) AS doc_count,
            COALESCE(SUM(process_count), 0) AS total_processes,
            COALESCE(SUM(entity_count), 0) AS total_entities,
            COALESCE(SUM(rule_count), 0) AS total_rules,
            COALESCE(SUM(relationship_count), 0) AS total_relationships,
            COALESCE(SUM(core_process_count), 0) AS total_core,
            MAX(created_at) AS last_analyzed_at
     FROM analyses WHERE organization_id = ? AND status = 'completed'`
  )
    .bind(organizationId)
    .first<AggCountRow>();

  if (!aggRow || aggRow.doc_count === 0) {
    return ok({
      organizationId,
      analyzedDocumentCount: 0,
      counts: { processes: 0, entities: 0, rules: 0, relationships: 0, coreProcesses: 0 },
      findingsSummary: {
        total: 0,
        byType: { missing: 0, duplicate: 0, overspec: 0, inconsistency: 0 },
        bySeverity: { critical: 0, warning: 0, info: 0 },
      },
      topFindings: [],
      coreProcesses: [],
      lastAnalyzedAt: null,
    });
  }

  // 4b: 발견사항 집계
  const { results: findingAgg } = await env.DB_EXTRACTION.prepare(
    `SELECT type, severity, COUNT(*) AS cnt
     FROM diagnosis_findings WHERE organization_id = ?
     GROUP BY type, severity`
  )
    .bind(organizationId)
    .all<FindingAggRow>();

  const byType = { missing: 0, duplicate: 0, overspec: 0, inconsistency: 0 };
  const bySeverity = { critical: 0, warning: 0, info: 0 };
  let totalFindings = 0;

  for (const row of findingAgg) {
    totalFindings += row.cnt;
    const typeKey = row.type as keyof typeof byType;
    if (typeKey in byType) byType[typeKey] += row.cnt;
    const sevKey = row.severity as keyof typeof bySeverity;
    if (sevKey in bySeverity) bySeverity[sevKey] += row.cnt;
  }

  // 4c: 상위 30건 발견사항
  const { results: topFindingRows } = await env.DB_EXTRACTION.prepare(
    `SELECT finding_id, document_id, type, severity, finding, evidence,
            recommendation, related_processes, confidence, hitl_status
     FROM diagnosis_findings WHERE organization_id = ?
     ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
              confidence DESC
     LIMIT 30`
  )
    .bind(organizationId)
    .all<TopFindingRow>();

  const topFindings = topFindingRows.map((r) => ({
    findingId: r.finding_id,
    documentId: r.document_id,
    type: r.type,
    severity: r.severity,
    finding: r.finding,
    evidence: r.evidence,
    recommendation: r.recommendation,
    relatedProcesses: r.related_processes ? (JSON.parse(r.related_processes) as string[]) : [],
    confidence: r.confidence,
    hitlStatus: r.hitl_status,
  }));

  // 4d: 핵심 프로세스 집계 — summary_json에서 processes 배열 머지
  const { results: summaryRows } = await env.DB_EXTRACTION.prepare(
    `SELECT document_id, summary_json FROM analyses
     WHERE organization_id = ? AND status = 'completed'`
  )
    .bind(organizationId)
    .all<SummaryJsonRow>();

  const processMap = new Map<string, {
    scores: number[];
    categories: string[];
    documentIds: string[];
    isCoreVotes: boolean[];
  }>();

  for (const row of summaryRows) {
    try {
      const summary = JSON.parse(row.summary_json) as {
        processes?: Array<{
          name: string;
          importanceScore: number;
          category: string;
          isCore: boolean;
        }>;
      };
      if (!Array.isArray(summary.processes)) continue;
      for (const proc of summary.processes) {
        const key = proc.name;
        let entry = processMap.get(key);
        if (!entry) {
          entry = { scores: [], categories: [], documentIds: [], isCoreVotes: [] };
          processMap.set(key, entry);
        }
        entry.scores.push(proc.importanceScore);
        entry.categories.push(proc.category);
        entry.documentIds.push(row.document_id);
        entry.isCoreVotes.push(proc.isCore);
      }
    } catch {
      // JSON 파싱 실패 무시
    }
  }

  const coreProcesses: AggregatedProcess[] = [];
  for (const [name, data] of processMap) {
    const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    // 최빈 카테고리
    const catCounts = new Map<string, number>();
    for (const c of data.categories) {
      catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
    }
    let topCat = "supporting";
    let topCatCount = 0;
    for (const [cat, cnt] of catCounts) {
      if (cnt > topCatCount) {
        topCat = cat;
        topCatCount = cnt;
      }
    }
    const isCore = topCat === "mega" || topCat === "core";
    coreProcesses.push({
      name,
      category: topCat as AggregatedProcess["category"],
      avgImportanceScore: Math.round(avgScore * 100) / 100,
      documentCount: new Set(data.documentIds).size,
      sourceDocumentIds: [...new Set(data.documentIds)],
      isCore,
    });
  }

  // 중요도 내림차순
  coreProcesses.sort((a, b) => b.avgImportanceScore - a.avgImportanceScore);

  return ok({
    organizationId,
    analyzedDocumentCount: aggRow.doc_count,
    counts: {
      processes: aggRow.total_processes,
      entities: aggRow.total_entities,
      rules: aggRow.total_rules,
      relationships: aggRow.total_relationships,
      coreProcesses: aggRow.total_core,
    },
    findingsSummary: {
      total: totalFindings,
      byType,
      bySeverity,
    },
    topFindings,
    coreProcesses,
    lastAnalyzedAt: aggRow.last_analyzed_at ?? null,
  });
}

// ── GET /analysis/:documentId/summary ────────────────────────────────

async function handleGetSummary(env: Env, documentId: string): Promise<Response> {
  const row = await env.DB_EXTRACTION.prepare(
    `SELECT summary_json, llm_provider, llm_model FROM analyses WHERE document_id = ? ORDER BY created_at DESC LIMIT 1`
  )
    .bind(documentId)
    .first<{ summary_json: string; llm_provider: string | null; llm_model: string | null }>();

  if (!row) return notFound("analysis", documentId);

  const parsed: unknown = JSON.parse(row.summary_json);
  const validated = ExtractionSummarySchema.safeParse(parsed);
  if (!validated.success) {
    return new Response(JSON.stringify({ success: false, error: { message: "Invalid analysis data" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return ok({ ...validated.data, llmProvider: row.llm_provider, llmModel: row.llm_model });
}

// ── GET /analysis/:documentId/core-processes ─────────────────────────

async function handleGetCoreProcesses(env: Env, documentId: string): Promise<Response> {
  const row = await env.DB_EXTRACTION.prepare(
    `SELECT core_identification_json FROM analyses WHERE document_id = ? ORDER BY created_at DESC LIMIT 1`
  )
    .bind(documentId)
    .first<{ core_identification_json: string }>();

  if (!row) return notFound("analysis", documentId);

  const parsed: unknown = JSON.parse(row.core_identification_json);
  const validated = CoreIdentificationSchema.safeParse(parsed);
  if (!validated.success) {
    return new Response(JSON.stringify({ success: false, error: { message: "Invalid core identification data" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return ok(validated.data);
}

// ── GET /analysis/:documentId/findings ───────────────────────────────

async function handleGetFindings(env: Env, documentId: string): Promise<Response> {
  // 분석 ID + 메타데이터 조회
  const analysisRow = await env.DB_EXTRACTION.prepare(
    `SELECT analysis_id, extraction_id, organization_id, created_at
     FROM analyses WHERE document_id = ? ORDER BY created_at DESC LIMIT 1`
  )
    .bind(documentId)
    .first<{ analysis_id: string; extraction_id: string; organization_id: string; created_at: string }>();

  if (!analysisRow) return notFound("analysis", documentId);

  const { results } = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM diagnosis_findings WHERE analysis_id = ? ORDER BY severity ASC, created_at ASC`
  )
    .bind(analysisRow.analysis_id)
    .all<FindingRow>();

  const findings: DiagnosisFinding[] = results.map(rowToFinding);

  // byType 집계
  const byType = { missing: 0, duplicate: 0, overspec: 0, inconsistency: 0 };
  const bySeverity = { critical: 0, warning: 0, info: 0 };
  for (const f of findings) {
    byType[f.type]++;
    bySeverity[f.severity]++;
  }

  return ok({
    diagnosisId: analysisRow.analysis_id,
    documentId,
    extractionId: analysisRow.extraction_id,
    organizationId: analysisRow.organization_id,
    findings,
    summary: {
      totalFindings: findings.length,
      byType,
      bySeverity,
    },
    createdAt: analysisRow.created_at,
  });
}

// ── GET /analysis/:documentId/findings/:findingId ────────────────────

async function handleGetFinding(env: Env, findingId: string): Promise<Response> {
  const row = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM diagnosis_findings WHERE finding_id = ?`
  )
    .bind(findingId)
    .first<FindingRow>();

  if (!row) return notFound("finding", findingId);

  return ok(rowToFinding(row));
}

// ── POST /analysis/:documentId/findings/:findingId/review ─────────────

interface ReviewBody {
  action: "accept" | "reject" | "modify";
  comment?: string;
  reviewerId: string;
}

async function handleFindingReview(
  request: Request,
  env: Env,
  findingId: string
): Promise<Response> {
  let body: ReviewBody;
  try {
    body = (await request.json()) as ReviewBody;
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const { action, comment, reviewerId } = body;

  if (!action || !["accept", "reject", "modify"].includes(action)) {
    return badRequest("action must be accept | reject | modify");
  }
  if (!reviewerId || typeof reviewerId !== "string") {
    return badRequest("reviewerId is required");
  }

  const hitlStatus = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "modified";
  const reviewedAt = new Date().toISOString();

  const result = await env.DB_EXTRACTION.prepare(
    `UPDATE diagnosis_findings
     SET hitl_status = ?, reviewer_id = ?, reviewer_comment = ?, reviewed_at = ?
     WHERE finding_id = ?`
  )
    .bind(hitlStatus, reviewerId, comment ?? null, reviewedAt, findingId)
    .run();

  if (result.meta.rows_written === 0) {
    return notFound("finding", findingId);
  }

  return ok({ findingId, hitlStatus, reviewedAt });
}

// ── POST /analyze — 3-Pass 분석 트리거 ───────────────────────────────

interface AnalyzeBody {
  documentId: string;
  extractionId: string;
  organizationId: string;
  mode: "standard" | "diagnosis" | "diagnosis-sync" | "programmatic";
  preferredProvider?: LlmProvider;
  preferredTier?: "sonnet" | "haiku";
}

async function handleAnalyzeTrigger(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  let body: AnalyzeBody;
  try {
    body = (await request.json()) as AnalyzeBody;
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const { documentId, extractionId, organizationId, mode = "standard", preferredProvider, preferredTier } = body;

  if (!documentId || typeof documentId !== "string") return badRequest("documentId is required");
  if (!extractionId || typeof extractionId !== "string") return badRequest("extractionId is required");
  if (!organizationId || typeof organizationId !== "string") return badRequest("organizationId is required");

  const llmOptions: LlmCallOptions = {};
  if (preferredProvider) llmOptions.provider = preferredProvider;

  if (mode !== "diagnosis" && mode !== "diagnosis-sync" && mode !== "programmatic") {
    return ok({ message: "Standard mode: no diagnosis analysis performed", documentId, extractionId });
  }

  // 기존 extraction 결과 조회
  const extractionRow = await env.DB_EXTRACTION.prepare(
    `SELECT result_json FROM extractions WHERE id = ?`
  )
    .bind(extractionId)
    .first<{ result_json: string | null }>();

  if (!extractionRow?.result_json) {
    return notFound("extraction", extractionId);
  }

  const extractionResult = JSON.parse(extractionRow.result_json) as {
    processes: Array<{ name: string; description: string; steps: string[] }>;
    entities: Array<{ name: string; type: string; attributes: string[] }>;
    rules: Array<{ condition: string; outcome: string }>;
    relationships: Array<{ from: string; to: string; type: string }>;
  };

  const analysisId = crypto.randomUUID();

  const passOpts = {
    analysisId,
    documentId,
    extractionId,
    organizationId,
    extractionResult,
    llmOptions,
    tier: preferredTier ?? "sonnet" as const,
  };

  // 프로그래밍 모드: LLM 없이 직접 스코어링+진단
  if (mode === "programmatic") {
    try {
      await runProgrammaticAnalysis(env, {
        analysisId, documentId, extractionId, organizationId, extractionResult,
      });
      return ok({ analysisId, status: "completed", mode: "programmatic", documentId, extractionId, organizationId });
    } catch (e) {
      return Response.json({
        success: false,
        error: { code: "PROGRAMMATIC_ANALYSIS_ERROR", message: String(e) },
      }, { status: 500 });
    }
  }

  if (mode === "diagnosis-sync") {
    // 동기 모드: 에러를 응답에 직접 포함
    try {
      await runAnalysisPasses(env, passOpts);
      return ok({ analysisId, status: "completed", documentId, extractionId, organizationId });
    } catch (e) {
      return Response.json({
        success: false,
        error: { code: "ANALYSIS_ERROR", message: String(e) },
      }, { status: 500 });
    }
  }

  // 비동기로 3-Pass 분석 실행 (non-blocking)
  ctx.waitUntil(runAnalysisPasses(env, passOpts));

  return ok({ analysisId, status: "processing", documentId, extractionId, organizationId });
}

// ── 3-Pass 분석 내부 함수 ─────────────────────────────────────────────

async function runAnalysisPasses(
  env: Env,
  opts: {
    analysisId: string;
    documentId: string;
    extractionId: string;
    organizationId: string;
    extractionResult: {
      processes: Array<{ name: string; description: string; steps: string[] }>;
      entities: Array<{ name: string; type: string; attributes: string[] }>;
      rules: Array<{ condition: string; outcome: string }>;
      relationships: Array<{ from: string; to: string; type: string }>;
    };
    llmOptions?: LlmCallOptions;
    tier?: "sonnet" | "haiku";
  }
): Promise<void> {
  const { analysisId, documentId, extractionId, organizationId, extractionResult, llmOptions, tier: requestedTier } = opts;
  const tier = requestedTier ?? "sonnet";

  try {
    // Pass 1: Scoring + Core Identification
    const scoringPrompt = buildScoringPrompt(extractionResult);
    const scoringMeta = await callLlmWithMeta(scoringPrompt, tier, env, 8192, llmOptions);
    const scoringResult = parseScoringResult(scoringMeta.content);
    const llmProvider = scoringMeta.provider;
    const llmModel = scoringMeta.model;

    const coreSummary = buildCoreSummary(scoringResult.scoredProcesses);

    const summaryJson = JSON.stringify({
      documentId,
      organizationId,
      extractionId,
      counts: {
        processes: extractionResult.processes.length,
        entities: extractionResult.entities.length,
        rules: extractionResult.rules.length,
        relationships: extractionResult.relationships.length,
      },
      processes: scoringResult.scoredProcesses,
      entities: extractionResult.entities.map((e) => ({
        ...e,
        usageCount: 0,
        isOrphan: false,
      })),
      documentClassification: "general",
      analysisTimestamp: new Date().toISOString(),
    });

    const coreIdentificationJson = JSON.stringify({
      documentId,
      organizationId,
      coreProcesses: scoringResult.coreJudgments,
      processTree: scoringResult.processTree,
      summary: coreSummary,
    });

    const now = new Date().toISOString();
    await env.DB_EXTRACTION.prepare(
      `INSERT INTO analyses
       (analysis_id, document_id, extraction_id, organization_id,
        process_count, entity_count, rule_count, relationship_count,
        core_process_count, mega_process_count,
        summary_json, core_identification_json, llm_provider, llm_model, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`
    )
      .bind(
        analysisId,
        documentId,
        extractionId,
        organizationId,
        extractionResult.processes.length,
        extractionResult.entities.length,
        extractionResult.rules.length,
        extractionResult.relationships.length,
        coreSummary.coreProcessCount,
        coreSummary.megaProcessCount,
        summaryJson,
        coreIdentificationJson,
        llmProvider,
        llmModel,
        now
      )
      .run();

    // Pass 2: Diagnosis
    let findings: ReturnType<typeof parseDiagnosisResult> = [];
    try {
      const diagnosisPrompt = buildDiagnosisPrompt(scoringResult, extractionResult);
      const rawDiagnosis = await callLlm(diagnosisPrompt, tier, env, 8192, llmOptions);
      findings = parseDiagnosisResult(rawDiagnosis);
    } catch (diagErr) {
      console.error("[Pass2 Diagnosis error]", String(diagErr));
      findings = [];
    }

    // D1 diagnosis_findings INSERT
    if (findings.length > 0) {
      for (const finding of findings) {
        const fid = crypto.randomUUID();
        await env.DB_EXTRACTION.prepare(
          `INSERT INTO diagnosis_findings
           (finding_id, analysis_id, document_id, organization_id,
            type, severity, finding, evidence, recommendation,
            related_processes, related_entities, source_document_ids,
            confidence, hitl_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
        )
          .bind(
            fid,
            analysisId,
            documentId,
            organizationId,
            finding.type,
            finding.severity,
            finding.finding,
            finding.evidence,
            finding.recommendation,
            JSON.stringify(finding.relatedProcesses),
            finding.relatedEntities ? JSON.stringify(finding.relatedEntities) : null,
            JSON.stringify(finding.sourceDocumentIds),
            finding.confidence,
            now
          )
          .run();
      }
    }

    // analysis.completed 이벤트 발행
    await env.QUEUE_PIPELINE.send({
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      type: "analysis.completed",
      payload: {
        documentId,
        extractionId,
        organizationId,
        analysisId,
        findingCount: findings.length,
        coreProcessCount: coreSummary.coreProcessCount,
      },
    });

    // diagnosis.completed 이벤트 발행
    await env.QUEUE_PIPELINE.send({
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      type: "diagnosis.completed",
      payload: {
        analysisId,
        documentId,
        organizationId,
        findingCount: findings.length,
      },
    });
  } catch {
    // 분석 실패 — 기존 파이프라인에 영향 없도록 status='partial' 업데이트
    await env.DB_EXTRACTION.prepare(
      `UPDATE analyses SET status = 'partial' WHERE analysis_id = ?`
    )
      .bind(analysisId)
      .run();
  }
}

// ── 프로그래밍 기반 분석 (LLM-Free) ──────────────────────────────────

type ExtractionResult = {
  processes: Array<{ name: string; description: string; steps: string[] }>;
  entities: Array<{ name: string; type: string; attributes: string[] }>;
  rules: Array<{ condition: string; outcome: string }>;
  relationships: Array<{ from: string; to: string; type: string }>;
};

async function runProgrammaticAnalysis(
  env: Env,
  opts: {
    analysisId: string;
    documentId: string;
    extractionId: string;
    organizationId: string;
    extractionResult: ExtractionResult;
  }
): Promise<void> {
  const { analysisId, documentId, extractionId, organizationId, extractionResult } = opts;

  // Pass 1: 프로그래밍 스코어링
  const scoringResult = scoreProgrammatically(extractionResult);
  const coreSummary = buildCoreSummary(scoringResult.scoredProcesses);

  const summaryJson = JSON.stringify({
    documentId,
    organizationId,
    extractionId,
    counts: {
      processes: extractionResult.processes.length,
      entities: extractionResult.entities.length,
      rules: extractionResult.rules.length,
      relationships: extractionResult.relationships.length,
    },
    processes: scoringResult.scoredProcesses,
    entities: extractionResult.entities.map((e) => ({
      ...e,
      usageCount: 0,
      isOrphan: false,
    })),
    documentClassification: "general",
    analysisTimestamp: new Date().toISOString(),
  });

  const coreIdentificationJson = JSON.stringify({
    documentId,
    organizationId,
    coreProcesses: scoringResult.coreJudgments,
    processTree: scoringResult.processTree,
    summary: coreSummary,
  });

  const now = new Date().toISOString();
  await env.DB_EXTRACTION.prepare(
    `INSERT INTO analyses
     (analysis_id, document_id, extraction_id, organization_id,
      process_count, entity_count, rule_count, relationship_count,
      core_process_count, mega_process_count,
      summary_json, core_identification_json, llm_provider, llm_model, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`
  )
    .bind(
      analysisId,
      documentId,
      extractionId,
      organizationId,
      extractionResult.processes.length,
      extractionResult.entities.length,
      extractionResult.rules.length,
      extractionResult.relationships.length,
      coreSummary.coreProcessCount,
      coreSummary.megaProcessCount,
      summaryJson,
      coreIdentificationJson,
      "programmatic",
      "rule-based-v1",
      now
    )
    .run();

  // Pass 2: 프로그래밍 진단
  const findings = diagnoseProgrammatically(scoringResult.scoredProcesses, extractionResult);

  if (findings.length > 0) {
    for (const finding of findings) {
      await env.DB_EXTRACTION.prepare(
        `INSERT INTO diagnosis_findings
         (finding_id, analysis_id, document_id, organization_id,
          type, severity, finding, evidence, recommendation,
          related_processes, related_entities, source_document_ids,
          confidence, hitl_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      )
        .bind(
          finding.findingId,
          analysisId,
          documentId,
          organizationId,
          finding.type,
          finding.severity,
          finding.finding,
          finding.evidence,
          finding.recommendation,
          JSON.stringify(finding.relatedProcesses),
          finding.relatedEntities ? JSON.stringify(finding.relatedEntities) : null,
          JSON.stringify(finding.sourceDocumentIds),
          finding.confidence,
          now
        )
        .run();
    }
  }

  // analysis.completed 이벤트 발행
  await env.QUEUE_PIPELINE.send({
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    type: "analysis.completed",
    payload: {
      documentId,
      extractionId,
      organizationId,
      analysisId,
      findingCount: findings.length,
      coreProcessCount: coreSummary.coreProcessCount,
    },
  });
}
