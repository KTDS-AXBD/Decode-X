import { z } from "zod";
import {
  ApiItemSchema,
  TableItemSchema,
  DataFlowItemSchema,
  ErrorItemSchema,
} from "./extraction.js";

// AI Foundry Skill Spec — JSON Schema Draft 2020-12 compatible
// Policy code format: POL-{DOMAIN}-{TYPE}-{SEQ}
// e.g. POL-PENSION-WD-HOUSING-001

export const PolicyCodeSchema = z.string().regex(
  /^POL-[A-Z]+-[A-Z-]+-\d{3}$/,
  "Policy code must match POL-{DOMAIN}-{TYPE}-{SEQ} format",
);

export const TrustLevelSchema = z.enum(["unreviewed", "reviewed", "validated"]);
export type TrustLevel = z.infer<typeof TrustLevelSchema>;

export const TrustScoreSchema = z.object({
  level: TrustLevelSchema,
  score: z.number().min(0).max(1),
  reviewedBy: z.string().optional(),
  reviewedAt: z.string().datetime().optional(),
  validatedAt: z.string().datetime().optional(),
});

export type TrustScore = z.infer<typeof TrustScoreSchema>;

// Condition-criteria-outcome triple — the core policy unit
export const PolicySchema = z.object({
  code: PolicyCodeSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  condition: z.string().min(1),   // "IF" clause
  criteria: z.string().min(1),    // evaluation criteria
  outcome: z.string().min(1),     // "THEN" clause
  source: z.object({
    documentId: z.string(),
    pageRef: z.string().optional(),
    excerpt: z.string().optional(),
  }),
  trust: TrustScoreSchema,
  tags: z.array(z.string()).default([]),
});

export type Policy = z.infer<typeof PolicySchema>;

export const OntologyRefSchema = z.object({
  graphId: z.string(),
  termUris: z.array(z.string()),
  skosConceptScheme: z.string().optional(),
});

export type OntologyRef = z.infer<typeof OntologyRefSchema>;

export const ProvenanceSchema = z.object({
  sourceDocumentIds: z.array(z.string()),
  organizationId: z.string(),
  extractedAt: z.string().datetime(),
  pipeline: z.object({
    stages: z.array(z.string()),
    models: z.record(z.string()),
  }),
});

export type Provenance = z.infer<typeof ProvenanceSchema>;

export const SkillMetadataSchema = z.object({
  domain: z.string(),           // e.g. "퇴직연금"
  subdomain: z.string().optional(),
  language: z.string().default("ko"),
  version: z.string(),          // semver
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  author: z.string(),
  tags: z.array(z.string()).default([]),
});

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;

// Technical specification extracted from source artifacts (Sprint 207)
export const TechnicalSpecSchema = z.object({
  apis: z.array(ApiItemSchema).default([]),
  tables: z.array(TableItemSchema).default([]),
  dataFlows: z.array(DataFlowItemSchema).default([]),
  errors: z.array(ErrorItemSchema).default([]),
});

export type TechnicalSpec = z.infer<typeof TechnicalSpecSchema>;

export const SkillPackageSchema = z.object({
  $schema: z.string().default("https://ai-foundry.ktds.com/schemas/skill/v1"),
  skillId: z.string().uuid(),
  metadata: SkillMetadataSchema,
  policies: z.array(PolicySchema).min(1),
  trust: TrustScoreSchema,
  ontologyRef: OntologyRefSchema,
  provenance: ProvenanceSchema,
  adapters: z.object({
    mcp: z.string().optional(),      // R2 key for MCP adapter
    openapi: z.string().optional(),  // R2 key for OpenAPI adapter
  }).default({}),
  technicalSpec: TechnicalSpecSchema.optional(),
});

export type SkillPackage = z.infer<typeof SkillPackageSchema>;

// Lightweight listing type (without full policy bodies)
export type SkillSummary = Pick<SkillPackage, "skillId" | "metadata" | "trust"> & {
  policyCount: number;
  r2Key: string;
};

// ── Evaluate schemas (Phase 3) ──────────────────────────────────────

// LlmProvider/LlmProviderSchema are exported from llm.ts — reuse here
import { LlmProviderSchema as _LlmProviderSchema } from "./llm.js";

export const EvaluateRequestSchema = z.object({
  policyCode: z.string().min(1),
  context: z.string().min(1).max(10_000),
  parameters: z.record(z.unknown()).optional(),
  provider: _LlmProviderSchema.optional(),
  benchmark: z.boolean().optional(),
});

export type EvaluateRequest = z.infer<typeof EvaluateRequestSchema>;

export const EvaluateResultSchema = z.object({
  evaluationId: z.string().uuid(),
  skillId: z.string().uuid(),
  policyCode: z.string(),
  provider: z.string(),
  model: z.string(),
  result: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  latencyMs: z.number(),
});

export type EvaluateResult = z.infer<typeof EvaluateResultSchema>;

export const EvaluateBenchmarkResultSchema = z.object({
  benchmark: z.literal(true),
  results: z.array(EvaluateResultSchema),
  consensus: z.object({
    agreementRate: z.number().min(0).max(1),
    summary: z.string(),
  }),
});

export type EvaluateBenchmarkResult = z.infer<typeof EvaluateBenchmarkResultSchema>;

// ── AI-Ready 6기준 채점 (REQ-034 Deep Dive PoC) ─────────────────────

export const AI_READY_CRITERIA = [
  "machineReadable",
  "semanticConsistency",
  "testable",
  "traceable",
  "completeness",
  "humanReviewable",
] as const;

export type AiReadyCriterion = (typeof AI_READY_CRITERIA)[number];

export const CriterionScoreSchema = z.object({
  score: z.number().min(0).max(1),
  pass: z.boolean(),
  signals: z.record(z.union([z.number(), z.boolean(), z.string()])),
});
export type CriterionScore = z.infer<typeof CriterionScoreSchema>;

export const AiReadyScoreSchema = z.object({
  skillId: z.string().uuid(),
  domain: z.string(),
  criteria: z.object({
    machineReadable: CriterionScoreSchema,
    semanticConsistency: CriterionScoreSchema,
    testable: CriterionScoreSchema,
    traceable: CriterionScoreSchema,
    completeness: CriterionScoreSchema.extend({
      btq: z.object({
        business: z.number().min(0).max(1),
        technical: z.number().min(0).max(1),
        quality: z.number().min(0).max(1),
      }),
    }),
    humanReviewable: CriterionScoreSchema,
  }),
  overall: z.number().min(0).max(1),
  passAiReady: z.boolean(),
  failedCriteria: z.array(z.string()),
});
export type AiReadyScore = z.infer<typeof AiReadyScoreSchema>;

// Pass thresholds per criterion (must match scoring/ai-ready.ts)
export const AI_READY_THRESHOLDS: Record<AiReadyCriterion, number> = {
  machineReadable: 0.9,
  semanticConsistency: 0.7,
  testable: 0.7,
  traceable: 0.8,
  completeness: 0.67,
  humanReviewable: 0.6,
};

export const AI_READY_OVERALL_THRESHOLD = 0.8;

// ── CC Skill Export (REQ-025) ─────────────────────────────────────────

export const ExportCcRequestSchema = z.object({
  format: z.literal("cc-skill").default("cc-skill"),
});

export type ExportCcRequest = z.infer<typeof ExportCcRequestSchema>;

/** Metadata returned alongside the ZIP binary */
export interface ExportCcMeta {
  skillId: string;
  skillName: string;
  policyCount: number;
  zipSizeBytes: number;
  generatedAt: string;
}
