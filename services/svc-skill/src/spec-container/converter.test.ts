import { describe, it, expect } from "vitest";
import { convertSpecContainerToSkillPackage } from "./converter.js";
import { SkillPackageSchema } from "@ai-foundry/types";
import { scoreTraceable, scoreSemanticConsistency } from "../scoring/ai-ready.js";
import type { SpecContainerInput } from "./types.js";

const baseInput: SpecContainerInput = {
  specContainerId: "lpon-purchase",
  orgId: "org-lpon-001",
  provenance: {
    skillId: "POL-LPON-PURCHASE-001",
    extractedAt: "2026-04-21T00:00:00+09:00",
    extractedBy: "Decode-X Sprint 219",
    sources: [{ type: "reverse-engineering", confidence: 0.8 }],
  },
  policies: [
    {
      code: "BP-001",
      title: "구매 한도 검증",
      condition: "이용자가 상품권 구매를 요청하는 경우",
      criteria: "구매 금액 > 0 AND 구매 금액 ≤ 1회 구매 한도",
      outcome: "결제 처리 진행 후 신규 상품권 발행",
      confidence: 0.85,
    },
    {
      code: "BP-002",
      title: "결제 완료 후 상품권 발행",
      condition: "구매 결제가 정상 완료된 경우",
      criteria: "결제 프로세스가 에러 없이 종료됨",
      outcome: "상품권 발행 (vouchers INSERT)",
      confidence: 0.9,
    },
  ],
  domain: "LPON",
  subdomain: "PURCHASE",
  version: "1.0.0",
  author: "Decode-X",
  tags: ["lpon", "voucher"],
  testScenarios: [],
};

describe("convertSpecContainerToSkillPackage", () => {
  it("produces a valid SkillPackage", () => {
    const pkg = convertSpecContainerToSkillPackage(baseInput);
    const result = SkillPackageSchema.safeParse(pkg);
    expect(result.success, JSON.stringify(result)).toBe(true);
  });

  it("assigns UUID skillId", () => {
    const pkg = convertSpecContainerToSkillPackage(baseInput);
    expect(pkg.skillId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("normalizes BP-* codes to POL-LPON-PURCHASE-NNN", () => {
    const pkg = convertSpecContainerToSkillPackage(baseInput);
    expect(pkg.policies[0]?.code).toBe("POL-LPON-PURCHASE-001");
    expect(pkg.policies[1]?.code).toBe("POL-LPON-PURCHASE-002");
  });

  it("preserves already-formatted POL-* codes", () => {
    const input: SpecContainerInput = {
      ...baseInput,
      policies: [
        {
          ...baseInput.policies[0]!,
          code: "POL-LPON-PURCHASE-099",
        },
      ],
    };
    const pkg = convertSpecContainerToSkillPackage(input);
    expect(pkg.policies[0]?.code).toBe("POL-LPON-PURCHASE-099");
  });

  it("computes average trust score", () => {
    const pkg = convertSpecContainerToSkillPackage(baseInput);
    // (0.85 + 0.9) / 2 = 0.875
    expect(pkg.trust.score).toBeCloseTo(0.875, 5);
  });

  it("includes spec-container-import tag", () => {
    const pkg = convertSpecContainerToSkillPackage(baseInput);
    expect(pkg.metadata.tags).toContain("spec-container-import");
  });

  it("sets orgId in provenance", () => {
    const pkg = convertSpecContainerToSkillPackage(baseInput);
    expect(pkg.provenance.organizationId).toBe("org-lpon-001");
  });

  // F393: TR patch (P1~P3) — Traceable score 0.30 → 1.00
  it("P1: policy source.documentId matches specContainerId when source has no path", () => {
    const pkg = convertSpecContainerToSkillPackage(baseInput);
    expect(pkg.policies[0]?.source.documentId).toBe("lpon-purchase");
    expect(pkg.policies[1]?.source.documentId).toBe("lpon-purchase");
  });

  it("P1: policy source.documentId uses source path when available", () => {
    const input: SpecContainerInput = {
      ...baseInput,
      provenance: {
        ...baseInput.provenance,
        sources: [
          { type: "reverse-engineering", path: "/lpon/rules.yaml", confidence: 0.8 },
        ],
      },
    };
    const pkg = convertSpecContainerToSkillPackage(input);
    expect(pkg.policies[0]?.source.documentId).toBe("/lpon/rules.yaml");
  });

  it("P2: sourceDocumentIds derived from source paths (fallback: specContainerId)", () => {
    const pkg = convertSpecContainerToSkillPackage(baseInput);
    expect(pkg.provenance.sourceDocumentIds).toEqual(["lpon-purchase"]);
  });

  it("P2: sourceDocumentIds contains multiple paths when sources have paths", () => {
    const input: SpecContainerInput = {
      ...baseInput,
      provenance: {
        ...baseInput.provenance,
        sources: [
          { type: "reverse-engineering", path: "/lpon/rules.yaml", confidence: 0.8 },
          { type: "inference", path: "/lpon/spec.yaml", confidence: 0.7 },
        ],
      },
    };
    const pkg = convertSpecContainerToSkillPackage(input);
    expect(pkg.provenance.sourceDocumentIds).toEqual([
      "/lpon/rules.yaml",
      "/lpon/spec.yaml",
    ]);
  });

  it("P3: pipeline.stages has 4 entries (stageOk ≥ 3)", () => {
    const pkg = convertSpecContainerToSkillPackage(baseInput);
    expect(pkg.provenance.pipeline.stages).toHaveLength(4);
    expect(pkg.provenance.pipeline.stages).toContain("spec-container-import");
    expect(pkg.provenance.pipeline.stages).toContain("ingestion");
  });

  it("P1~P3: TR score reaches 1.00", () => {
    const pkg = convertSpecContainerToSkillPackage(baseInput);
    const tr = scoreTraceable(pkg);
    expect(tr.score).toBeCloseTo(1.0, 3);
    expect(tr.pass).toBe(true);
  });

  // F394: SC patch (P4~P5) — Semantic Consistency score 0.30 → 1.00
  it("P4: termUris generated from input tags as SKOS URIs", () => {
    const pkg = convertSpecContainerToSkillPackage(baseInput);
    expect(pkg.ontologyRef.termUris).toContain(
      "https://ai-foundry.ktds.com/terms/lpon#lpon",
    );
    expect(pkg.ontologyRef.termUris).toContain(
      "https://ai-foundry.ktds.com/terms/lpon#voucher",
    );
  });

  it("P5: skosConceptScheme set to domain-scoped URI", () => {
    const pkg = convertSpecContainerToSkillPackage(baseInput);
    expect(pkg.ontologyRef.skosConceptScheme).toBe(
      "https://ai-foundry.ktds.com/schemes/lpon",
    );
  });

  it("P4~P5: SC score reaches 1.00", () => {
    const pkg = convertSpecContainerToSkillPackage(baseInput);
    const sc = scoreSemanticConsistency(pkg);
    expect(sc.score).toBeCloseTo(1.0, 3);
    expect(sc.pass).toBe(true);
  });
});
