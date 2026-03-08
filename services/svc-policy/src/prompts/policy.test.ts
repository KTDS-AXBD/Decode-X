import { describe, it, expect } from "vitest";
import { buildPolicyInferencePrompt } from "./policy.js";

describe("buildPolicyInferencePrompt", () => {
  it("returns system and userContent for single chunk", () => {
    const result = buildPolicyInferencePrompt(["퇴직연금 가입 절차"]);
    expect(result.system).toContain("policy analyst");
    expect(result.system).toContain("POL-PENSION-{TYPE}-{SEQ}");
    expect(result.userContent).toContain("--- 청크 1 ---");
    expect(result.userContent).toContain("퇴직연금 가입 절차");
  });

  it("numbers multiple chunks sequentially", () => {
    const chunks = ["첫 번째 청크", "두 번째 청크", "세 번째 청크"];
    const result = buildPolicyInferencePrompt(chunks);
    expect(result.userContent).toContain("--- 청크 1 ---");
    expect(result.userContent).toContain("--- 청크 2 ---");
    expect(result.userContent).toContain("--- 청크 3 ---");
  });

  it("handles empty chunks array", () => {
    const result = buildPolicyInferencePrompt([]);
    expect(result.system).toBeDefined();
    expect(result.userContent).toBeDefined();
    // No chunk markers
    expect(result.userContent).not.toContain("--- 청크");
  });

  it("system prompt includes all 10 policy TYPE codes", () => {
    const result = buildPolicyInferencePrompt(["test"]);
    const types = ["WD", "EN", "TR", "CT", "BN", "MG", "RG", "CL", "NF", "EX"];
    for (const t of types) {
      expect(result.system).toContain(t);
    }
  });

  it("system prompt enforces JSON-only output", () => {
    const result = buildPolicyInferencePrompt(["test"]);
    expect(result.system).toContain("CRITICAL RULES");
    expect(result.system).toContain("ONLY a JSON array");
    expect(result.system).toContain("Start your response with [");
  });

  it("preserves special characters in chunks", () => {
    const chunks = ['{"key": "value"}', "line1\nline2"];
    const result = buildPolicyInferencePrompt(chunks);
    expect(result.userContent).toContain('{"key": "value"}');
    expect(result.userContent).toContain("line1\nline2");
  });

  it("uses custom startingSeq in user prompt", () => {
    const result = buildPolicyInferencePrompt(["test chunk"], 42);
    expect(result.userContent).toContain("042");
    expect(result.userContent).toContain("SEQ 시작 번호: 042");
  });

  it("defaults startingSeq to 001", () => {
    const result = buildPolicyInferencePrompt(["test chunk"]);
    expect(result.userContent).toContain("SEQ 시작 번호: 001");
  });

  it("defaults domain to pension", () => {
    const result = buildPolicyInferencePrompt(["test"]);
    expect(result.system).toContain("POL-PENSION-{TYPE}-{SEQ}");
    expect(result.userContent).toContain("퇴직연금 도메인");
  });

  it("generates giftvoucher domain prompt", () => {
    const result = buildPolicyInferencePrompt(["test"], 1, "giftvoucher");
    expect(result.system).toContain("POL-GIFTVOUCHER-{TYPE}-{SEQ}");
    expect(result.system).toContain("gift voucher");
    expect(result.userContent).toContain("온누리상품권 도메인");
    // giftvoucher-specific TYPE codes
    const types = ["IS", "DT", "US", "ST", "RF", "VL"];
    for (const t of types) {
      expect(result.system).toContain(t);
    }
    // pension-specific TYPE codes should NOT appear
    expect(result.system).not.toContain("WD:");
    expect(result.system).not.toContain("EN:");
    expect(result.system).not.toContain("CT:");
    expect(result.system).not.toContain("BN:");
    expect(result.system).not.toContain("CL:");
  });

  it("generates general domain prompt", () => {
    const result = buildPolicyInferencePrompt(["test"], 1, "general");
    expect(result.system).toContain("POL-GENERAL-{TYPE}-{SEQ}");
    expect(result.userContent).toContain("일반 도메인");
    expect(result.system).toContain("OP:");
  });

  it("falls back to general for unknown domain", () => {
    const result = buildPolicyInferencePrompt(["test"], 1, "unknown_domain");
    expect(result.system).toContain("POL-GENERAL-{TYPE}-{SEQ}");
    expect(result.userContent).toContain("일반 도메인");
  });
});
