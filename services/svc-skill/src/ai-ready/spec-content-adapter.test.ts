import { describe, it, expect } from "vitest";
import { skillPackageToSpecContent } from "./spec-content-adapter.js";
import type { SkillPackage } from "@ai-foundry/types";

function makePackage(overrides: Partial<SkillPackage> = {}): SkillPackage {
  return {
    $schema: "https://ai-foundry.ktds.com/schemas/skill/v1",
    skillId: "4591b69e-4e6a-4ac8-8261-ce177c35f994",
    metadata: {
      domain: "LPON",
      subdomain: "charge",
      language: "ko",
      version: "1.0.0",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
      author: "decode-x",
      tags: [],
    },
    policies: [
      {
        code: "POL-LPON-CHARGE-001",
        title: "충전 잔액 검증",
        condition: "충전 요청 시 출금계좌 잔액 확인",
        criteria: "출금계좌 잔액 ≥ 충전 요청 금액",
        outcome: "출금 처리를 진행한다",
        exception: "잔액 부족 시 출금 실패 에러 반환", // TD-58 / F418
        source: { documentId: "doc-001", excerpt: "원문 발췌 (exception과 다른 필드)" },
        trust: { level: "reviewed", score: 0.9 },
        tags: [],
      },
      {
        code: "POL-LPON-CHARGE-002",
        title: "충전 완료 확정",
        condition: "출금이 정상적으로 완료된 경우",
        criteria: "출금 프로세스가 에러 없이 종료됨",
        outcome: "충전 완료 처리한다",
        // exception 미지정 → "—" 렌더
        source: { documentId: "doc-001" },
        trust: { level: "reviewed", score: 0.85 },
        tags: ["charge", "complete"],
      },
    ],
    trust: { level: "reviewed", score: 0.9 },
    ontologyRef: { graphId: "g-001", termUris: [] },
    provenance: {
      sourceDocumentIds: ["doc-001"],
      organizationId: "LPON",
      extractedAt: "2026-04-01T00:00:00.000Z",
      pipeline: { stages: ["ingestion", "extraction"], models: { extraction: "claude-sonnet" } },
    },
    adapters: {},
    ...overrides,
  } as unknown as SkillPackage;
}

describe("skillPackageToSpecContent", () => {
  it("originalRules contains BL-style markdown table with all policy codes", () => {
    const pkg = makePackage();
    const { specContent } = skillPackageToSpecContent(pkg);

    expect(specContent.originalRules).toHaveLength(1);
    const table = specContent.originalRules![0];
    expect(table).toContain("POL-LPON-CHARGE-001");
    expect(table).toContain("POL-LPON-CHARGE-002");
    expect(table).toContain("condition (When)");
  });

  it("provenanceYaml contains all policy codes as businessRules", () => {
    const pkg = makePackage();
    const { specContent } = skillPackageToSpecContent(pkg);

    expect(specContent.provenanceYaml).toContain("businessRules:");
    expect(specContent.provenanceYaml).toContain("POL-LPON-CHARGE-001");
    expect(specContent.provenanceYaml).toContain("POL-LPON-CHARGE-002");
    expect(specContent.provenanceYaml).toContain("organizationId: LPON");
  });

  it("runbooks count equals policies count", () => {
    const pkg = makePackage();
    const { specContent } = skillPackageToSpecContent(pkg);

    expect(specContent.runbooks).toHaveLength(pkg.policies.length);
    expect(specContent.runbooks[0]).toContain("POL-LPON-CHARGE-001");
    expect(specContent.runbooks[0]).toContain("운영 가이드");
  });

  it("tests count equals policies count with given/when/then structure", () => {
    const pkg = makePackage();
    const { specContent } = skillPackageToSpecContent(pkg);

    expect(specContent.tests).toHaveLength(pkg.policies.length);
    expect(specContent.tests[0]).toContain("given:");
    expect(specContent.tests[0]).toContain("when:");
    expect(specContent.tests[0]).toContain("then:");
  });

  it("policy.exception mapped to exception column, missing exception uses dash (TD-58 / F418)", () => {
    const pkg = makePackage();
    const { specContent } = skillPackageToSpecContent(pkg);

    const table = specContent.originalRules![0];
    // policy 001 has exception → should appear in table
    expect(table).toContain("잔액 부족 시 출금 실패 에러 반환");
    // policy 002 has no exception → should use "—"
    expect(table).toContain("| — |");
    // source.excerpt should NOT leak into exception column anymore
    expect(table).not.toContain("원문 발췌 (exception과 다른 필드)");
  });

  it("skillName derived from domain and subdomain", () => {
    const pkg = makePackage();
    const { skillName } = skillPackageToSpecContent(pkg);
    expect(skillName).toBe("lpon-charge");
  });

  it("skillName uses only domain when subdomain absent", () => {
    const pkg = makePackage({
      metadata: {
        domain: "퇴직연금",
        language: "ko",
        version: "1.0.0",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
        author: "decode-x",
        tags: [],
      },
    } as Partial<SkillPackage>);
    const { skillName } = skillPackageToSpecContent(pkg);
    expect(skillName).toBe("퇴직연금");
  });
});
