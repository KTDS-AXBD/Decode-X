import { z } from "zod";

// ── Eval Stages ──────────────────────────────────────────────────────

export const EvalStageSchema = z.enum([
  "mechanical",
  "semantic",
  "consensus",
  "ambiguity",
  "brownfield",
]);
export type EvalStage = z.infer<typeof EvalStageSchema>;

// ── Eval Verdict ─────────────────────────────────────────────────────

export const EvalVerdictSchema = z.enum([
  "pass",
  "fail",
  "needs_review",
  "consensus_approve",
  "consensus_reject",
  "consensus_split",
  "skipped",
]);
export type EvalVerdict = z.infer<typeof EvalVerdictSchema>;

// ── Eval Issue (개별 문제 항목) ──────────────────────────────────────

export const EvalIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
  dimension: z.string().optional(),
  detail: z.string().optional(),
});
export type EvalIssue = z.infer<typeof EvalIssueSchema>;

// ── Eval Result (단일 Stage 결과) ────────────────────────────────────

export const EvalResultSchema = z.object({
  stage: EvalStageSchema,
  verdict: EvalVerdictSchema,
  score: z.number().min(0).max(1),
  issues: z.array(EvalIssueSchema),
  evaluator: z.string(),
  durationMs: z.number().int(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});
export type EvalResult = z.infer<typeof EvalResultSchema>;

// ── Eval Pipeline Result (전체 파이프라인 결과) ──────────────────────

export const EvalPipelineResultSchema = z.object({
  targetType: z.enum(["policy", "skill", "document"]),
  targetId: z.string(),
  organizationId: z.string(),
  stages: z.array(EvalResultSchema),
  finalVerdict: EvalVerdictSchema,
  finalScore: z.number().min(0).max(1),
  completedAt: z.string().datetime(),
});
export type EvalPipelineResult = z.infer<typeof EvalPipelineResultSchema>;

// ── Semantic Eval Dimensions ─────────────────────────────────────────

export const PolicySemanticDimensionSchema = z.object({
  specificity: z.number().min(0).max(1),
  consistency: z.number().min(0).max(1),
  completeness: z.number().min(0).max(1),
  actionability: z.number().min(0).max(1),
  traceability: z.number().min(0).max(1),
});
export type PolicySemanticDimension = z.infer<typeof PolicySemanticDimensionSchema>;

export const SkillSemanticDimensionSchema = z.object({
  coverage: z.number().min(0).max(1),
  coherence: z.number().min(0).max(1),
  granularity: z.number().min(0).max(1),
});
export type SkillSemanticDimension = z.infer<typeof SkillSemanticDimensionSchema>;

// ── Consensus Types ──────────────────────────────────────────────────

export const ConsensusRoleSchema = z.enum(["advocate", "devil", "judge"]);
export type ConsensusRole = z.infer<typeof ConsensusRoleSchema>;

export const ConsensusDecisionSchema = z.enum(["approve", "reject", "split"]);
export type ConsensusDecision = z.infer<typeof ConsensusDecisionSchema>;

export const ConsensusVerdictSchema = z.object({
  finalDecision: ConsensusDecisionSchema,
  rounds: z.number().int().min(1).max(2),
  advocateArgs: z.string(),
  devilArgs: z.string(),
  judgeReasoning: z.string(),
  round2Questions: z.array(z.string()).optional(),
  round2Reasoning: z.string().optional(),
});
export type ConsensusVerdict = z.infer<typeof ConsensusVerdictSchema>;

// ── Ambiguity Score Types ────────────────────────────────────────────

export const AmbiguityDimensionScoresSchema = z.object({
  goalClarity: z.number().min(0).max(1),
  constraintClarity: z.number().min(0).max(1),
  successCriteria: z.number().min(0).max(1),
});
export type AmbiguityDimensionScores = z.infer<typeof AmbiguityDimensionScoresSchema>;

export const AmbiguityResultSchema = z.object({
  ambiguityScore: z.number().min(0).max(1),
  dimensions: AmbiguityDimensionScoresSchema,
  rejected: z.boolean(),
  feedback: z.array(z.string()),
});
export type AmbiguityResult = z.infer<typeof AmbiguityResultSchema>;

// ── Brownfield Context ───────────────────────────────────────────────

export const BrownfieldContextSchema = z.object({
  existingPolicyCodes: z.array(z.string()),
  existingTerms: z.array(z.object({
    termId: z.string(),
    label: z.string(),
    termType: z.string(),
  })),
  domainDistribution: z.record(z.number()),
  totalPolicies: z.number().int(),
  totalTerms: z.number().int(),
  scannedAt: z.string().datetime(),
});
export type BrownfieldContext = z.infer<typeof BrownfieldContextSchema>;

// ── Pipeline Evaluation Record (DB row) ──────────────────────────────

export const CreatePipelineEvaluationSchema = z.object({
  targetType: z.enum(["policy", "skill", "document"]),
  targetId: z.string().min(1),
  organizationId: z.string().min(1),
  stage: EvalStageSchema,
  verdict: EvalVerdictSchema,
  score: z.number().min(0).max(1),
  issuesJson: z.string(),
  evaluator: z.string(),
  durationMs: z.number().int(),
  metadataJson: z.string().optional(),
});
export type CreatePipelineEvaluation = z.infer<typeof CreatePipelineEvaluationSchema>;
