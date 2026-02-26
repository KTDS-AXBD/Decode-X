import { createLogger } from "@ai-foundry/utils";
import { PipelineEventSchema } from "@ai-foundry/types";
import type { Env } from "./env.js";
import { parseDocument } from "./parsing/unstructured.js";
import { classifyDocument } from "./parsing/classifier.js";
import { maskText } from "./parsing/masking.js";

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

const MAX_ELEMENTS = 50;

export async function handleQueue(
  batch: MessageBatch<unknown>,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  const logger = createLogger("svc-ingestion");

  for (const message of batch.messages) {
    const parsed = PipelineEventSchema.safeParse(message.body);

    if (!parsed.success || parsed.data.type !== "document.uploaded") {
      // Not our event type — ack and skip
      message.ack();
      continue;
    }

    const event = parsed.data;
    const { documentId, organizationId, r2Key, originalName, fileType } = event.payload;

    try {
      // 1. Fetch file bytes from R2
      const r2Object = await env.R2_DOCUMENTS.get(r2Key);
      if (!r2Object) {
        logger.error("R2 object not found", { documentId, r2Key });
        await env.DB_INGESTION.prepare(
          "UPDATE documents SET status = 'failed' WHERE document_id = ?",
        )
          .bind(documentId)
          .run();
        message.ack();
        continue;
      }

      const fileBytes = await r2Object.arrayBuffer();
      const mimeType = MIME_MAP[fileType] ?? "application/octet-stream";

      // 2. Parse with Unstructured.io
      const elements = await parseDocument(fileBytes, originalName, mimeType, env);

      // 3. Classify
      const classification = classifyDocument(elements, fileType);

      // 4. Insert chunks (max 50, skip blank text)
      let chunkIndex = 0;
      for (const element of elements.slice(0, MAX_ELEMENTS)) {
        const text = element.text.trim();
        if (!text) continue;

        const maskedText = await maskText(
          documentId,
          text,
          env.SECURITY,
          env.INTERNAL_API_SECRET,
        );

        const chunkId = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        const wordCount = text.split(/\s+/).filter(Boolean).length;

        await env.DB_INGESTION.prepare(
          `INSERT INTO document_chunks
            (chunk_id, document_id, organization_id, chunk_index, element_type, masked_text, classification, word_count, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            chunkId,
            documentId,
            organizationId,
            chunkIndex,
            element.type,
            maskedText,
            classification.category,
            wordCount,
            createdAt,
          )
          .run();

        chunkIndex++;
      }

      // 5. Update document status → parsed
      await env.DB_INGESTION.prepare(
        "UPDATE documents SET status = 'parsed' WHERE document_id = ?",
      )
        .bind(documentId)
        .run();

      logger.info("Document parsed", {
        documentId,
        chunkCount: chunkIndex,
        classification: classification.category,
        confidence: classification.confidence,
      });

      message.ack();
    } catch (e) {
      logger.error("Queue processing failed", { documentId, error: String(e) });

      await env.DB_INGESTION.prepare(
        "UPDATE documents SET status = 'failed' WHERE document_id = ?",
      )
        .bind(documentId)
        .run();

      message.ack();
    }
  }
}
