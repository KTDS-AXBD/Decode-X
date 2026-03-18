/**
 * Skill Bundler — groups classified policies by category and builds
 * one SkillPackage per category using the existing skill-builder.
 */

import type { Policy, SkillPackage } from "@ai-foundry/types";
import { buildSkillPackage } from "../assembler/skill-builder.js";
import { SKILL_CATEGORIES, type SkillCategory } from "./categories.js";

export interface PolicyWithClassification {
  policy: Policy;
  classification: {
    policyId: string;
    category: SkillCategory;
    confidence: number;
  };
  ontologyId: string;
  organizationId: string;
  sourceDocumentId: string;
}

export interface BundleResult {
  category: SkillCategory;
  name: string;
  description: string;
  skillPackage: SkillPackage;
  policyCount: number;
}

/**
 * Build one SkillPackage per category from classified policies.
 * Skips the "other" category if it contains fewer than 3 items.
 */
export function buildBundles(
  items: PolicyWithClassification[],
  descriptions: Map<SkillCategory, { name: string; description: string }>,
  domain: string,
  _organizationId?: string,
): BundleResult[] {
  // Group by category
  const groups = new Map<SkillCategory, PolicyWithClassification[]>();
  for (const item of items) {
    const cat = item.classification.category;
    const list = groups.get(cat);
    if (list) {
      list.push(item);
    } else {
      groups.set(cat, [item]);
    }
  }

  const results: BundleResult[] = [];

  for (const [category, groupItems] of groups) {
    // Skip "other" with fewer than 3 items
    if (category === "other" && groupItems.length < 3) {
      continue;
    }

    const policies = groupItems.map((g) => g.policy);

    // Collect unique tags from all policies, cap at 20
    const tagSet = new Set<string>();
    for (const p of policies) {
      for (const t of p.tags) {
        tagSet.add(t);
      }
    }
    const tags = [...tagSet].slice(0, 20);

    // Gather provenance info
    const sourceDocIds = [...new Set(groupItems.map((g) => g.sourceDocumentId))];
    const orgId = groupItems[0]?.organizationId ?? "unknown";
    const ontologyIds = [...new Set(groupItems.map((g) => g.ontologyId))];

    const catMeta = SKILL_CATEGORIES[category];
    const desc = descriptions.get(category);
    const name = desc?.name ?? catMeta.label;
    const description = desc?.description ?? `${domain} ${catMeta.label} 관련 스킬`;

    const skillPackage = buildSkillPackage({
      policies,
      ontologyRef: {
        graphId: ontologyIds[0] ?? "",
        termUris: ontologyIds,
      },
      provenance: {
        sourceDocumentIds: sourceDocIds,
        organizationId: orgId,
        extractedAt: new Date().toISOString(),
        pipeline: {
          stages: ["ingestion", "extraction", "policy", "ontology", "skill"],
          models: { policy: "claude-opus", skill: "claude-sonnet" },
        },
      },
      domain,
      subdomain: category,
      version: "2.0.0",
      author: "ai-foundry-bundler",
      tags,
    });

    results.push({
      category,
      name,
      description,
      skillPackage,
      policyCount: policies.length,
    });
  }

  return results;
}
