import { describe, it, expect } from "vitest";
import { buildPrompt, buildSystemPrompt } from "./prompts.js";
import type { PromptInput } from "./prompts.js";
import { ALL_AI_READY_CRITERIA } from "@ai-foundry/types";

const SAMPLE_INPUT: PromptInput = {
  skillName: "lpon-charge",
  sourceCode: `public class ChargeService {
  private final ChargeRepository repo;
  public ChargeResult charge(ChargeRequest req) {
    if (req.getAmount() <= 0) throw new ValidationException("ERR-CHARGE-001");
    return repo.save(req);
  }
}`,
  metadata: {
    provenanceYaml: "domain: giftvoucher\nsubdomain: charge",
    contracts: '{"input": {"amount": "long"}, "output": {"chargeId": "string"}}',
    rules: ["월 충전 한도 50만원 초과 불가"],
  },
};

// ── 6기준 프롬프트 빌드 ────────────────────────────────────────────────

describe("buildPrompt — 6기준 전체", () => {
  it("모든 기준에 대해 프롬프트 생성 성공", () => {
    for (const criterion of ALL_AI_READY_CRITERIA) {
      const prompt = buildPrompt(criterion, SAMPLE_INPUT);
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(100);
    }
  });

  it("skill 이름 포함 확인", () => {
    const prompt = buildPrompt("source_consistency", SAMPLE_INPUT);
    expect(prompt).toContain("lpon-charge");
  });

  it("소스 코드 포함 확인", () => {
    const prompt = buildPrompt("io_structure", SAMPLE_INPUT);
    expect(prompt).toContain("ChargeService");
  });

  it("JSON 출력 지시 포함", () => {
    const prompt = buildPrompt("exception_handling", SAMPLE_INPUT);
    expect(prompt).toContain('"score"');
    expect(prompt).toContain('"rationale"');
  });

  it("기준별 한국어 이름 포함", () => {
    const criterionMap: Array<[Parameters<typeof buildPrompt>[0], string]> = [
      ["source_consistency", "소스코드 정합성"],
      ["comment_doc_alignment", "주석·문서 일치"],
      ["io_structure", "입출력 구조 명확성"],
      ["exception_handling", "예외·에러 핸들링"],
      ["srp_reusability", "업무루틴 분리·재사용성"],
      ["testability", "테스트 가능성"],
    ];
    for (const [criterion, expectedKorean] of criterionMap) {
      const prompt = buildPrompt(criterion, SAMPLE_INPUT);
      expect(prompt).toContain(expectedKorean);
    }
  });
});

// ── 시스템 프롬프트 ────────────────────────────────────────────────────

describe("buildSystemPrompt", () => {
  it("JSON 전용 출력 지시 포함", () => {
    const sys = buildSystemPrompt();
    expect(sys).toContain("JSON만 반환");
  });
});
