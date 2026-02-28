/**
 * Skill assembler — builds a validated SkillPackage from confirmed policies
 * and ontology references.
 */

import {
  SkillPackageSchema,
  type Policy,
  type OntologyRef,
  type Provenance,
  type SkillPackage,
  type TrustScore,
} from "@ai-foundry/types";

export interface SkillBuildParams {
  policies: Policy[];
  ontologyRef: OntologyRef;
  provenance: Provenance;
  domain: string;
  subdomain?: string;
  language?: string;
  version: string;
  author: string;
  tags?: string[];
}

/**
 * Compute aggregate trust score from individual policy trust scores.
 * Uses the average of all policy scores.
 * Trust level is determined by the minimum trust level across all policies.
 */
function aggregateTrust(policies: Policy[]): TrustScore {
  if (policies.length === 0) {
    return { level: "unreviewed", score: 0 };
  }

  const total = policies.reduce((sum, p) => sum + p.trust.score, 0);
  const avgScore = total / policies.length;

  // Trust level: validated only if all are validated, reviewed if all reviewed+, else unreviewed
  const allValidated = policies.every((p) => p.trust.level === "validated");
  const anyUnreviewed = policies.some((p) => p.trust.level === "unreviewed");
  const level = allValidated ? "validated" : anyUnreviewed ? "unreviewed" : "reviewed";

  return { level, score: Math.round(avgScore * 1000) / 1000 };
}

export function buildSkillPackage(params: SkillBuildParams): SkillPackage {
  const { policies, ontologyRef, provenance, domain, version, author } = params;

  const now = new Date().toISOString();
  const skillId = crypto.randomUUID();
  const trust = aggregateTrust(policies);

  const raw = {
    $schema: "https://ai-foundry.ktds.com/schemas/skill/v1",
    skillId,
    metadata: {
      domain,
      ...(params.subdomain !== undefined ? { subdomain: params.subdomain } : {}),
      language: params.language ?? "ko",
      version,
      createdAt: now,
      updatedAt: now,
      author,
      tags: params.tags ?? [],
    },
    policies,
    trust,
    ontologyRef,
    provenance,
    adapters: {},
  };

  const parsed = SkillPackageSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`SkillPackage validation failed: ${parsed.error.message}`);
  }

  return parsed.data;
}
