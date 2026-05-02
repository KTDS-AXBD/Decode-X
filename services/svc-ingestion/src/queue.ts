import { createLogger } from "@ai-foundry/utils";
import { PipelineEventSchema } from "@ai-foundry/types";
import type { Env } from "./env.js";
import { parseDocument, isTimeoutError, type UnstructuredElement } from "./parsing/unstructured.js";
import { parseXlsx, detectSiSubtype } from "./parsing/xlsx.js";
import { parseScreenDesign } from "./parsing/screen-design.js";
import { classifyDocument, classifyXlsxElements, classifySourceElements } from "./parsing/classifier.js";
import { maskText } from "./parsing/masking.js";
import { validateFileFormat, isScdsa002Encrypted, classifyParseError, type ErrorType } from "./parsing/validator.js";
import { extractSourceFiles, parseSourceProject, parseSingleJavaFile, parseSingleSqlFile } from "./parsing/zip-extractor.js";
import { splitPdfIfNeeded, getSmallerChunkSize } from "./parsing/pdf-splitter.js";
import { splitPptxIfNeeded, getSmallerPptxChunkSize } from "./parsing/pptx-splitter.js";

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
  txt: "text/plain",
  // v0.7.4: Source code MIME types
  zip: "application/zip",
  java: "text/x-java-source",
  sql: "application/sql",
};

const MAX_ELEMENTS = 200;
const MAX_ELEMENTS_XLSX = 500;
const MAX_ELEMENTS_SOURCE = 1000;

/**
 * Process a single queue event delivered via HTTP from the queue router.
 * Parses the body with PipelineEventSchema, processes document.uploaded events,
 * and returns a Response.
 */
