import { describe, it, expect, vi } from "vitest";
import type { Policy } from "@ai-foundry/types";
import { buildBundles, type PolicyWithClassification } from "./bundler.js";
import type { SkillCategory } from "./categories.js";

vi.mock("../assembler/skill-builder.js", () => ({
  buildSkillPackage: vi.fn((params) => ({
    $schema: "https://ai-foundry.ktds.com/schemas/skill/v1",
    skillId: "mock-uuid",
    metadata: {
      domain: params.domain,
      subdomain: params.subdomain,
      tags: params.tags ?? [],
      version: params.version,
      language: "ko",
      createdAt: "",
      updatedAt: "",
      author: params.author,
    },
    policies: params.policies,
    trust: { level: "reviewed", score: 0 },
    ontologyRef: params.ontologyRef,
    provenance: params.provenance,
    adapters: {},
  })),
}));

// ── Test fixtures ──────────────────────────────────────────────────

function makePolicy(code: string, tags: string[] = ["태그"]): Policy {
  return {
    code,
    title: "테스트 정책",
    condition: "조건",
    criteria: "기준",
    outcome: "결과",
    source: { documentId: "doc-1" },
    trust: { level: "reviewed", score: 0.8 },
    tags,
  };
}

function makeItem(
  category: SkillCategory,
  policyCode: string,
  tags: string[] = ["태그"],
): PolicyWithClassification {
  return {
    policy: makePolicy(policyCode, tags),
    classification: { policyId: policyCode, category, confidence: 0.9 },
    ontologyId: "onto-1",
    organizationId: "org-1",
    sourceDocumentId: "doc-1",
  };
}

const emptyDescriptions = new Map<SkillCategory, { name: string; description: string }>();

// ── buildBundles ──────────────────────────────────────────────────

describe("buildBundles", () => {
  it("groups items by category and builds one SkillPackage per group", () => {
    const items: PolicyWithClassification[] = [
      makeItem("charging", "POL-GV-CHG-001"),
      makeItem("charging", "POL-GV-CHG-002"),
      makeItem("payment", "POL-GV-PAY-001"),
    ];

    const results = buildBundles(items, emptyDescriptions, "온누리상품권");

    expect(results).toHaveLength(2);
    const categories = results.map((r) => r.category).sort();
    expect(categories).toEqual(["charging", "payment"]);

    const charging = results.find((r) => r.category === "charging");
    expect(charging?.policyCount).toBe(2);
    expect(charging?.skillPackage.metadata.subdomain).toBe("charging");
    expect(charging?.skillPackage.metadata.version).toBe("2.0.0");
    expect(charging?.skillPackage.metadata.author).toBe("ai-foundry-bundler");
  });

  it("skips 'other' category when it has fewer than 3 items", () => {
    const items: PolicyWithClassification[] = [
      makeItem("other", "POL-GV-OTH-001"),
      makeItem("other", "POL-GV-OTH-002"),
      makeItem("charging", "POL-GV-CHG-001"),
    ];

    const results = buildBundles(items, emptyDescriptions, "온누리상품권");

    expect(results).toHaveLength(1);
    expect(results[0]?.category).toBe("charging");
  });

  it("includes 'other' category when it has 3 or more items", () => {
    const items: PolicyWithClassification[] = [
      makeItem("other", "POL-GV-OTH-001"),
      makeItem("other", "POL-GV-OTH-002"),
      makeItem("other", "POL-GV-OTH-003"),
    ];

    const results = buildBundles(items, emptyDescriptions, "온누리상품권");

    expect(results).toHaveLength(1);
    expect(results[0]?.category).toBe("other");
    expect(results[0]?.policyCount).toBe(3);
  });

  it("returns empty array for empty input", () => {
    const results = buildBundles([], emptyDescriptions, "온누리상품권");
    expect(results).toEqual([]);
  });

  it("collects unique tags from policies and caps at 20", () => {
    // Create items with many unique tags
    const items: PolicyWithClassification[] = [];
    for (let i = 0; i < 5; i++) {
      const tags = Array.from({ length: 6 }, (_, j) => `tag-${i}-${j}`);
      items.push(makeItem("charging", `POL-GV-CHG-${String(i).padStart(3, "0")}`, tags));
    }
    // 5 items × 6 unique tags = 30 total unique tags

    const results = buildBundles(items, emptyDescriptions, "온누리상품권");

    expect(results).toHaveLength(1);
    const tags = results[0]?.skillPackage.metadata.tags ?? [];
    expect(tags.length).toBeLessThanOrEqual(20);
    // All tags should be unique
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("uses description from descriptions map when available", () => {
    const items: PolicyWithClassification[] = [
      makeItem("charging", "POL-GV-CHG-001"),
    ];
    const descriptions = new Map<SkillCategory, { name: string; description: string }>([
      ["charging", { name: "충전 스킬", description: "충전 관련 정책 모음" }],
    ]);

    const results = buildBundles(items, descriptions, "온누리상품권");

    expect(results[0]?.name).toBe("충전 스킬");
    expect(results[0]?.description).toBe("충전 관련 정책 모음");
  });
});
