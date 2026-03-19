/**
 * OpenAPI adapter route — transforms .skill.json into an OpenAPI 3.0 specification.
 *
 * Each policy in the Skill package maps to one POST /evaluate/{policyCode} endpoint.
 * The spec JSON is computed on-the-fly (projection, not stored).
 */

import type { SkillPackage, Policy } from "@ai-foundry/types";
import {
  createLogger,
  notFound,
  extractRbacContext,
  errFromUnknown,
} from "@ai-foundry/utils";
import type { Env } from "../env.js";

const logger = createLogger("svc-skill:openapi");

// ── OpenAPI 3.0 types (minimal subset) ──────────────────────────────

interface OpenApiServer {
  url: string;
  description: string;
}

interface OpenApiInfo {
  title: string;
  description: string;
  version: string;
  contact: { name: string; url?: string };
}

interface OpenApiExternalDocs {
  description: string;
  url: string;
}

interface OpenApiSchemaProperty {
  type: string;
  description: string;
  example?: string | number | boolean | Record<string, unknown>;
}

interface OpenApiSchema {
  type: string;
  properties?: Record<string, OpenApiSchemaProperty>;
  required?: string[];
  description?: string;
  example?: Record<string, unknown>;
}

interface OpenApiRequestBody {
  required: boolean;
  content: {
    "application/json": { schema: OpenApiSchema };
  };
}

interface OpenApiResponse {
  description: string;
  content?: {
    "application/json": { schema: OpenApiSchema };
  };
}

interface OpenApiOperation {
  operationId: string;
  summary: string;
  description: string;
  tags: string[];
  requestBody: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
  security: Array<Record<string, string[]>>;
}

interface OpenApiPathItem {
  post: OpenApiOperation;
}

interface OpenApiSecurityScheme {
  type: string;
  scheme: string;
  bearerFormat: string;
  description: string;
}

interface OpenApiSpec {
  openapi: "3.0.3";
  info: OpenApiInfo;
  servers?: OpenApiServer[];
  externalDocs?: OpenApiExternalDocs;
  paths: Record<string, OpenApiPathItem>;
  components: {
    securitySchemes: Record<string, OpenApiSecurityScheme>;
    schemas: Record<string, OpenApiSchema>;
  };
  tags: Array<{ name: string; description: string }>;
}

export interface OpenApiOptions {
  baseUrl?: string;
}

// ── GET /skills/:id/openapi ─────────────────────────────────────────

export async function handleGetOpenApiAdapter(
  request: Request,
  env: Env,
  skillId: string,
  ctx: ExecutionContext,
): Promise<Response> {
  const orgId = request.headers.get("X-Organization-Id") ?? "unknown";

  const row = await env.DB_SKILL.prepare(
    "SELECT r2_key FROM skills WHERE skill_id = ? AND organization_id = ?",
  )
    .bind(skillId, orgId)
    .first<{ r2_key: string }>();

  if (!row) {
    return notFound("Skill", skillId);
  }

  const r2Object = await env.R2_SKILL_PACKAGES.get(row["r2_key"]);
  if (!r2Object) {
    logger.error("R2 object not found for skill", { skillId, r2Key: row["r2_key"] });
    return notFound("Skill package file", skillId);
  }

  // Parse the stored .skill.json
  const raw = await r2Object.text();
  let skillPackage: SkillPackage;
  try {
    skillPackage = JSON.parse(raw) as SkillPackage;
  } catch (e) {
    logger.error("Failed to parse skill package JSON", { skillId, error: String(e) });
    return errFromUnknown(e);
  }

  // Transform to OpenAPI spec — derive base URL from request for servers field
  const reqUrl = new URL(request.url);
  const spec = toOpenApiSpec(skillPackage, { baseUrl: reqUrl.origin });

  // Record download asynchronously
  const rbacCtx = extractRbacContext(request);
  const downloadedBy = rbacCtx?.userId ?? "anonymous";
  const downloadId = crypto.randomUUID();
  const now = new Date().toISOString();

  ctx.waitUntil(
    env.DB_SKILL.prepare(
      `INSERT INTO skill_downloads (download_id, skill_id, downloaded_by, adapter_type, downloaded_at)
       VALUES (?, ?, ?, 'openapi', ?)`,
    )
      .bind(downloadId, skillId, downloadedBy, now)
      .run(),
  );

  return new Response(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Transformation ───────────────────────────────────────────────────

function policyToPathItem(policy: Policy): OpenApiPathItem {
  return {
    post: {
      operationId: `evaluate_${policy.code.toLowerCase().replace(/-/g, "_")}`,
      summary: policy.title,
      description: [
        `**Condition**: ${policy.condition}`,
        `**Criteria**: ${policy.criteria}`,
        `**Outcome**: ${policy.outcome}`,
      ].join("\n\n"),
      tags: ["evaluate"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/EvaluateRequest" } as unknown as OpenApiSchema,
          },
        },
      },
      responses: {
        "200": {
          description: "Policy evaluation result",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/EvaluateResponse" } as unknown as OpenApiSchema,
            },
          },
        },
        "400": { description: "Invalid request" },
        "401": { description: "Unauthorized" },
        "404": { description: "Policy not found" },
      },
      security: [{ bearerAuth: [] }],
    },
  };
}

