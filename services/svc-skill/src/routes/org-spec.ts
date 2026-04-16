/**
 * Org Spec routes — Org 단위 B/T/Q 종합 Spec 문서 생성 API
 *
 * GET /admin/org-spec/:orgId/:type
 *   type = business | technical | quality | all
 *   ?format=json|markdown (default: json)
 *   ?llm=true|false (default: true)
 *   ?limit=50 (max 100)
 */
import { ok, badRequest, notFound, createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";
import {
  generateOrgSpec,
  generateAllOrgSpecs,
  type SpecType,
} from "../spec-gen/index.js";
import { renderOrgSpecToMarkdown } from "../spec-gen/markdown-renderer.js";

const logger = createLogger("svc-skill:org-spec");

const VALID_TYPES = new Set<string>(["business", "technical", "quality", "all"]);

export async function handleOrgSpec(
  request: Request,
  env: Env,
  orgId: string,
  type: string,
): Promise<Response> {
  if (!VALID_TYPES.has(type)) {
    return badRequest(`Invalid spec type: ${type}. Must be one of: business, technical, quality, all`);
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "json";
  const useLlm = url.searchParams.get("llm") !== "false";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 100);

  logger.info("Generating org spec", { orgId, type, format, useLlm, limit });

  if (type === "all") {
    const docs = await generateAllOrgSpecs(env, orgId, { useLlm, limit });
    if (!docs) {
      return notFound("No skills found for this organization");
    }

    if (format === "markdown") {
      const md = docs.map((d) => renderOrgSpecToMarkdown(d)).join("\n\n===\n\n");
      return new Response(md, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${orgId}-all-spec.md"`,
        },
      });
    }

    return ok({ organizationId: orgId, specs: docs });
  }

  const doc = await generateOrgSpec(env, orgId, type as SpecType, { useLlm, limit });
  if (!doc) {
    return notFound("No skills found for this organization");
  }

  if (format === "markdown") {
    const md = renderOrgSpecToMarkdown(doc);
    return new Response(md, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${orgId}-${type}-spec.md"`,
      },
    });
  }

  return ok(doc);
}
