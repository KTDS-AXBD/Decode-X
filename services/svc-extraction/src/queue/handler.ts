/**
 * Queue event handler — processes ingestion.completed events dispatched by svc-queue-router.
 *
 * `processQueueEvent` is the HTTP-callable entrypoint (POST /internal/queue-event).
 * `handleQueueBatch` is retained for backwards compatibility but delegates to the same logic.
 */

import { createLogger } from "@ai-foundry/utils";
import { PipelineEventSchema } from "@ai-foundry/types";
import type { IngestionCompletedEvent, ExtractionResult } from "@ai-foundry/types";
import { buildExtractionPrompt } from "../prompts/structure.js";
import { buildScoringPrompt, parseScoringResult, buildCoreSummary } from "../prompts/scoring.js";
import { buildDiagnosisPrompt, parseDiagnosisResult } from "../prompts/diagnosis.js";
import { callLlm } from "../llm/caller.js";
import { aggregateSourceSpec } from "../factcheck/source-aggregator.js";
import { extractDocSpec } from "../factcheck/doc-spec-extractor.js";
import { structuralMatch } from "../factcheck/matcher.js";
import { detectGaps } from "../factcheck/gap-detector.js";
import type { Env } from "../env.js";

const logger = createLogger("svc-extraction:queue");

/** Chunk with metadata from svc-ingestion. */
export interface ChunkWithMeta {
  masked_text: string;
  classification: string;
  element_type: string;
  word_count: number;
  chunk_index: number;
}

/**
 * Fetch parsed chunks (with metadata) from svc-ingestion via service binding.
 */
async function fetchChunks(
  documentId: string,
  env: Env,
): Promise<ChunkWithMeta[]> {
  const resp = await env.SVC_INGESTION.fetch(
    `http://internal/documents/${documentId}/chunks`,
    {
      headers: {
        "X-Internal-Secret": env.INTERNAL_API_SECRET,
      },
    },
  );

  if (!resp.ok) {
    throw new Error(`Failed to fetch chunks: ${resp.status}`);
  }

  const data = (await resp.json()) as {
    success: boolean;
    data: { documentId: string; chunks: ChunkWithMeta[] };
  };

  return data.data.chunks;
}

function selectTier(chunks: ChunkWithMeta[]): "sonnet" | "haiku" {
  const totalLen = chunks.reduce((sum, c) => sum + c.masked_text.length, 0);
  return totalLen > 10_000 ? "sonnet" : "haiku";
}

/**
 * Core extraction logic for a single ingestion.completed event.
 * Returns { extractionId, processNodeCount, entityCount } on success.
 */