export function toOpenApiSpec(pkg: SkillPackage, options?: OpenApiOptions): OpenApiSpec {
  const { metadata } = pkg;
  const subdomain = metadata.subdomain;
  const domainLabel = `${metadata.domain}${subdomain ? ` / ${subdomain}` : ""}`;

  const paths: Record<string, OpenApiPathItem> = {};
  for (const policy of pkg.policies) {
    const pathKey = `/evaluate/${policy.code.toLowerCase()}`;
    paths[pathKey] = policyToPathItem(policy);
  }

  // Build first policy example for schema samples
  const samplePolicy = pkg.policies[0];
  const contextExample = samplePolicy
    ? `${samplePolicy.condition} 상황에서의 판단 요청`
    : "정책 평가 대상 상황 설명";

  const spec: OpenApiSpec = {
    openapi: "3.0.3",
    info: {
      title: `AI Foundry Skill: ${domainLabel}`,
      description: [
        `Auto-generated OpenAPI spec from AI Foundry Skill package (\`${pkg.skillId}\`).`,
        `Contains ${pkg.policies.length} policy evaluation endpoint(s).`,
        "",
        `**Domain**: ${metadata.domain}`,
        subdomain ? `**Subdomain**: ${subdomain}` : "",
        `**Organization**: ${pkg.provenance.organizationId}`,
        `**Trust Level**: ${pkg.trust.level} (score: ${pkg.trust.score})`,
      ].filter(Boolean).join("\n"),
      version: metadata.version,
      contact: {
        name: metadata.author,
        url: "https://ai-foundry.minu.best",
      },
    },
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "AI Foundry access token (issued by svc-security)",
        },
      },
      schemas: {
        EvaluateRequest: {
          type: "object",
          properties: {
            context: {
              type: "string",
              description: "적용 대상의 상황 설명",
              example: contextExample,
            },
            parameters: {
              type: "object",
              description: "판단에 필요한 추가 파라미터 (key-value pairs)",
            },
          },
          required: ["context"],
          example: {
            context: contextExample,
            parameters: { amount: 1000000, tenure_years: 5 },
          },
        },
        EvaluateResponse: {
          type: "object",
          properties: {
            result: {
              type: "string",
              description: "정책 평가 결과 (pass / fail / conditional)",
              example: "pass",
            },
            confidence: {
              type: "number",
              description: "평가 신뢰도 (0-1)",
              example: 0.85,
            },
            reasoning: {
              type: "string",
              description: "평가 근거 설명",
              example: "조건을 충족하여 정책 통과",
            },
          },
          required: ["result", "confidence"],
          example: {
            result: "pass",
            confidence: 0.85,
            reasoning: "조건을 충족하여 정책 통과",
          },
        },
      },
    },
    tags: [
      {
        name: "evaluate",
        description: `Policy evaluation endpoints for ${domainLabel}`,
      },
    ],
  };

  // Add servers if baseUrl is provided
  if (options?.baseUrl) {
    spec.servers = [
      { url: options.baseUrl, description: "Current environment" },
    ];
  }

  spec.externalDocs = {
    description: "AI Foundry Platform Documentation",
    url: "https://ai-foundry.minu.best",
  };

  return spec;
}
