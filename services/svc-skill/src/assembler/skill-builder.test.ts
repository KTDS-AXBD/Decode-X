import { describe, it, expect } from "vitest";
import { aggregateTrust, buildSkillPackage, type SkillBuildParams } from "./skill-builder.js";
import type { Policy, OntologyRef, Provenance } from "@ai-foundry/types";

// ── Test fixtures ──────────────────────────────────────────────────

function makePolicy(overrides?: Partial<Policy>): Policy {
  return {
    code: "POL-PENSION-WD-001",
    title: "테스트 정책",
    condition: "조건",
    criteria: "기준",
    outcome: "결과",
    source: { documentId: "doc-1" },
    trust: { level: "reviewed", score: 0.8 },
    tags: ["테스트"],
    ...overrides,
  };
}

const baseOntologyRef: OntologyRef = {
  graphId: "graph-1",
  termUris: ["urn:pension:term:1"],
};

const baseProvenance: Provenance = {
  sourceDocumentIds: ["doc-1"],
  organizationId: "org-1",
  extractedAt: "2026-02-28T00:00:00.000Z",
  pipeline: {
    stages: ["ingestion", "extraction", "policy"],
    models: { policy: "claude-opus" },
  },
};

function makeParams(overrides?: Partial<SkillBuildParams>): SkillBuildParams {
  return {
    policies: [makePolicy()],
    ontologyRef: baseOntologyRef,
    provenance: baseProvenance,
    domain: "퇴직연금",
    version: "1.0.0",
    author: "test-author",
    ...overrides,
  };
}

// ── aggregateTrust ──────────────────────────────────────────────────

describe("aggregateTrust", () => {
  it("returns unreviewed/0 for empty array", () => {
    const result = aggregateTrust([]);
    expect(result.level).toBe("unreviewed");
    expect(result.score).toBe(0);
  });

  it("returns reviewed when all policies are reviewed", () => {
    const policies = [
      makePolicy({ trust: { level: "reviewed", score: 0.7 } }),
      makePolicy({ trust: { level: "reviewed", score: 0.9 } }),
    ];
    const result = aggregateTrust(policies);
    expect(result.level).toBe("reviewed");
    expect(result.score).toBe(0.8);
  });

  it("returns validated when all policies are validated", () => {
    const policies = [
      makePolicy({ trust: { level: "validated", score: 1.0 } }),
      makePolicy({ trust: { level: "validated", score: 0.9 } }),
    ];
    const result = aggregateTrust(policies);
    expect(result.level).toBe("validated");
    expect(result.score).toBe(0.95);
  });

  it("returns unreviewed when any policy is unreviewed", () => {
    const policies = [
      makePolicy({ trust: { level: "validated", score: 1.0 } }),
      makePolicy({ trust: { level: "unreviewed", score: 0.0 } }),
    ];
    const result = aggregateTrust(policies);
    expect(result.level).toBe("unreviewed");
    expect(result.score).toBe(0.5);
  });

  it("returns reviewed for mix of reviewed + validated", () => {
    const policies = [
      makePolicy({ trust: { level: "validated", score: 0.95 } }),
      makePolicy({ trust: { level: "reviewed", score: 0.8 } }),
    ];
    const result = aggregateTrust(policies);
    expect(result.level).toBe("reviewed");
    expect(result.score).toBe(0.875);
  });

  it("rounds score to 3 decimal places", () => {
    const policies = [
      makePolicy({ trust: { level: "reviewed", score: 0.1 } }),
      makePolicy({ trust: { level: "reviewed", score: 0.2 } }),
      makePolicy({ trust: { level: "reviewed", score: 0.3 } }),
    ];
    const result = aggregateTrust(policies);
    // (0.1 + 0.2 + 0.3) / 3 = 0.2000...
    expect(result.score).toBe(0.2);
  });

  it("handles single policy", () => {
    const policies = [makePolicy({ trust: { level: "validated", score: 0.95 } })];
    const result = aggregateTrust(policies);
    expect(result.level).toBe("validated");
    expect(result.score).toBe(0.95);
  });
});

// ── buildSkillPackage ──────────────────────────────────────────────

describe("buildSkillPackage", () => {
  it("builds a valid SkillPackage with required fields", () => {
    const pkg = buildSkillPackage(makeParams());
    expect(pkg.skillId).toBeDefined();
    expect(pkg.metadata.domain).toBe("퇴직연금");
    expect(pkg.metadata.version).toBe("1.0.0");
    expect(pkg.metadata.author).toBe("test-author");
    expect(pkg.metadata.language).toBe("ko");
    expect(pkg.policies).toHaveLength(1);
    expect(pkg.trust.level).toBe("reviewed");
    expect(pkg.ontologyRef).toEqual(baseOntologyRef);
    expect(pkg.provenance).toEqual(baseProvenance);
  });

  it("generates unique skillId on each call", () => {
    const pkg1 = buildSkillPackage(makeParams());
    const pkg2 = buildSkillPackage(makeParams());
    expect(pkg1.skillId).not.toBe(pkg2.skillId);
  });

  it("includes optional subdomain", () => {
    const pkg = buildSkillPackage(makeParams({ subdomain: "중도인출" }));
    expect(pkg.metadata.subdomain).toBe("중도인출");
  });

  it("omits subdomain when not provided", () => {
    const pkg = buildSkillPackage(makeParams());
    expect(pkg.metadata.subdomain).toBeUndefined();
  });

  it("includes custom tags", () => {
    const pkg = buildSkillPackage(makeParams({ tags: ["퇴직연금", "인출"] }));
    expect(pkg.metadata.tags).toEqual(["퇴직연금", "인출"]);
  });

  it("defaults to empty tags", () => {
    const pkg = buildSkillPackage(makeParams());
    expect(pkg.metadata.tags).toEqual([]);
  });

  it("overrides language", () => {
    const pkg = buildSkillPackage(makeParams({ language: "en" }));
    expect(pkg.metadata.language).toBe("en");
  });

  it("sets timestamps to current time", () => {
    const before = new Date().toISOString();
    const pkg = buildSkillPackage(makeParams());
    const after = new Date().toISOString();
    expect(pkg.metadata.createdAt >= before).toBe(true);
    expect(pkg.metadata.createdAt <= after).toBe(true);
    expect(pkg.metadata.updatedAt).toBe(pkg.metadata.createdAt);
  });

  it("aggregates trust from policies", () => {
    const policies = [
      makePolicy({ trust: { level: "reviewed", score: 0.7 } }),
      makePolicy({
        code: "POL-PENSION-EN-001",
        trust: { level: "reviewed", score: 0.9 },
      }),
    ];
    const pkg = buildSkillPackage(makeParams({ policies }));
    expect(pkg.trust.level).toBe("reviewed");
    expect(pkg.trust.score).toBe(0.8);
  });

  it("includes $schema field", () => {
    const pkg = buildSkillPackage(makeParams());
    expect(pkg.$schema).toBe("https://ai-foundry.ktds.com/schemas/skill/v1");
  });

  it("initializes adapters as empty object", () => {
    const pkg = buildSkillPackage(makeParams());
    expect(pkg.adapters).toEqual({});
  });
});
