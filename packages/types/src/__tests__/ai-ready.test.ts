import { describe, it, expect } from "vitest";
import {
  AIReadyCriterion,
  AIReadyScoreSchema,
  AIReadyEvaluationSchema,
  AIReadyBatchReportSchema,
  ALL_AI_READY_CRITERIA,
} from "../ai-ready.js";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440001";
const VALID_RATIONALE = "소스 코드와 메타데이터 사이에 필드 드리프트 없음. 모든 rule이 Java 구현과 1:1 대응.";

// ── AIReadyCriterion ──────────────────────────────────────────────────

describe("AIReadyCriterion", () => {
  it("6기준 enum 값 모두 허용", () => {
    const values = [
      "source_consistency",
      "comment_doc_alignment",
      "io_structure",
      "exception_handling",
      "srp_reusability",
      "testability",
    ] as const;
    for (const v of values) {
      expect(AIReadyCriterion.safeParse(v).success).toBe(true);
    }
  });

  it("ALL_AI_READY_CRITERIA 길이 6", () => {
    expect(ALL_AI_READY_CRITERIA).toHaveLength(6);
  });

  it("잘못된 값 거부", () => {
    expect(AIReadyCriterion.safeParse("unknown_criterion").success).toBe(false);
  });
});

// ── AIReadyScoreSchema ────────────────────────────────────────────────

describe("AIReadyScoreSchema", () => {
  const valid = {
    criterion: "source_consistency" as const,
    score: 0.85,
    rationale: VALID_RATIONALE,
    passThreshold: 0.75 as const,
    passed: true,
  };

  it("정상 입력 파싱", () => {
    const result = AIReadyScoreSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("passThreshold 기본값 0.75 자동 설정", () => {
    const { passThreshold: _, ...without } = valid;
    const result = AIReadyScoreSchema.safeParse(without);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.passThreshold).toBe(0.75);
  });

  it("score 범위 초과 거부 (> 1)", () => {
    expect(AIReadyScoreSchema.safeParse({ ...valid, score: 1.1 }).success).toBe(false);
  });

  it("rationale 너무 짧음 거부 (< 20자)", () => {
    expect(AIReadyScoreSchema.safeParse({ ...valid, rationale: "짧은" }).success).toBe(false);
  });

  it("score 0.0 허용 (최솟값 경계)", () => {
    expect(AIReadyScoreSchema.safeParse({ ...valid, score: 0 }).success).toBe(true);
  });
});

// ── AIReadyEvaluationSchema ───────────────────────────────────────────

describe("AIReadyEvaluationSchema", () => {
  function makeScore(criterion: string): unknown {
    return {
      criterion,
      score: 0.8,
      rationale: VALID_RATIONALE,
      passThreshold: 0.75,
      passed: true,
    };
  }

  const valid = {
    skillId: VALID_UUID,
    skillName: "lpon-charge",
    criteria: [
      makeScore("source_consistency"),
      makeScore("comment_doc_alignment"),
      makeScore("io_structure"),
      makeScore("exception_handling"),
      makeScore("srp_reusability"),
      makeScore("testability"),
    ],
    totalScore: 0.8,
    passCount: 6,
    overallPassed: true,
    modelVersion: "claude-haiku-4-5-20251001",
    evaluatedAt: "2026-04-22T10:00:00.000Z",
    costUsd: 0.003,
  };

  it("정상 6기준 평가 파싱", () => {
    expect(AIReadyEvaluationSchema.safeParse(valid).success).toBe(true);
  });

  it("criteria 길이 6 미만 거부 (5개)", () => {
    const result = AIReadyEvaluationSchema.safeParse({
      ...valid,
      criteria: valid.criteria.slice(0, 5),
    });
    expect(result.success).toBe(false);
  });

  it("costUsd 음수 거부", () => {
    expect(AIReadyEvaluationSchema.safeParse({ ...valid, costUsd: -0.01 }).success).toBe(false);
  });

  it("skillId UUID 아닐 때 거부", () => {
    expect(AIReadyEvaluationSchema.safeParse({ ...valid, skillId: "not-uuid" }).success).toBe(false);
  });
});

// ── AIReadyBatchReportSchema ──────────────────────────────────────────

describe("AIReadyBatchReportSchema", () => {
  it("빈 evaluations 배열 허용", () => {
    const result = AIReadyBatchReportSchema.safeParse({
      executedAt: "2026-04-22T10:00:00.000Z",
      modelVersion: "claude-haiku-4-5-20251001",
      totalSkills: 0,
      totalCostUsd: 0,
      evaluations: [],
    });
    expect(result.success).toBe(true);
  });
});