export async function processQueueEvent(body: unknown, env: Env, _ctx: ExecutionContext): Promise<Response> {
  const logger = createLogger("svc-ingestion");

  const parsed = PipelineEventSchema.safeParse(body);

  if (!parsed.success) {
    logger.warn("Invalid pipeline event", { error: parsed.error.message });
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "invalid_event" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (parsed.data.type !== "document.uploaded") {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "not_our_event" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const event = parsed.data;
  const { documentId, organizationId, r2Key, originalName, fileType } = event.payload;

  try {
    const parseStart = Date.now();

    // 1. Fetch file bytes from R2
    const r2Object = await env.R2_DOCUMENTS.get(r2Key);
    if (!r2Object) {
      logger.error("R2 object not found", { documentId, r2Key });
      await env.DB_INGESTION.prepare(
        "UPDATE documents SET status = 'failed', error_message = ? WHERE document_id = ?",
      )
        .bind("R2 object not found: " + r2Key, documentId)
        .run();
      return new Response(JSON.stringify({ ok: false, error: "r2_object_not_found" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const fileBytes = await r2Object.arrayBuffer();
    const mimeType = MIME_MAP[fileType] ?? "application/octet-stream";

    // 2. Validate file format via magic bytes
    const validation = validateFileFormat(fileBytes, fileType);
    if (!validation.valid) {
      // Distinguish SCDSA002-encrypted files from generic format errors
      const isScdsa = isScdsa002Encrypted(fileBytes);
      const errType: ErrorType = isScdsa ? "encrypted_scdsa002" : "format_invalid";
      const docStatus = isScdsa ? "encrypted" : "failed";

      if (isScdsa) {
        logger.warn("Samsung SDS encrypted file (SCDSA002) — skipping parse", {
          documentId,
          fileType,
          originalName,
        });
      } else {
        logger.warn("File format invalid", { documentId, fileType, error: validation.error });
      }

      await env.DB_INGESTION.prepare(
        "UPDATE documents SET status = ?, error_message = ?, error_type = ? WHERE document_id = ?",
      )
        .bind(docStatus, validation.error ?? "Unknown format", errType, documentId)
        .run();
      return new Response(
        JSON.stringify({ ok: false, error: errType, detail: validation.error }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    if (fileBytes.byteLength > 2 * 1024 * 1024) {
      logger.info("Large file detected", { documentId, sizeMB: (fileBytes.byteLength / (1024 * 1024)).toFixed(1) });
    }

    // 3. Parse: source code / xlsx / PDF (with split) / PPTX (with split) / other via Unstructured.io
    const isXlsx = fileType === "xlsx" || fileType === "xls";
    const isSourceCode = fileType === "java" || fileType === "sql" || fileType === "zip";
    const isPdf = fileType === "pdf";
    const isPptx = fileType === "pptx" || fileType === "ppt";
    let elements;
    if (isSourceCode) {
      elements = parseSourceCodeFiles(fileBytes, originalName, fileType);
    } else if (isXlsx) {
      const siSubtype = detectSiSubtype(originalName);
      elements = siSubtype === "화면설계"
        ? parseScreenDesign(fileBytes, originalName)
        : parseXlsx(fileBytes, originalName);
    } else if (isPdf) {
      elements = await parsePdfWithSplit(fileBytes, originalName, mimeType, env, documentId, logger);
    } else if (isPptx) {
      elements = await parsePptxWithSplit(fileBytes, originalName, mimeType, env, documentId, logger);
    } else {
      elements = await parseDocument(fileBytes, originalName, mimeType, env);
    }

    // 4. Classify
    const classification = isSourceCode
      ? classifySourceElements(elements)
      : isXlsx
        ? classifyXlsxElements(elements)
        : classifyDocument(elements, fileType);

    // 5. Insert chunks (source: max 1000, xlsx: max 500, others: max 200, skip blank text)
    const maxElements = isSourceCode ? MAX_ELEMENTS_SOURCE : isXlsx ? MAX_ELEMENTS_XLSX : MAX_ELEMENTS;
    let chunkIndex = 0;
    for (const element of elements.slice(0, maxElements)) {
      const text = element.text.trim();
      if (!text) continue;

      const maskedText = await maskText(
        documentId,
        text,
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

    // 6. Update document status -> parsed
    await env.DB_INGESTION.prepare(
      "UPDATE documents SET status = 'parsed' WHERE document_id = ?",
    )
      .bind(documentId)
      .run();

    // 7. Publish ingestion.completed
    await env.QUEUE_PIPELINE.send({
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      type: "ingestion.completed",
      payload: {
        documentId,
        organizationId,
        chunkCount: chunkIndex,
        classification: classification.category,
        r2Key,
        parseDurationMs: Date.now() - parseStart,
        chunksValid: chunkIndex,
      },
    });

    logger.info("Document parsed", {
      documentId,
      chunkCount: chunkIndex,
      classification: classification.category,
      confidence: classification.confidence,
    });

    return new Response(JSON.stringify({ ok: true, documentId, chunkCount: chunkIndex }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const errorType = classifyParseError(e);
    logger.error("Queue event processing failed", { documentId, error: String(e), errorType });

    await env.DB_INGESTION.prepare(
      "UPDATE documents SET status = 'failed', error_message = ?, error_type = ? WHERE document_id = ?",
    )
      .bind(String(e).slice(0, 500), errorType, documentId)
      .run();

    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Parse a PDF with automatic splitting for large files.
 * If the PDF exceeds size/page thresholds, splits into chunks and parses each.
 * On timeout, retries with smaller chunk sizes (adaptive splitting).
 */
async function parsePdfWithSplit(
  fileBytes: ArrayBuffer,
  originalName: string,
  mimeType: string,
  env: Env,
  documentId: string,
  logger: ReturnType<typeof createLogger>,
): Promise<UnstructuredElement[]> {
  let splitResult;
  try {
    splitResult = await splitPdfIfNeeded(fileBytes);
  } catch (splitErr) {
    logger.warn("PDF split failed, falling back to direct parse", {
      documentId,
      error: String(splitErr),
    });
    return parseDocument(fileBytes, originalName, mimeType, env);
  }

  if (!splitResult.wasSplit) {
    return parseDocument(fileBytes, originalName, mimeType, env);
  }

  logger.info("Parsing large PDF in chunks", {
    documentId,
    totalPages: splitResult.totalPages,
    chunkCount: splitResult.chunks.length,
  });

  const allElements: UnstructuredElement[] = [];

  for (const chunk of splitResult.chunks) {
    const chunkName = `${originalName}__pages_${chunk.startPage}-${chunk.endPage}`;
    try {
      const chunkElements = await parseDocument(chunk.bytes, chunkName, mimeType, env);
      allElements.push(...chunkElements);
      logger.info("Chunk parsed", {
        documentId,
        chunkIndex: chunk.index,
        pages: `${chunk.startPage}-${chunk.endPage}`,
        elementCount: chunkElements.length,
      });
    } catch (e) {
      if (!(e instanceof Error) || !isTimeoutError(e)) throw e;

      // Adaptive retry: split this chunk further
      const smallerSize = getSmallerChunkSize(chunk.endPage - chunk.startPage + 1);
      if (smallerSize === null) {
        logger.warn("Chunk too small to split further, skipping", {
          documentId,
          pages: `${chunk.startPage}-${chunk.endPage}`,
        });
        continue;
      }

      logger.info("Chunk timed out, retrying with smaller split", {
        documentId,
        pages: `${chunk.startPage}-${chunk.endPage}`,
        newPagesPerChunk: smallerSize,
      });

      const subSplit = await splitPdfIfNeeded(chunk.bytes, smallerSize);
      for (const subChunk of subSplit.chunks) {
        const subName = `${originalName}__pages_${chunk.startPage + subChunk.startPage - 1}-${chunk.startPage + subChunk.endPage - 1}`;
        try {
          const subElements = await parseDocument(subChunk.bytes, subName, mimeType, env);
          allElements.push(...subElements);
        } catch (subErr) {
          logger.warn("Sub-chunk also failed, skipping", {
            documentId,
            subPages: `${subChunk.startPage}-${subChunk.endPage}`,
            error: String(subErr),
          });
        }
      }
    }
  }

  logger.info("Large PDF parse complete", {
    documentId,
    totalPages: splitResult.totalPages,
    totalElements: allElements.length,
  });

  return allElements;
}

/**
 * Parse a PPTX with automatic splitting for large files.
 * If the PPTX exceeds size/slide thresholds, splits into chunks and parses each.
 * On timeout, retries with smaller chunk sizes (adaptive splitting).
 */
async function parsePptxWithSplit(
  fileBytes: ArrayBuffer,
  originalName: string,
  mimeType: string,
  env: Env,
  documentId: string,
  logger: ReturnType<typeof createLogger>,
): Promise<UnstructuredElement[]> {
  let splitResult;
  try {
    splitResult = await splitPptxIfNeeded(fileBytes);
  } catch (splitErr) {
    logger.warn("PPTX split failed, falling back to direct parse", {
      documentId,
      error: String(splitErr),
    });
    return parseDocument(fileBytes, originalName, mimeType, env);
  }

  if (!splitResult.wasSplit) {
    return parseDocument(fileBytes, originalName, mimeType, env);
  }

  logger.info("Parsing large PPTX in chunks", {
    documentId,
    totalSlides: splitResult.totalSlides,
    chunkCount: splitResult.chunks.length,
  });

  const allElements: UnstructuredElement[] = [];

  for (const chunk of splitResult.chunks) {
    const chunkName = `${originalName}__slides_${chunk.startSlide}-${chunk.endSlide}`;
    try {
      const chunkElements = await parseDocument(chunk.bytes, chunkName, mimeType, env);
      allElements.push(...chunkElements);
      logger.info("PPTX chunk parsed", {
        documentId,
        chunkIndex: chunk.index,
        slides: `${chunk.startSlide}-${chunk.endSlide}`,
        elementCount: chunkElements.length,
      });
    } catch (e) {
      if (!(e instanceof Error) || !isTimeoutError(e)) throw e;

      const smallerSize = getSmallerPptxChunkSize(chunk.endSlide - chunk.startSlide + 1);
      if (smallerSize === null) {
        logger.warn("PPTX chunk too small to split further, skipping", {
          documentId,
          slides: `${chunk.startSlide}-${chunk.endSlide}`,
        });
        continue;
      }

      logger.info("PPTX chunk timed out, retrying with smaller split", {
        documentId,
        slides: `${chunk.startSlide}-${chunk.endSlide}`,
        newSlidesPerChunk: smallerSize,
      });

      const subSplit = await splitPptxIfNeeded(chunk.bytes, smallerSize);
      for (const subChunk of subSplit.chunks) {
        const subName = `${originalName}__slides_${chunk.startSlide + subChunk.startSlide - 1}-${chunk.startSlide + subChunk.endSlide - 1}`;
        try {
          const subElements = await parseDocument(subChunk.bytes, subName, mimeType, env);
          allElements.push(...subElements);
        } catch (subErr) {
          logger.warn("PPTX sub-chunk also failed, skipping", {
            documentId,
            subSlides: `${subChunk.startSlide}-${subChunk.endSlide}`,
            error: String(subErr),
          });
        }
      }
    }
  }

  logger.info("Large PPTX parse complete", {
    documentId,
    totalSlides: splitResult.totalSlides,
    totalElements: allElements.length,
  });

  return allElements;
}

function parseSourceCodeFiles(
  fileBytes: ArrayBuffer,
  originalName: string,
  fileType: string,
): UnstructuredElement[] {
  if (fileType === "zip") {
    const { files, stats } = extractSourceFiles(fileBytes);
    const projectName = originalName.replace(/\.zip$/i, "");
    return parseSourceProject(files, projectName, stats);
  }
  if (fileType === "java") {
    const source = new TextDecoder("utf-8").decode(fileBytes);
    return parseSingleJavaFile(source, originalName);
  }
  if (fileType === "sql") {
    const source = new TextDecoder("utf-8").decode(fileBytes);
    return parseSingleSqlFile(source, originalName);
  }
  return [];
}
