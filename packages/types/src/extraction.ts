import { z } from "zod";

// ── Business 4축 (기존) ─────────────────────────────────────────────

export const ProcessItemSchema = z.object({
  name: z.string(),
  description: z.string(),
  steps: z.array(z.string()),
});

export const EntityItemSchema = z.object({
  name: z.string(),
  type: z.string(),
  attributes: z.array(z.string()),
});

export const RelationshipItemSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.string(),
});

export const RuleItemSchema = z.object({
  condition: z.string(),
  outcome: z.string(),
  domain: z.string(),
});

// ── Technical 4축 (신규) ────────────────────────────────────────────

export const ApiItemSchema = z.object({
  endpoint: z.string(),
  method: z.string(),
  requestSchema: z.string().optional(),
  responseSchema: z.string().optional(),
  description: z.string().optional(),
});

export const TableColumnSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean().optional(),
  foreignKey: z.string().optional(),
});

export const TableItemSchema = z.object({
  name: z.string(),
  columns: z.array(TableColumnSchema),
  description: z.string().optional(),
});

export const DataFlowItemSchema = z.object({
  source: z.string(),
  target: z.string(),
  type: z.enum(["call", "import", "event", "query"]),
  description: z.string().optional(),
});

export const ErrorItemSchema = z.object({
  code: z.string().optional(),
  exception: z.string().optional(),
  path: z.string().optional(),
  handling: z.string().optional(),
  severity: z.enum(["critical", "warning", "info"]).optional(),
});

// ── ExtractionResult (Business + Technical) ─────────────────────────

export const ExtractionResultSchema = z.object({
  // Business 4축
  processes: z.array(ProcessItemSchema),
  entities: z.array(EntityItemSchema),
  relationships: z.array(RelationshipItemSchema),
  rules: z.array(RuleItemSchema),
  // Technical 4축 (optional — 하위 호환)
  apis: z.array(ApiItemSchema).optional(),
  tables: z.array(TableItemSchema).optional(),
  dataFlows: z.array(DataFlowItemSchema).optional(),
  errors: z.array(ErrorItemSchema).optional(),
});

// ── Type Exports ────────────────────────────────────────────────────

export type ProcessItem = z.infer<typeof ProcessItemSchema>;
export type EntityItem = z.infer<typeof EntityItemSchema>;
export type RelationshipItem = z.infer<typeof RelationshipItemSchema>;
export type RuleItem = z.infer<typeof RuleItemSchema>;
export type ApiItem = z.infer<typeof ApiItemSchema>;
export type TableColumn = z.infer<typeof TableColumnSchema>;
export type TableItem = z.infer<typeof TableItemSchema>;
export type DataFlowItem = z.infer<typeof DataFlowItemSchema>;
export type ErrorItem = z.infer<typeof ErrorItemSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