async function runExtraction(
  event: IngestionCompletedEvent,
  env: Env,
  _ctx: ExecutionContext,
): Promise<{ extractionId: string; processNodeCount: number; entityCount: number }> {
  const { documentId, organizationId } = event.payload;
  const extractionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const extractStart = Date.now();

  // Insert pending extraction record
  await env.DB_EXTRACTION.prepare(
    `INSERT INTO extractions (id, document_id, organization_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, ?)`,
  )
    .bind(extractionId, documentId, organizationId, now, now)
    .run();

  try {
    // Fetch real parsed chunks from svc-ingestion
    const chunks = await fetchChunks(documentId, env);

    if (chunks.length === 0) {
      throw new Error(`No chunks found for document ${documentId}`);
    }

    // Detect dominant classification from chunks
    const classificationCounts = new Map<string, number>();
    for (const c of chunks) {
      const cls = c.classification || "general";
      classificationCounts.set(cls, (classificationCounts.get(cls) ?? 0) + 1);
    }
    let dominantClassification = "general";
    let maxCount = 0;
    for (const [cls, count] of classificationCounts) {
      if (count > maxCount) {
        dominantClassification = cls;
        maxCount = count;
      }
    }

    const prompt = buildExtractionPrompt(chunks, dominantClassification);
    const tier = selectTier(chunks);
    const totalChunkLen = chunks.reduce((sum, c) => sum + c.masked_text.length, 0);
    logger.info("Selected LLM tier", { tier, totalChunkLen, chunkCount: chunks.length, classification: dominantClassification });
    const rawContent = await callLlm(prompt, tier, env);

    // Strip markdown code fences (```json ... ```) that LLMs often add
    const jsonContent = rawContent
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    let parsed: ExtractionResult;
    try {
      parsed = JSON.parse(jsonContent) as ExtractionResult;
    } catch {
      logger.warn("LLM response JSON parse failed, falling back to empty result", {
        documentId,
        rawContentLength: jsonContent.length,
        rawContentPreview: jsonContent.slice(0, 300),
      });
      parsed = { processes: [], entities: [], relationships: [], rules: [], apis: [], tables: [], dataFlows: [], errors: [] };
    }

    const processNodeCount =
      (parsed.processes?.length ?? 0) + (parsed.relationships?.length ?? 0);
    const entityCount = parsed.entities?.length ?? 0;
    const ruleCount = parsed.rules?.length ?? 0;
    const updatedAt = new Date().toISOString();

    await env.DB_EXTRACTION.prepare(
      `UPDATE extractions
       SET status = 'completed', result_json = ?, process_node_count = ?,
           entity_count = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(JSON.stringify(parsed), processNodeCount, entityCount, updatedAt, extractionId)
      .run();

    // Emit extraction.completed → triggers svc-policy via queue router
    // Must be awaited — ctx.waitUntil() can silently drop if Worker terminates early
    await env.QUEUE_PIPELINE.send({
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      type: "extraction.completed",
      payload: {
        documentId,
        extractionId,
        organizationId,
        processNodeCount,
        entityCount,
        processDurationMs: Date.now() - extractStart,
        ruleCount,
      },
    });

    logger.info("Emitted extraction.completed event", { extractionId, documentId, organizationId });

    // Emit analysis.requested → triggers runAnalysis via queue-router (reliable, not ctx.waitUntil)
    await env.QUEUE_PIPELINE.send({
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      type: "analysis.requested",
      payload: { documentId, extractionId, organizationId },
    });

    logger.info("Emitted analysis.requested event", { extractionId, documentId, organizationId });

    return { extractionId, processNodeCount, entityCount };
  } catch (e) {
    // Mark extraction as failed so it doesn't stay permanently pending
    const failedAt = new Date().toISOString();
    await env.DB_EXTRACTION.prepare(
      `UPDATE extractions SET status = 'failed', updated_at = ? WHERE id = ?`,
    )
      .bind(failedAt, extractionId)
      .run();
    throw e;
  }
}

/**
 * Auto-analysis: Pass 1 (scoring) + Pass 2 (diagnosis) after extraction.completed
 * This is non-blocking — failures are logged but do not affect the main pipeline.
 */
async function runAnalysis(
  env: Env,
  opts: {
    documentId: string;
    extractionId: string;
    organizationId: string;
    parsed?: ExtractionResult;
  }
): Promise<{ analysisId: string; findingCount: number }> {
  const { documentId, extractionId, organizationId } = opts;

  // If parsed data not provided (Queue path), fetch from DB
  let parsed: ExtractionResult;
  if (opts.parsed) {
    parsed = opts.parsed;
  } else {
    const row = await env.DB_EXTRACTION.prepare(
      `SELECT result_json FROM extractions WHERE id = ? AND status = 'completed'`,
    )
      .bind(extractionId)
      .first<{ result_json: string }>();
    if (!row) {
      throw new Error(`Extraction ${extractionId} not found or not completed`);
    }
    parsed = JSON.parse(row.result_json) as ExtractionResult;
  }
  const analysisId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Too little data — skip analysis
  if ((parsed.processes?.length ?? 0) < 3) {
    logger.info("Skipping analysis: too few processes extracted", { documentId, processCount: parsed.processes?.length ?? 0 });
    return { analysisId, findingCount: 0 };
  }

  // Pass 1: Scoring + Core Identification
  let scoringResult;
  try {
    const scoringPrompt = buildScoringPrompt({
      processes: parsed.processes ?? [],
      entities: parsed.entities ?? [],
      rules: parsed.rules ?? [],
      relationships: parsed.relationships ?? [],
    });
    const rawScoring = await callLlm(scoringPrompt, "sonnet", env);
    scoringResult = parseScoringResult(rawScoring);
  } catch (e) {
    logger.warn("Pass 1 scoring failed, using empty result", { documentId, error: String(e) });
    scoringResult = { scoredProcesses: [], coreJudgments: [], processTree: [] };
  }

  const coreSummary = buildCoreSummary(scoringResult.scoredProcesses);

  const summaryJson = JSON.stringify({
    documentId,
    organizationId,
    extractionId,
    counts: {
      processes: parsed.processes?.length ?? 0,
      entities: parsed.entities?.length ?? 0,
      rules: parsed.rules?.length ?? 0,
      relationships: parsed.relationships?.length ?? 0,
    },
    processes: scoringResult.scoredProcesses,
    entities: (parsed.entities ?? []).map((e) => ({ ...e, usageCount: 0, isOrphan: false })),
    documentClassification: "general",
    analysisTimestamp: now,
  });

  const coreIdentificationJson = JSON.stringify({
    documentId,
    organizationId,
    coreProcesses: scoringResult.coreJudgments,
    processTree: scoringResult.processTree,
    summary: coreSummary,
  });

  try {
    await env.DB_EXTRACTION.prepare(
      `INSERT INTO analyses
       (analysis_id, document_id, extraction_id, organization_id,
        process_count, entity_count, rule_count, relationship_count,
        core_process_count, mega_process_count,
        summary_json, core_identification_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`
    )
      .bind(
        analysisId, documentId, extractionId, organizationId,
        parsed.processes?.length ?? 0,
        parsed.entities?.length ?? 0,
        parsed.rules?.length ?? 0,
        parsed.relationships?.length ?? 0,
        coreSummary.coreProcessCount,
        coreSummary.megaProcessCount,
        summaryJson,
        coreIdentificationJson,
        now
      )
      .run();
  } catch (e) {
    logger.warn("Failed to insert analysis record", { analysisId, error: String(e) });
    return { analysisId, findingCount: 0 };
  }

  // Pass 2: Diagnosis
  let findings: ReturnType<typeof parseDiagnosisResult>;
  try {
    const diagnosisPrompt = buildDiagnosisPrompt(scoringResult, {
      processes: parsed.processes ?? [],
      entities: parsed.entities ?? [],
      rules: parsed.rules ?? [],
      relationships: parsed.relationships ?? [],
    });
    const rawDiagnosis = await callLlm(diagnosisPrompt, "sonnet", env);
    findings = parseDiagnosisResult(rawDiagnosis);
  } catch (e) {
    logger.warn("Pass 2 diagnosis failed, proceeding with empty findings", { documentId, error: String(e) });
    findings = [];
  }

  for (const finding of findings) {
    try {
      await env.DB_EXTRACTION.prepare(
        `INSERT INTO diagnosis_findings
         (finding_id, analysis_id, document_id, organization_id,
          type, severity, finding, evidence, recommendation,
          related_processes, related_entities, source_document_ids,
          confidence, hitl_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      )
        .bind(
          crypto.randomUUID(), analysisId, documentId, organizationId,
          finding.type, finding.severity, finding.finding,
          finding.evidence, finding.recommendation,
          JSON.stringify(finding.relatedProcesses),
          finding.relatedEntities ? JSON.stringify(finding.relatedEntities) : null,
          JSON.stringify(finding.sourceDocumentIds),
          finding.confidence, now
        )
        .run();
    } catch (e) {
      logger.warn("Failed to insert finding", { analysisId, error: String(e) });
    }
  }

  // Emit analysis.completed event
  await env.QUEUE_PIPELINE.send({
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    type: "analysis.completed",
    payload: { documentId, extractionId, organizationId, analysisId, findingCount: findings.length, coreProcessCount: coreSummary.coreProcessCount },
  });

  // Emit diagnosis.completed event
  await env.QUEUE_PIPELINE.send({
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    type: "diagnosis.completed",
    payload: { analysisId, documentId, organizationId, findingCount: findings.length },
  });

  logger.info("Auto-analysis completed", { analysisId, documentId, coreProcessCount: coreSummary.coreProcessCount, findingCount: findings.length });

  return { analysisId, findingCount: findings.length };
}

/**
 * HTTP-callable handler for a single queue event (POST /internal/queue-event).
 * Called by svc-queue-router via service binding.
 */
export async function processQueueEvent(
  body: unknown,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const parseResult = PipelineEventSchema.safeParse(body);
  if (!parseResult.success) {
    logger.warn("Invalid pipeline event", { error: parseResult.error.message });
    return Response.json({ skipped: true }, { status: 200 });
  }

  // Handle factcheck.requested — run fact check pipeline
  if (parseResult.data.type === "factcheck.requested") {
    const { resultId, organizationId, specType } = parseResult.data.payload;
    try {
      const result = await runFactCheck(resultId, organizationId, specType ?? "mixed", env);
      logger.info("Fact check completed via queue", result);
      return Response.json({ success: true, ...result }, { status: 200 });
    } catch (e) {
      // Update result status to failed
      await env.DB_EXTRACTION.prepare(
        `UPDATE fact_check_results SET status = 'failed', error_message = ?, updated_at = ? WHERE result_id = ?`,
      )
        .bind(String(e), new Date().toISOString(), resultId)
        .run();
      logger.error("Fact check failed", { resultId, error: String(e) });
      return Response.json({ success: false, error: String(e) }, { status: 500 });
    }
  }

  // Handle analysis.requested — run Pass 1+2 analysis from DB data
  if (parseResult.data.type === "analysis.requested") {
    const { documentId, extractionId, organizationId } = parseResult.data.payload;
    try {
      const result = await runAnalysis(env, { documentId, extractionId, organizationId });
      logger.info("Analysis completed via queue", result);
      return Response.json({ success: true, ...result }, { status: 200 });
    } catch (e) {
      logger.error("Analysis failed", { documentId, extractionId, error: String(e) });
      return Response.json({ success: false, error: String(e) }, { status: 500 });
    }
  }

  if (parseResult.data.type !== "ingestion.completed") {
    // Not our event type — acknowledge silently
    return Response.json({ skipped: true, reason: "not_our_event" }, { status: 200 });
  }

  const event = parseResult.data;
  const { documentId } = event.payload;

  try {
    const result = await runExtraction(event, env, ctx);
    logger.info("Extraction completed", result);
    return Response.json({ success: true, ...result }, { status: 200 });
  } catch (e) {
    logger.error("Extraction failed", { documentId, error: String(e) });
    return Response.json(
      { success: false, error: String(e) },
      { status: 500 },
    );
  }
}

/**
 * Run the full fact-check pipeline:
 * 1. Aggregate source spec from ingestion chunks
 * 2. Extract doc spec from document chunks
 * 3. Structural matching (exact + fuzzy)
 * 4. Gap detection
 * 5. Persist gaps to D1
 * 6. Update result record
 * 7. Emit factcheck.completed event
 */
async function runFactCheck(
  resultId: string,
  organizationId: string,
  specType: string,
  env: Env,
): Promise<{ resultId: string; matchedItems: number; gapCount: number; coveragePct: number }> {
  // Step 1: Aggregate source spec
  const sourceSpec = await aggregateSourceSpec(env, organizationId);

  // Step 2: Extract doc spec
  const docSpec = await extractDocSpec(env, organizationId);

  // Step 3: Structural matching
  const matchResult = structuralMatch(sourceSpec, docSpec);

  // Step 4: Gap detection
  const gapResult = detectGaps(matchResult, sourceSpec, docSpec, resultId, organizationId);

  // Compute stats
  const totalSourceItems = sourceSpec.apis.length + sourceSpec.tables.length;
  const totalDocItems = docSpec.apis.length + docSpec.tables.length;
  const matchedItemCount = matchResult.matchedItems.length;
  // Exclude noise-dismissed gaps from the active gap count
  const realGaps = gapResult.gaps.filter((g) => !(g.autoResolved && g.reviewStatus === "dismissed"));
  const gapCount = realGaps.length;
  const noiseFiltered = gapResult.stats.noise.filteredTables + gapResult.stats.noise.filteredApis;
  const adjustedSourceItems = totalSourceItems - noiseFiltered;
  const coveragePct = adjustedSourceItems > 0
    ? (matchedItemCount / adjustedSourceItems) * 100
    : 0;
  logger.info("FactCheck stats", {
    totalGaps: gapResult.gaps.length,
    realGaps: gapCount,
    noiseFiltered,
    noiseStats: gapResult.stats.noise,
    adjustedSourceItems,
    matchedItemCount,
    coveragePct: Math.round(coveragePct * 10) / 10,
  });

  // Collect source/doc document IDs
  const sourceDocIds = new Set<string>();
  for (const api of sourceSpec.apis) sourceDocIds.add(api.documentId);
  for (const tbl of sourceSpec.tables) sourceDocIds.add(tbl.documentId);

  const docDocIds = new Set<string>();
  for (const api of docSpec.apis) docDocIds.add(api.documentId);
  for (const tbl of docSpec.tables) docDocIds.add(tbl.documentId);

  // Step 5: Persist gaps to D1 (batch 50 per statement)
  const gaps = gapResult.gaps;
  const BATCH_SIZE = 50;

  for (let i = 0; i < gaps.length; i += BATCH_SIZE) {
    const batch = gaps.slice(i, i + BATCH_SIZE);
    for (const gap of batch) {
      await env.DB_EXTRACTION.prepare(
        `INSERT INTO fact_check_gaps
         (gap_id, result_id, organization_id, gap_type, severity,
          source_item, source_document_id, document_item, document_id,
          description, evidence, auto_resolved, review_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          gap.gapId,
          gap.resultId,
          gap.organizationId,
          gap.gapType,
          gap.severity,
          gap.sourceItem,
          gap.sourceDocumentId ?? null,
          gap.documentItem ?? null,
          gap.documentId ?? null,
          gap.description,
          gap.evidence ?? null,
          gap.autoResolved ? 1 : 0,
          gap.reviewStatus,
          gap.createdAt,
        )
        .run();
    }
  }

  // Step 6: Update result record
  const now = new Date().toISOString();

  await env.DB_EXTRACTION.prepare(
    `UPDATE fact_check_results
     SET status = 'completed',
         source_document_ids = ?,
         doc_document_ids = ?,
         total_source_items = ?,
         total_doc_items = ?,
         matched_items = ?,
         gap_count = ?,
         coverage_pct = ?,
         gaps_by_type = ?,
         gaps_by_severity = ?,
         match_result_json = ?,
         updated_at = ?
     WHERE result_id = ?`,
  )
    .bind(
      JSON.stringify([...sourceDocIds]),
      JSON.stringify([...docDocIds]),
      totalSourceItems,
      totalDocItems,
      matchedItemCount,
      gapCount,
      Math.round(coveragePct * 10) / 10,
      JSON.stringify(gapResult.stats.byType),
      JSON.stringify(gapResult.stats.bySeverity),
      JSON.stringify({
        matchedItems: matchResult.matchedItems,
        unmatchedSourceApis: matchResult.unmatchedSourceApis.length,
        unmatchedDocApis: matchResult.unmatchedDocApis.length,
        unmatchedSourceTables: matchResult.unmatchedSourceTables.length,
        unmatchedDocTables: matchResult.unmatchedDocTables.length,
        noiseStats: gapResult.stats.noise,
      }),
      now,
      resultId,
    )
    .run();

  // Step 7: Emit factcheck.completed event
  await env.QUEUE_PIPELINE.send({
    eventId: crypto.randomUUID(),
    occurredAt: now,
    type: "factcheck.completed",
    payload: {
      resultId,
      organizationId,
      matchedItems: matchedItemCount,
      gapCount,
      coveragePct: Math.round(coveragePct * 10) / 10,
    },
  });

  logger.info("Fact check completed", {
    resultId,
    organizationId,
    matchedItems: matchedItemCount,
    gapCount,
    coveragePct: Math.round(coveragePct * 10) / 10,
  });

  return {
    resultId,
    matchedItems: matchedItemCount,
    gapCount,
    coveragePct: Math.round(coveragePct * 10) / 10,
  };
}

/**
 * Legacy batch queue consumer — retained for backwards compatibility.
 * New deployments use svc-queue-router → POST /internal/queue-event instead.
 */
export async function handleQueueBatch(
  batch: MessageBatch<unknown>,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  for (const message of batch.messages) {
    const parseResult = PipelineEventSchema.safeParse(message.body);
    if (!parseResult.success) {
      logger.warn("Skipping invalid pipeline event message", {
        id: message.id,
        error: parseResult.error.message,
      });
      message.ack();
      continue;
    }

    if (parseResult.data.type !== "ingestion.completed") {
      message.ack();
      continue;
    }

    const event = parseResult.data;
    const { documentId } = event.payload;

    try {
      const result = await runExtraction(event, env, ctx);
      logger.info("Extraction completed", result);
      message.ack();
    } catch (e) {
      logger.error("Extraction failed", { documentId, error: String(e) });
      message.retry();
    }
  }
}
