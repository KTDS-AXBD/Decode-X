import { describe, it, expect } from "vitest";
import { buildEvaluatePrompt, parseEvaluateResponse } from "./evaluate.js";
import type { Policy } from "@ai-foundry/types";

const samplePolicy: Policy = {
  code: "POL-PENSION-WD-001",
  title: "주택구입 중도인출",
  condition: "가입자가 무주택자이며 DC형 퇴직연금에 가입한 경우",
  criteria: "무주택 확인서 제출, 가입기간 1년 이상",
  outcome: "적립금의 50% 이내 중도인출 가능",
  source: { documentId: "doc-1" },
  trust: { level: "reviewed", score: 0.85 },
  tags: ["중도인출"],
};

describe("buildEvaluatePrompt", () => {
  it("includes policy code in system prompt", () => {
    const { system } = buildEvaluatePrompt(samplePolicy, "퇴직연금", "test context");
    expect(system).toContain("POL-PENSION-WD-001");
  });

  it("includes domain in system prompt", () => {
    const { system } = buildEvaluatePrompt(samplePolicy, "퇴직연금", "test context");
    expect(system).toContain("퇴직연금");
  });

  it("includes condition, criteria, outcome", () => {
    const { system } = buildEvaluatePrompt(samplePolicy, "퇴직연금", "test context");
    expect(system).toContain("무주택자");
    expect(system).toContain("무주택 확인서");
    expect(system).toContain("50%");
  });

  it("includes context in user prompt", () => {
    const { user } = buildEvaluatePrompt(samplePolicy, "퇴직연금", "가입자 A의 상황");
    expect(user).toContain("가입자 A의 상황");
  });

  it("includes parameters when provided", () => {
    const { user } = buildEvaluatePrompt(
      samplePolicy,
      "퇴직연금",
      "test",
      { age: 45, tenure: 5 },
    );
    expect(user).toContain("45");
    expect(user).toContain("tenure");
  });

  it("shows 없음 when no parameters", () => {
    const { user } = buildEvaluatePrompt(samplePolicy, "퇴직연금", "test");
    expect(user).toContain("없음");
  });

  it("requests JSON format response", () => {
    const { system } = buildEvaluatePrompt(samplePolicy, "퇴직연금", "test");
    expect(system).toContain("JSON");
    expect(system).toContain("confidence");
    expect(system).toContain("reasoning");
  });
});

describe("parseEvaluateResponse", () => {
  it("parses valid JSON response", () => {
    const raw = JSON.stringify({
      result: "APPLICABLE — 조건 충족",
      confidence: 0.92,
      reasoning: "1) 무주택 확인 2) 가입기간 충족",
    });

    const parsed = parseEvaluateResponse(raw);
    expect(parsed.result).toContain("APPLICABLE");
    expect(parsed.confidence).toBe(0.92);
    expect(parsed.reasoning).toContain("무주택");
  });

  it("handles markdown-wrapped JSON", () => {
    const raw = '```json\n{"result":"APPLICABLE","confidence":0.85,"reasoning":"ok"}\n```';

    const parsed = parseEvaluateResponse(raw);
    expect(parsed.result).toBe("APPLICABLE");
    expect(parsed.confidence).toBe(0.85);
  });

  it("handles triple backtick without json label", () => {
    const raw = '```\n{"result":"NOT_APPLICABLE","confidence":0.3,"reasoning":"no"}\n```';

    const parsed = parseEvaluateResponse(raw);
    expect(parsed.result).toBe("NOT_APPLICABLE");
  });

  it("throws on missing fields", () => {
    expect(() => parseEvaluateResponse('{"result":"ok"}')).toThrow("missing required fields");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseEvaluateResponse("not json")).toThrow();
  });
});
