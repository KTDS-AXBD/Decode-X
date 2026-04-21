import type { SkillPackage, Policy } from "@ai-foundry/types";
import type { SpecContainerInput, SpecContainerPolicy } from "./types.js";

// BP-001 → POL-{DOMAIN}-{TYPE}-001 형식으로 변환
// specContainerId = "lpon-purchase" → domain="LPON", type="PURCHASE"
function toPolicyCode(
  rawCode: string,
  specContainerId: string,
  seq: number,
): string {
  // 이미 POL-* 형식이면 그대로
  if (/^POL-[A-Z]+-[A-Z-]+-\d{3}$/.test(rawCode)) return rawCode;

  // specContainerId 파싱: "lpon-purchase" → ["lpon","purchase"]
  const parts = specContainerId.split("-");
  const domain = (parts[0] ?? "UNKNOWN").toUpperCase();
  const type = parts.slice(1).join("-").toUpperCase() || "GEN";
  const seqStr = String(seq).padStart(3, "0");
  return `POL-${domain}-${type}-${seqStr}`;
}

function mapPolicy(
  p: SpecContainerPolicy,
  specContainerId: string,
  idx: number,
  orgId: string,
): Policy {
  const code = toPolicyCode(p.code, specContainerId, idx + 1);
  return {
    code,
    title: p.title,
    condition: p.condition,
    criteria: p.criteria,
    outcome: p.outcome,
    source: {
      documentId: `${specContainerId}-rules`,
      excerpt: `${p.condition} → ${p.outcome}`,
    },
    trust: {
      level: "reviewed",
      score: p.confidence,
      reviewedBy: `spec-container-import/${orgId}`,
    },
    tags: [],
  };
}

export function convertSpecContainerToSkillPackage(
  input: SpecContainerInput,
): SkillPackage {
  const now = new Date().toISOString();
  const skillId = crypto.randomUUID();

  const policies = input.policies.map((p, i) =>
    mapPolicy(p, input.specContainerId, i, input.orgId),
  );

  // trust score = average policy confidence
  const avgConfidence =
    input.policies.reduce((s, p) => s + p.confidence, 0) /
    Math.max(1, input.policies.length);

  return {
    $schema: "https://ai-foundry.ktds.com/schemas/skill/v1",
    skillId,
    metadata: {
      domain: input.domain,
      ...(input.subdomain !== undefined ? { subdomain: input.subdomain } : {}),
      language: "ko",
      version: input.version,
      createdAt: now,
      updatedAt: now,
      author: input.author,
      tags: [...input.tags, "spec-container-import"],
    },
    policies,
    trust: {
      level: "reviewed",
      score: avgConfidence,
      reviewedBy: `spec-container-import/${input.orgId}`,
    },
    ontologyRef: {
      graphId: `spec-container:${input.specContainerId}`,
      termUris: [],
    },
    provenance: {
      sourceDocumentIds: [input.specContainerId],
      organizationId: input.orgId,
      // Normalize to UTC ISO 8601 (Zod datetime() requires Z or +00:00)
      extractedAt: new Date(input.provenance.extractedAt || now).toISOString(),
      pipeline: {
        stages: ["spec-container-import"],
        models: {},
      },
    },
    adapters: {},
  };
}
