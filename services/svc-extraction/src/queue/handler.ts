/**
 * Queue consumer — ai-foundry-pipeline 큐에서 document.uploaded 이벤트를 소비한다.
 */

import { createLogger } from "@ai-foundry/utils";
import { DocumentUploadedEventSchema } from "@ai-foundry/types";
import { buildExtractionPrompt } from "../prompts/structure.js";
import { callLlm } from "../llm/caller.js";
import type { Env } from "../env.js";

interface ExtractionResult {
  processes: Array<{ name: string; description: string; steps: string[] }>;
  entities: Array<{ name: string; type: string; attributes: string[] }>;
  relationships: Array<{ from: string; to: string; type: string }>;
  rules: Array<{ condition: string; outcome: string; domain: string }>;
}

export async function handleQueueBatch(
  batch: MessageBatch<unknown>,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const logger = createLogger("svc-extraction:queue");

  for (const message of batch.messages) {
    const parseResult = DocumentUploadedEventSchema.safeParse(message.body);
    if (!parseResult.success) {
      logger.warn("Skipping non-DocumentUploadedEvent message", {
        id: message.id,
        error: parseResult.error.message,
      });
      message.ack();
      continue;
    }

    const event = parseResult.data;
    const { documentId, organizationId, originalName } = event.payload;
    const extractionId = crypto.randomUUID();
    const now = new Date().toISOString();

    logger.info("Processing document.uploaded event", { documentId, extractionId });

    try {
      // Insert pending extraction record
      await env.DB_EXTRACTION.prepare(
        `INSERT INTO extractions (id, document_id, status, created_at, updated_at)
         VALUES (?, ?, 'pending', ?, ?)`,
      )
        .bind(extractionId, documentId, now, now)
        .run();

      // Placeholder chunks — real implementation fetches parsed chunks from svc-ingestion
      const placeholderChunks = [
        `문서명: ${originalName} | 조직: ${organizationId} | 문서 파싱 진행 중입니다. 실제 청크는 svc-ingestion 연동 후 제공됩니다.`,
      ];

      const prompt = buildExtractionPrompt(placeholderChunks);
      const rawContent = await callLlm(prompt, "haiku", env.LLM_ROUTER, env.INTERNAL_API_SECRET);

      let parsed: ExtractionResult;
      try {
        parsed = JSON.parse(rawContent) as ExtractionResult;
      } catch {
        parsed = { processes: [], entities: [], relationships: [], rules: [] };
      }

      const processNodeCount =
        (parsed.processes?.length ?? 0) + (parsed.relationships?.length ?? 0);
      const entityCount = parsed.entities?.length ?? 0;
      const updatedAt = new Date().toISOString();

      ctx.waitUntil(
        env.DB_EXTRACTION.prepare(
          `UPDATE extractions
           SET status = 'completed', result_json = ?, process_node_count = ?,
               entity_count = ?, updated_at = ?
           WHERE id = ?`,
        )
          .bind(JSON.stringify(parsed), processNodeCount, entityCount, updatedAt, extractionId)
          .run(),
      );

      logger.info("Extraction completed", { extractionId, processNodeCount, entityCount });
      message.ack();
    } catch (e) {
      logger.error("Extraction failed", { extractionId, documentId, error: String(e) });
      const updatedAt = new Date().toISOString();
      ctx.waitUntil(
        env.DB_EXTRACTION.prepare(
          `UPDATE extractions SET status = 'failed', updated_at = ? WHERE id = ?`,
        )
          .bind(updatedAt, extractionId)
          .run(),
      );
      // nack so the message can be retried
      message.retry();
    }
  }
}
