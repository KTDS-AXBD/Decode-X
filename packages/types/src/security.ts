import { z } from "zod";

// ---------------------------------------------------------------------------
// PII entity types recognised by the masking pipeline
// ---------------------------------------------------------------------------

export const PiiEntityTypeSchema = z.enum([
  "PII_SSN",        // 주민등록번호 (000000-0000000)
  "PII_PHONE",      // 전화번호 (010-0000-0000)
  "PII_EMAIL",      // 이메일 주소
  "PII_ACCOUNT",    // 금융 계좌번호
  "PII_CORP_ID",    // 법인등록번호 (000000-0000000)
  "PII_CARD",       // 카드번호
]);

export type PiiEntityType = z.infer<typeof PiiEntityTypeSchema>;

// ---------------------------------------------------------------------------
// Mask request / response (used by svc-ingestion → svc-security)
// ---------------------------------------------------------------------------

export const MaskRequestSchema = z.object({
  documentId: z.string().min(1),
  text: z.string().min(1),
  /** Confidential: masking only (no LLM). Internal: mask then LLM. Public: pass-through. */
  dataClassification: z.enum(["confidential", "internal", "public"]).default("internal"),
});

export type MaskRequest = z.infer<typeof MaskRequestSchema>;

export const MaskedTokenSchema = z.object({
  token: z.string(),       // e.g. [PII:SSN:a1b2c3]
  entityType: PiiEntityTypeSchema,
  position: z.number().int(),   // character offset in original text
});

export type MaskedToken = z.infer<typeof MaskedTokenSchema>;

export const MaskResponseSchema = z.object({
  documentId: z.string(),
  maskedText: z.string(),
  tokenCount: z.number().int(),
  tokens: z.array(MaskedTokenSchema),
  dataClassification: z.enum(["confidential", "internal", "public"]),
});

export type MaskResponse = z.infer<typeof MaskResponseSchema>;

// ---------------------------------------------------------------------------
// Token lookup (for audit/debug — never returns original value)
// ---------------------------------------------------------------------------

export const TokenLookupRequestSchema = z.object({
  tokens: z.array(z.string()).min(1).max(500),
});

export type TokenLookupRequest = z.infer<typeof TokenLookupRequestSchema>;

export const TokenInfoSchema = z.object({
  token: z.string(),
  entityType: PiiEntityTypeSchema,
  documentId: z.string(),
  createdAt: z.string(),
});

export type TokenInfo = z.infer<typeof TokenInfoSchema>;
