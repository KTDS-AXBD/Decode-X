import { describe, it, expect } from "vitest";
import { MechanicalVerifier } from "./mechanical.js";
import type { PolicyCandidate } from "@ai-foundry/types";

function makeCandidate(overrides?: Partial<PolicyCandidate>): PolicyCandidate {
  return {
    title: "퇴직연금 중도인출 조건 정책",
    condition: "가입자가 주택 구입을 위해 중도인출을 신청한 경우",
    criteria: "주택 구입 계약서와 본인 명의 확인 서류가 제출되어야 한다",
    outcome: "퇴직연금 적립금의 50% 이내에서 중도인출을 승인한다",
    policyCode: "POL-PENSION-WD-001",
    tags: ["퇴직연금", "중도인출"],
    ...overrides,
  };
}

describe("MechanicalVerifier", () => {
  const verifier = new MechanicalVerifier();

  it("valid candidate passes with score 1.0", () => {
    const result = verifier.verify(makeCandidate());
    expect(result.verdict).toBe("pass");
    expect(result.score).toBe(1.0);
    expect(result.stage).toBe("mechanical");
    expect(result.evaluator).toBe("mechanical");
    expect(result.issues).toHaveLength(0);
  });

  it("empty condition fails with MECH_SHORT_CONDITION", () => {
    const result = verifier.verify(makeCandidate({ condition: "" }));
    expect(result.verdict).toBe("fail");
    expect(result.score).toBe(0);
    const issue = result.issues.find((i) => i.code === "MECH_SHORT_CONDITION");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
  });

  it("short criteria (< 10 chars) fails", () => {
    const result = verifier.verify(makeCandidate({ criteria: "짧은 기준" }));
    expect(result.verdict).toBe("fail");
    const issue = result.issues.find((i) => i.code === "MECH_SHORT_CRITERIA");
    expect(issue).toBeDefined();
  });

  it("invalid policyCode format fails", () => {
    const result = verifier.verify(makeCandidate({ policyCode: "INVALID-CODE" }));
    expect(result.verdict).toBe("fail");
    const issue = result.issues.find((i) => i.code === "MECH_INVALID_CODE_FORMAT");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
  });

  it("duplicate detection flags similar existing policy", () => {
    const candidate = makeCandidate();
    const ctx = {
      existingPolicies: [
        {
          policyCode: "POL-PENSION-WD-002",
          title: "퇴직연금 중도인출 조건 정책",
          condition: "가입자가 주택 구입을 위해 중도인출을 신청한 경우",
        },
      ],
    };
    const result = verifier.verify(candidate, ctx);
    expect(result.verdict).toBe("pass"); // duplicates are warnings, not errors
    const dupIssue = result.issues.find((i) => i.code === "MECH_DUPLICATE_DETECTED");
    expect(dupIssue).toBeDefined();
    expect(dupIssue?.severity).toBe("warning");
    expect(dupIssue?.detail).toBe("POL-PENSION-WD-002");
  });

  it("empty tags array passes (no warning)", () => {
    const result = verifier.verify(makeCandidate({ tags: [] }));
    expect(result.verdict).toBe("pass");
    const tagIssue = result.issues.find((i) => i.code === "MECH_EMPTY_TAG");
    expect(tagIssue).toBeUndefined();
  });

  it("blank tag string triggers warning", () => {
    const result = verifier.verify(makeCandidate({ tags: ["valid", "  "] }));
    // blank tag is a warning, so verdict is still pass
    expect(result.verdict).toBe("pass");
    const tagIssue = result.issues.find((i) => i.code === "MECH_EMPTY_TAG");
    expect(tagIssue).toBeDefined();
    expect(tagIssue?.severity).toBe("warning");
  });

  it("aggregates multiple issues from different checks", () => {
    const result = verifier.verify(
      makeCandidate({
        condition: "짧음",
        criteria: "짧음",
        outcome: "짧음",
        policyCode: "BAD",
      }),
    );
    expect(result.verdict).toBe("fail");
    expect(result.score).toBe(0);
    // At least 4 issues: 3 short fields + 1 invalid code
    expect(result.issues.length).toBeGreaterThanOrEqual(4);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain("MECH_SHORT_CONDITION");
    expect(codes).toContain("MECH_SHORT_CRITERIA");
    expect(codes).toContain("MECH_SHORT_OUTCOME");
    expect(codes).toContain("MECH_INVALID_CODE_FORMAT");
  });

  it("no duplicate flagged when existing policies are dissimilar", () => {
    const candidate = makeCandidate();
    const ctx = {
      existingPolicies: [
        {
          policyCode: "POL-PENSION-EN-001",
          title: "연금 가입 자격 정책",
          condition: "근로자가 입사 후 30일 이내에 가입 신청을 한 경우",
        },
      ],
    };
    const result = verifier.verify(candidate, ctx);
    const dupIssue = result.issues.find((i) => i.code === "MECH_DUPLICATE_DETECTED");
    expect(dupIssue).toBeUndefined();
  });

  it("returns valid timestamp in ISO format", () => {
    const result = verifier.verify(makeCandidate());
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });
});
