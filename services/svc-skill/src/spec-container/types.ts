import { z } from "zod";

export const SpecContainerSourceSchema = z.object({
  type: z.enum(["reverse-engineering", "inference"]),
  path: z.string().optional(),
  section: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export const SpecContainerProvenanceSchema = z.object({
  skillId: z.string(),
  extractedAt: z.string(),
  extractedBy: z.string(),
  sources: z.array(SpecContainerSourceSchema).min(1),
});

export const SpecContainerPolicySchema = z.object({
  code: z.string(),
  title: z.string().min(1),
  condition: z.string().min(1),
  criteria: z.string().min(1),
  outcome: z.string().min(1),
  confidence: z.number().min(0).max(1).default(0.75),
});

export const SpecContainerTestScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const SpecContainerInputSchema = z.object({
  specContainerId: z.string().min(1),
  orgId: z.string().min(1),
  provenance: SpecContainerProvenanceSchema,
  policies: z.array(SpecContainerPolicySchema).min(1),
  testScenarios: z.array(SpecContainerTestScenarioSchema).default([]),
  domain: z.string().min(1),
  subdomain: z.string().optional(),
  version: z.string().default("1.0.0"),
  author: z.string().default("Decode-X spec-container-import"),
  tags: z.array(z.string()).default([]),
});

export type SpecContainerInput = z.infer<typeof SpecContainerInputSchema>;
export type SpecContainerPolicy = z.infer<typeof SpecContainerPolicySchema>;
