/**
 * svc-analytics — SVC-10
 * Analytics: KPI aggregation, business dashboards, cost tracking, report management
 *
 * Routes:
 *   POST /internal/queue-event        — process pipeline events for metric aggregation
 *   GET  /kpi                         — KPI summary (pipeline metrics)
 *   GET  /cost                        — LLM cost breakdown by tier
 *   GET  /dashboards                  — combined dashboard (pipeline + cost + usage)
 *   GET  /quality                     — quality metrics (parsing, extraction, policy, skill)
 *   GET  /reports/sections            — list report sections for org
 *   PUT  /reports/sections/:key       — upsert report section content
 *   DELETE /reports/sections/:key     — delete report section
 *   POST /reports/sections/seed       — seed initial report content
 *   POST /reports/snapshots           — create versioned snapshot
 *   GET  /reports/snapshots           — list snapshots for org
 *   GET  /reports/snapshots/:version  — get specific snapshot
 *   GET  /reports/export/markdown     — export as markdown document
 *   GET  /reports/benchmark          — cross-org benchmark comparison
 *   GET  /deliverables/export/interface-spec  — D1 인터페이스 명세서 export
 *   GET  /deliverables/export/business-rules  — D2 업무규칙 정의서 export
 *   GET  /deliverables/export/glossary        — D3 용어사전 export
 *   GET  /deliverables/export/gap-report      — D4 Gap 분석 보고서 export
 *   GET  /deliverables/export/comparison      — D5 As-Is vs To-Be 비교 export
 *   GET  /deliverables/export/all             — D1~D5 통합 export
 */

import { createLogger, unauthorized, verifyInternalSecret, errFromUnknown, notFound, extractRbacContext, checkPermission, logAudit } from "@ai-foundry/utils";
import { processQueueEvent } from "./routes/queue.js";
import { handleGetKpi, handleGetCost, handleGetDashboard } from "./routes/kpi.js";
import { handleGetQuality } from "./routes/quality.js";
import {
  handleGetSections, handleUpsertSection, handleDeleteSection, handleSeedSections,
  handleCreateSnapshot, handleListSnapshots, handleGetSnapshot,
  handleExportMarkdown,
} from "./routes/reports.js";
import { handleGetBenchmark } from "./routes/benchmark.js";
import {
  handleExportInterfaceSpec, handleExportBusinessRules, handleExportGlossary,
  handleExportGapReport, handleExportComparison, handleExportAll,
} from "./routes/deliverables.js";
import type { Env } from "./env.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const logger = createLogger("svc-analytics");
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    // Health check — no auth required
    if (method === "GET" && path === "/health") {
      return new Response(
        JSON.stringify({
          service: env.SERVICE_NAME,
          status: "ok",
          timestamp: new Date().toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // All other routes require inter-service secret
    if (!verifyInternalSecret(request, env.INTERNAL_API_SECRET)) {
      logger.warn("Unauthorized request", { path, method });
      return unauthorized("Missing or invalid X-Internal-Secret");
    }

    try {
      // POST /internal/queue-event
      if (method === "POST" && path === "/internal/queue-event") {
        return processQueueEvent(request, env, ctx);
      }

      // GET /kpi
      if (method === "GET" && path === "/kpi") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "analytics", "read");
          if (denied) return denied;
        }
        return handleGetKpi(request, env);
      }

      // GET /cost
      if (method === "GET" && path === "/cost") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "analytics", "read");
          if (denied) return denied;
        }
        return handleGetCost(request, env);
      }

      // GET /dashboards
      if (method === "GET" && path === "/dashboards") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "analytics", "read");
          if (denied) return denied;
          ctx.waitUntil(logAudit(env, {
            userId: rbacCtx.userId,
            organizationId: rbacCtx.organizationId,
            action: "read",
            resource: "analytics",
          }));
        }
        return handleGetDashboard(request, env);
      }

      // GET /quality
      if (method === "GET" && path === "/quality") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "analytics", "read");
          if (denied) return denied;
        }
        return handleGetQuality(request, env);
      }

      // ─── Report Management ───
      const reportsMatch = path.match(/^\/reports\//);
      if (reportsMatch) {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "analytics", method === "GET" ? "read" : "create");
          if (denied) return denied;
        }

        // GET /reports/sections
        if (method === "GET" && path === "/reports/sections") {
          return handleGetSections(request, env);
        }
        // POST /reports/sections/seed (must be before :sectionKey match)
        if (method === "POST" && path === "/reports/sections/seed") {
          return handleSeedSections(request, env);
        }
        // PUT /reports/sections/:sectionKey
        const sectionMatch = path.match(/^\/reports\/sections\/([^/]+)$/);
        const sectionKey = sectionMatch?.[1];
        if (sectionKey && method === "PUT") {
          return handleUpsertSection(request, env, decodeURIComponent(sectionKey));
        }
        // DELETE /reports/sections/:sectionKey
        if (sectionKey && method === "DELETE") {
          return handleDeleteSection(request, env, decodeURIComponent(sectionKey));
        }
        // POST /reports/snapshots
        if (method === "POST" && path === "/reports/snapshots") {
          return handleCreateSnapshot(request, env);
        }
        // GET /reports/snapshots (list)
        if (method === "GET" && path === "/reports/snapshots") {
          return handleListSnapshots(request, env);
        }
        // GET /reports/snapshots/:version
        const snapMatch = path.match(/^\/reports\/snapshots\/([^/]+)$/);
        const snapVersion = snapMatch?.[1];
        if (method === "GET" && snapVersion) {
          return handleGetSnapshot(request, env, decodeURIComponent(snapVersion));
        }
        // GET /reports/export/markdown
        if (method === "GET" && path === "/reports/export/markdown") {
          return handleExportMarkdown(request, env);
        }
        // GET /reports/benchmark
        if (method === "GET" && path === "/reports/benchmark") {
          return handleGetBenchmark(request, env);
        }
      }

      // ─── Deliverable Export (AIF-REQ-017) ───
      const deliverableMatch = path.match(/^\/deliverables\//);
      if (deliverableMatch) {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "analytics", "read");
          if (denied) return denied;
        }

        if (method === "GET" && path === "/deliverables/export/interface-spec") {
          return handleExportInterfaceSpec(request, env);
        }
        if (method === "GET" && path === "/deliverables/export/business-rules") {
          return handleExportBusinessRules(request, env);
        }
        if (method === "GET" && path === "/deliverables/export/glossary") {
          return handleExportGlossary(request, env);
        }
        if (method === "GET" && path === "/deliverables/export/gap-report") {
          return handleExportGapReport(request, env);
        }
        if (method === "GET" && path === "/deliverables/export/comparison") {
          return handleExportComparison(request, env);
        }
        if (method === "GET" && path === "/deliverables/export/all") {
          return handleExportAll(request, env);
        }
      }

      return notFound("route", path);
    } catch (e) {
      logger.error("Unhandled error", { error: String(e), path, method });
      return errFromUnknown(e);
    }
  },
} satisfies ExportedHandler<Env>;
