import { describe, it, expect } from "vitest";
import { SkillMechanicalVerifier } from "./mechanical.js";
import type { SkillPackage, Policy, OntologyRef, Provenance, SkillMetadata } from "@ai-foundry/types";

function makePolicy(overrides?: Partial<Policy>): Policy {
  return {
    code: "POL-PENSION-WD-001",
    title: "테스트 정책",
    condition: "조건 내용",
    criteria: "기준 내용",
    outcome: "결과 내용",
    source: { documentId: "doc-1" },
    trust: { level: "reviewed", score: 0.8 },
    tags: ["테스트"],
    ...overrides,
  };
}

function makeSkillPackage(overrides?: Partial<SkillPackage>): SkillPackage {
  const now = new Date().toISOString();
  return {
    $schema: "https://ai-foundry.ktds.com/schemas/skill/v1",
    skillId: "550e8400-e29b-41d4-a716-446655440000",
    metadata: {
      domain: "퇴직연금",
      language: "ko",
      version: "1.0.0",
      createdAt: now,
      updatedAt: now,
      author: "test-author",
      tags: [],
    },
    policies: [makePolicy()],
    trust: { level: "reviewed", score: 0.8 },
    ontologyRef: {
      graphId: "graph-1",
      termUris: ["urn:pension:term:1"],
    },
    provenance: {
      sourceDocumentIds: ["doc-1"],
      organizationId: "org-1",
      extractedAt: now,
      pipeline: {
        stages: ["ingestion", "extraction", "policy"],
        models: { policy: "claude-opus" },
      },
    },
    adapters: {},
    ...overrides,
  };
}

describe("SkillMechanicalVerifier", () => {
  const verifier = new SkillMechanicalVerifier();

  it("valid skill package passes with score 1.0", () => {
    const result = verifier.verify(makeSkillPackage());
    expect(result.verdict).toBe("pass");
    expect(result.score).toBe(1.0);
    expect(result.stage).toBe("mechanical");
    expect(result.evaluator).toBe("mechanical");
    // May have ontology warning if termUris is non-empty — should be clean here
    const errors = result.issues.filter((i) => i.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("empty policies array fails", () => {
    const result = verifier.verify(makeSkillPackage({ policies: [] }));
    expect(result.verdict).toBe("fail");
    const issue = result.issues.find((i) => i.code === "SKILL_MECH_EMPTY_POLICIES");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
  });

  it("missing metadata fields fails", () => {
    const result = verifier.verify(
      makeSkillPackage({
        metadata: {
          domain: "",
          language: "ko",
          version: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: "",
          tags: [],
        } as SkillMetadata,
      }),
    );
    expect(result.verdict).toBe("fail");
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain("SKILL_MECH_MISSING_DOMAIN");
    expect(codes).toContain("SKILL_MECH_MISSING_VERSION");
    expect(codes).toContain("SKILL_MECH_MISSING_AUTHOR");
  });

  it("unreviewed trust policies fail", () => {
    const unreviewedPolicy = makePolicy({
      trust: { level: "unreviewed", score: 0 },
    });
    const result = verifier.verify(makeSkillPackage({ policies: [unreviewedPolicy] }));
    expect(result.verdict).toBe("fail");
    const issue = result.issues.find((i) => i.code === "SKILL_MECH_UNREVIEWED_POLICIES");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
  });

  it("empty ontologyRef.termUris triggers warning (not error)", () => {
    const result = verifier.verify(
      makeSkillPackage({
        ontologyRef: { graphId: "graph-1", termUris: [] } as OntologyRef,
      }),
    );
    const issue = result.issues.find((i) => i.code === "SKILL_MECH_EMPTY_ONTOLOGY");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("warning");
    // warnings don't cause fail
    const errors = result.issues.filter((i) => i.severity === "error");
    if (errors.length === 0) {
      expect(result.verdict).toBe("pass");
    }
  });

  it("schema validation failure on extra unknown field", () => {
    const pkg = makeSkillPackage();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pkg as any).unknownField = "should cause strict parse failure";
    const result = verifier.verify(pkg);
    expect(result.verdict).toBe("fail");
    const issue = result.issues.find((i) => i.code === "SKILL_MECH_SCHEMA_INVALID");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
  });

  it("returns valid timestamp and durationMs", () => {
    const result = verifier.verify(makeSkillPackage());
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
