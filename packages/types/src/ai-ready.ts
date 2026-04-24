import { z } from "zod";

// LLM-based AI-Ready evaluation types (F356-A).
// Distinct from rule-based AiReadyScore in skill.ts.

export const AIReadyCriterion = z.enum([
  "source_consistency",     // 1. 소스코드 정합성
  "comment_doc_alignment",  // 2. 주석·문서 일치
  "io_structure",           // 3. 입출력 구조 명확성
  "exception_handling",     // 4. 예외·에러 핸들링
  "srp_reusability",        // 5. 업무루틴 분리·재사용성
  "testability",            // 6. 테스트 가능성 및 단위테스트 적합성
]);
export type AIReadyCriterion = z.infer<typeof AIReadyCriterion>;

export const ALL_AI_READY_CRITERIA = AIReadyCriterion.options;

export const AIReadyScoreSchema = z.object({
  criterion: AIReadyCriterion,
  score: z.number().min(0).max(1),
  rationale: z.string().min(20).max(2000),
  passThreshold: z.literal(0.75).default(0.75),
  passed: z.boolean(),
});
export type AIReadyScore = z.infer<typeof AIReadyScoreSchema>;

export const AIReadyEvaluationSchema = z.object({
  skillId: z.string().min(1),
  skillName: z.string(),
  criteria: z.array(AIReadyScoreSchema).length(6),
  totalScore: z.number().min(0).max(1),
  passCount: z.number().int().min(0).max(6),
  overallPassed: z.boolean(),   // passCount >= 4
  modelVersion: z.string(),
  evaluatedAt: z.string().datetime(),
  costUsd: z.number().nonnegative(),
});
export type AIReadyEvaluation = z.infer<typeof AIReadyEvaluationSchema>;

export const AIReadyBatchReportSchema = z.object({
  executedAt: z.string().datetime(),
  modelVersion: z.string(),
  totalSkills: z.number().int().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  evaluations: z.array(AIReadyEvaluationSchema),
});
export type AIReadyBatchReport = z.infer<typeof AIReadyBatchReportSchema>;

// ── F356-B: API request/response schemas ──────────────────────────────

export const AIReadyModelSchema = z.enum(["haiku", "opus", "sonnet"]);
export type AIReadyModel = z.infer<typeof AIReadyModelSchema>;

export const AIReadySingleEvalRequestSchema = z.object({
  model: AIReadyModelSchema,
  force: z.boolean().default(false),
});
export type AIReadySingleEvalRequest = z.infer<typeof AIReadySingleEvalRequestSchema>;

export const AIReadyBatchTriggerRequestSchema = z.object({
  model: AIReadyModelSchema,
  organizationId: z.string().min(1),
  crossCheckSampleSize: z.number().int().nonnegative().default(0),
  dryRun: z.boolean().default(false),
});
export type AIReadyBatchTriggerRequest = z.infer<typeof AIReadyBatchTriggerRequestSchema>;

export const AIReadyBatchStatusSchema = z.object({
  batchId: z.string(),
  status: z.enum(["queued", "running", "completed", "failed", "partial"]),
  totalSkills: z.number().int(),
  completedSkills: z.number().int(),
  failedSkills: z.number().int(),
  progressPct: z.number(),
  totalCostUsd: z.number(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  childBatchId: z.string().nullable(),
  avgScore: z.number().nullable(),
});
export type AIReadyBatchStatus = z.infer<typeof AIReadyBatchStatusSchema>;

export const AIReadyBatchTriggerResponseSchema = z.object({
  batchId: z.string(),
  totalSkills: z.number().int(),
  estimatedCostUsd: z.number(),
  estimatedDurationMinutes: z.number(),
  crossCheckBatchId: z.string().nullable(),
  status: z.literal("queued"),
});
export type AIReadyBatchTriggerResponse = z.infer<typeof AIReadyBatchTriggerResponseSchema>;
