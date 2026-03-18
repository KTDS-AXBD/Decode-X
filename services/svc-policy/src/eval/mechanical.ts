import { PolicyCandidateSchema, type PolicyCandidate } from "@ai-foundry/types";
import type { EvalResult, EvalIssue } from "@ai-foundry/types";

const POLICY_CODE_REGEX = /^POL-[A-Z]+-[A-Z-]+-\d{3}$/;
const MIN_FIELD_LENGTH = 10;

export interface MechanicalVerifyContext {
  existingPolicies: Array<{ policyCode: string; title: string; condition: string }>;
}

export class MechanicalVerifier {
  /**
   * Policy candidate 기계 검증.
   * LLM 호출 없이 규칙 기반으로 구조적 정합성을 검사한다.
   *
   * 검증 항목:
   * 1. Zod 스키마 strict parse
   * 2. 필수 필드 최소 길이 (condition, criteria, outcome 각 10자 이상)
   * 3. policyCode 형식 (POL-{DOMAIN}-{TYPE}-{SEQ})
   * 4. tags 배열 유효성 (빈 문자열 불허)
   * 5. 기존 policy와의 중복 검출 (Jaccard 유사도 > 0.8)
   */
  verify(
    candidate: PolicyCandidate,
    ctx: MechanicalVerifyContext = { existingPolicies: [] },
  ): EvalResult {
    const startMs = Date.now();
    const issues: EvalIssue[] = [];

    // 1. Zod strict re-parse
    const strictResult = PolicyCandidateSchema.strict().safeParse(candidate);
    if (!strictResult.success) {
      issues.push({
        code: "MECH_SCHEMA_INVALID",
        severity: "error",
        message: `Schema validation failed: ${strictResult.error.message}`,
      });
    }

    // 2. 필수 필드 최소 길이
    this.checkMinLength(candidate.condition, "condition", issues);
    this.checkMinLength(candidate.criteria, "criteria", issues);
    this.checkMinLength(candidate.outcome, "outcome", issues);

    // 3. policyCode 형식
    if (!POLICY_CODE_REGEX.test(candidate.policyCode)) {
      issues.push({
        code: "MECH_INVALID_CODE_FORMAT",
        severity: "error",
        message: `policyCode '${candidate.policyCode}' does not match POL-{DOMAIN}-{TYPE}-{SEQ}`,
      });
    }

    // 4. tags 유효성
    for (const tag of candidate.tags) {
      if (tag.trim().length === 0) {
        issues.push({
          code: "MECH_EMPTY_TAG",
          severity: "warning",
          message: "tags 배열에 빈 문자열이 포함됨",
        });
        break;
      }
    }

    // 5. 중복 검출
    const duplicates = this.findDuplicates(candidate, ctx.existingPolicies);
    for (const dup of duplicates) {
      issues.push({
        code: "MECH_DUPLICATE_DETECTED",
        severity: "warning",
        message: `기존 정책 '${dup.policyCode}'와 유사도 ${dup.similarity.toFixed(2)} — 중복 가능성`,
        detail: dup.policyCode,
      });
    }

    const hasErrors = issues.some((i) => i.severity === "error");
    const durationMs = Date.now() - startMs;

    return {
      stage: "mechanical",
      verdict: hasErrors ? "fail" : "pass",
      score: hasErrors ? 0 : 1.0,
      issues,
      evaluator: "mechanical",
      durationMs,
      timestamp: new Date().toISOString(),
    };
  }

  private checkMinLength(
    value: string,
    fieldName: string,
    issues: EvalIssue[],
  ): void {
    if (value.length < MIN_FIELD_LENGTH) {
      issues.push({
        code: `MECH_SHORT_${fieldName.toUpperCase()}`,
        severity: "error",
        message: `${fieldName}이(가) ${MIN_FIELD_LENGTH}자 미만 (현재 ${value.length}자)`,
      });
    }
  }

  private findDuplicates(
    candidate: PolicyCandidate,
    existing: MechanicalVerifyContext["existingPolicies"],
  ): Array<{ policyCode: string; similarity: number }> {
    const candidateTokens = this.tokenize(
      `${candidate.title} ${candidate.condition}`,
    );
    const result: Array<{ policyCode: string; similarity: number }> = [];

    for (const policy of existing) {
      const existingTokens = this.tokenize(
        `${policy.title} ${policy.condition}`,
      );
      const similarity = this.jaccardSimilarity(candidateTokens, existingTokens);
      if (similarity > 0.8) {
        result.push({ policyCode: policy.policyCode, similarity });
      }
    }

    return result;
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^\w\sㄱ-힣]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1),
    );
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    let intersection = 0;
    for (const token of a) {
      if (b.has(token)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}
