import { z } from "zod";

// ── Request to trigger policy inference ──────────────────────────────

export const PolicyInferRequestSchema = z.object({
  extractionId: z.string(),
  documentId: z.string(),
  organizationId: z.string(),
  chunks: z.array(z.string()).min(1),
  sourceDocumentId: z.string(),
});
export type PolicyInferRequest = z.infer<typeof PolicyInferRequestSchema>;

// ── What Claude Opus returns (parsed from JSON) ─────────────────────

export const PolicyCandidateSchema = z.object({
  title: z.string(),
  condition: z.string(),
  criteria: z.string(),
  outcome: z.string(),
  policyCode: z.string(), // POL-{DOMAIN}-{TYPE}-{SEQ}
  sourcePageRef: z.string().optional(),
  sourceExcerpt: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type PolicyCandidate = z.infer<typeof PolicyCandidateSchema>;

// ── HITL review actions ─────────────────────────────────────────────

export const HitlActionSchema = z.object({
  reviewerId: z.string(),
  action: z.enum(["approve", "reject", "modify"]),
  comment: z.string().optional(),
  modifiedFields: z.record(z.string()).optional(), // for "modify" action
});
export type HitlAction = z.infer<typeof HitlActionSchema>;

// ── Bulk approve request ─────────────────────────────────────────────

export const BulkApproveRequestSchema = z.object({
  policyIds: z.array(z.string()).min(1).max(100),
  reviewerId: z.string(),
  comment: z.string().optional(),
});
export type BulkApproveRequest = z.infer<typeof BulkApproveRequestSchema>;
