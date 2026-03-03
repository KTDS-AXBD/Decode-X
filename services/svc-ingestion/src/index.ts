import { createLogger, ok, unauthorized, notFound, badRequest, verifyInternalSecret, errFromUnknown, extractRbacContext, checkPermission, logAudit } from "@ai-foundry/utils";
import type { DocumentUploadedEvent } from "@ai-foundry/types";
import type { Env } from "./env.js";
import { handleHealth } from "./routes/health.js";
import { handleUpload, handleGetDocument } from "./routes/upload.js";
import { processQueueEvent } from "./queue.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const logger = createLogger("svc-ingestion");
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    // Health check — no auth required
    if (method === "GET" && path === "/health") {
      return handleHealth();
    }

    // All other routes require inter-service secret
    if (!verifyInternalSecret(request, env.INTERNAL_API_SECRET)) {
      logger.warn("Unauthorized request", { path, method });
      return unauthorized("Missing or invalid X-Internal-Secret");
    }

    try {
      // POST /internal/queue-event — queue router delivers events here
      if (method === "POST" && path === "/internal/queue-event") {
        const body: unknown = await request.json();
        return await processQueueEvent(body, env, ctx);
      }

      // POST /documents — upload a new document
      if (method === "POST" && path === "/documents") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "document", "upload");
          if (denied) return denied;
          ctx.waitUntil(logAudit(env, {
            userId: rbacCtx.userId,
            organizationId: rbacCtx.organizationId,
            action: "upload",
            resource: "document",
          }));
        }
        return await handleUpload(request, env, ctx);
      }

      // GET /documents — list documents for an organization
      if (method === "GET" && path === "/documents") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "document", "read");
          if (denied) return denied;
        }
        const orgId = request.headers.get("X-Organization-Id") ?? "unknown";
        const limit = Number(url.searchParams.get("limit") ?? "50");
        const offset = Number(url.searchParams.get("offset") ?? "0");

        const countResult = await env.DB_INGESTION.prepare(
          "SELECT COUNT(*) as cnt FROM documents WHERE organization_id = ?",
        ).bind(orgId).first<{ cnt: number }>();
        const total = countResult?.cnt ?? 0;

        const { results } = await env.DB_INGESTION.prepare(
          `SELECT document_id, organization_id, uploaded_by, r2_key, file_type,
                  file_size_byte, original_name, status, uploaded_at,
                  error_message, error_type
           FROM documents WHERE organization_id = ?
           ORDER BY uploaded_at DESC LIMIT ? OFFSET ?`,
        )
          .bind(orgId, limit, offset)
          .all<{
            document_id: string;
            organization_id: string;
            uploaded_by: string;
            r2_key: string;
            file_type: string;
            file_size_byte: number;
            original_name: string;
            status: string;
            uploaded_at: string;
            error_message: string | null;
            error_type: string | null;
          }>();
        return Response.json({ success: true, data: { documents: results, total } });
      }

      // GET /documents/:id/download — serve original file from R2
      const downloadMatch = path.match(/^\/documents\/([^/]+)\/download$/);
      if (method === "GET" && downloadMatch) {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "document", "read");
          if (denied) return denied;
        }
        const documentId = downloadMatch[1];
        if (!documentId) {
          return new Response("Not Found", { status: 404 });
        }
        const doc = await env.DB_INGESTION.prepare(
          "SELECT r2_key, original_name, file_type FROM documents WHERE document_id = ?",
        ).bind(documentId).first<{ r2_key: string; original_name: string; file_type: string }>();
        if (!doc) {
          return Response.json({ success: false, error: { code: "NOT_FOUND", message: "Document not found" } }, { status: 404 });
        }
        const r2Object = await env.R2_DOCUMENTS.get(doc.r2_key);
        if (!r2Object) {
          return Response.json({ success: false, error: { code: "NOT_FOUND", message: "File not found in storage" } }, { status: 404 });
        }
        const headers = new Headers();
        headers.set("Content-Type", r2Object.httpMetadata?.contentType ?? "application/octet-stream");
        headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(doc.original_name)}`);
        if (r2Object.size !== undefined) {
          headers.set("Content-Length", String(r2Object.size));
        }
        return new Response(r2Object.body, { status: 200, headers });
      }

      // GET /documents/:id/chunks — retrieve parsed chunks for a document
      const chunksMatch = path.match(/^\/documents\/([^/]+)\/chunks$/);
      if (method === "GET" && chunksMatch) {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "document", "read");
          if (denied) return denied;
        }
        const documentId = chunksMatch[1];
        if (!documentId) {
          return new Response("Not Found", { status: 404 });
        }
        const { results } = await env.DB_INGESTION.prepare(
          `SELECT chunk_id, chunk_index, element_type, masked_text, classification, word_count
           FROM document_chunks WHERE document_id = ? ORDER BY chunk_index`,
        )
          .bind(documentId)
          .all<{
            chunk_id: string;
            chunk_index: number;
            element_type: string;
            masked_text: string;
            classification: string;
            word_count: number;
          }>();
        return Response.json({ success: true, data: { documentId, chunks: results } });
      }

      // DELETE /documents/:id — delete a failed/encrypted document
      const deleteMatch = path.match(/^\/documents\/([^/]+)$/);
      if (method === "DELETE" && deleteMatch) {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "document", "delete");
          if (denied) return denied;
        }
        const documentId = deleteMatch[1];
        if (!documentId) {
          return new Response("Not Found", { status: 404 });
        }
        const doc = await env.DB_INGESTION.prepare(
          "SELECT status, r2_key FROM documents WHERE document_id = ?",
        ).bind(documentId).first<{ status: string; r2_key: string }>();
        if (!doc) return notFound(`Document '${documentId}' not found`);
        if (doc.status !== "failed" && doc.status !== "encrypted") {
          return badRequest("Only failed or encrypted documents can be deleted");
        }
        await env.DB_INGESTION.prepare("DELETE FROM document_chunks WHERE document_id = ?").bind(documentId).run();
        await env.DB_INGESTION.prepare("DELETE FROM documents WHERE document_id = ?").bind(documentId).run();
        await env.R2_DOCUMENTS.delete(doc.r2_key);
        logger.info("Document deleted", { documentId, status: doc.status });
        return ok({ documentId, deleted: true });
      }

      // POST /documents/:id/reprocess — reprocess a failed/encrypted document
      const reprocessMatch = path.match(/^\/documents\/([^/]+)\/reprocess$/);
      if (method === "POST" && reprocessMatch) {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "document", "update");
          if (denied) return denied;
        }
        const documentId = reprocessMatch[1];
        if (!documentId) {
          return new Response("Not Found", { status: 404 });
        }
        const doc = await env.DB_INGESTION.prepare(
          "SELECT status, organization_id, uploaded_by, r2_key, file_type, file_size_byte, original_name FROM documents WHERE document_id = ?",
        ).bind(documentId).first<{
          status: string;
          organization_id: string;
          uploaded_by: string;
          r2_key: string;
          file_type: string;
          file_size_byte: number;
          original_name: string;
        }>();
        if (!doc) return notFound(`Document '${documentId}' not found`);
        if (doc.status !== "failed" && doc.status !== "encrypted") {
          return badRequest("Only failed or encrypted documents can be reprocessed");
        }
        await env.DB_INGESTION.prepare("DELETE FROM document_chunks WHERE document_id = ?").bind(documentId).run();
        await env.DB_INGESTION.prepare(
          "UPDATE documents SET status = 'pending', error_message = NULL, error_type = NULL WHERE document_id = ?",
        ).bind(documentId).run();

        const event: DocumentUploadedEvent = {
          eventId: crypto.randomUUID(),
          occurredAt: new Date().toISOString(),
          type: "document.uploaded",
          payload: {
            documentId,
            organizationId: doc.organization_id,
            uploadedBy: doc.uploaded_by,
            r2Key: doc.r2_key,
            fileType: doc.file_type as DocumentUploadedEvent["payload"]["fileType"],
            fileSizeByte: doc.file_size_byte,
            originalName: doc.original_name,
          },
        };
        await env.QUEUE_PIPELINE.send(event);
        logger.info("Document reprocess initiated", { documentId });
        return ok({ documentId, status: "pending", reprocessing: true });
      }

      // GET /documents/:id
      const docMatch = path.match(/^\/documents\/([^/]+)$/);
      if (method === "GET" && docMatch) {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "document", "read");
          if (denied) return denied;
        }
        const documentId = docMatch[1];
        if (!documentId) {
          return new Response("Not Found", { status: 404 });
        }
        return await handleGetDocument(request, env, documentId);
      }

      return new Response("Not Found", { status: 404 });
    } catch (e) {
      logger.error("Unhandled error", { error: String(e), path, method });
      return errFromUnknown(e);
    }
  },
} satisfies ExportedHandler<Env>;
