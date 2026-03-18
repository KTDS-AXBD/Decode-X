import { SkillPackageSchema, type SkillPackage } from "@ai-foundry/types";
import type { EvalResult, EvalIssue } from "@ai-foundry/types";

/**
 * Skill Package 기계 검증.
 *
 * 검증 항목:
 * 1. SkillPackageSchema strict parse
 * 2. policies 배열 비어있지 않은지 확인
 * 3. 모든 policy trust level이 'reviewed' 이상
 * 4. ontologyRef 유효성 (termUris 비어있지 않음)
 * 5. metadata 완전성 (domain, version, author 필수 + 비어있지 않음)
 */
export class SkillMechanicalVerifier {
  verify(skillPackage: SkillPackage): EvalResult {
    const startMs = Date.now();
    const issues: EvalIssue[] = [];

    // 1. Zod strict re-parse
    const strictResult = SkillPackageSchema.strict().safeParse(skillPackage);
    if (!strictResult.success) {
      issues.push({
        code: "SKILL_MECH_SCHEMA_INVALID",
        severity: "error",
        message: `Schema validation failed: ${strictResult.error.message}`,
      });
    }

    // 2. policies 배열 비어있지 않은지
    if (skillPackage.policies.length === 0) {
      issues.push({
        code: "SKILL_MECH_EMPTY_POLICIES",
        severity: "error",
        message: "Skill package에 정책이 없어요.",
      });
    }

    // 3. 모든 policy trust level이 'reviewed' 이상
    const unreviewedPolicies = skillPackage.policies.filter(
      (p) => p.trust.level === "unreviewed",
    );
    if (unreviewedPolicies.length > 0) {
      issues.push({
        code: "SKILL_MECH_UNREVIEWED_POLICIES",
        severity: "error",
        message: `${unreviewedPolicies.length}개 정책이 미검토(unreviewed) 상태예요.`,
        detail: unreviewedPolicies.map((p) => p.code).join(", "),
      });
    }

    // 4. ontologyRef 유효성
    if (skillPackage.ontologyRef.termUris.length === 0) {
      issues.push({
        code: "SKILL_MECH_EMPTY_ONTOLOGY",
        severity: "warning",
        message: "ontologyRef.termUris가 비어있어요.",
      });
    }

    // 5. metadata 완전성
    const { domain, version, author } = skillPackage.metadata;
    if (!domain || domain.trim().length === 0) {
      issues.push({
        code: "SKILL_MECH_MISSING_DOMAIN",
        severity: "error",
        message: "metadata.domain이 비어있어요.",
      });
    }
    if (!version || version.trim().length === 0) {
      issues.push({
        code: "SKILL_MECH_MISSING_VERSION",
        severity: "error",
        message: "metadata.version이 비어있어요.",
      });
    }
    if (!author || author.trim().length === 0) {
      issues.push({
        code: "SKILL_MECH_MISSING_AUTHOR",
        severity: "error",
        message: "metadata.author가 비어있어요.",
      });
    }

    const hasErrors = issues.some((i) => i.severity === "error");

    return {
      stage: "mechanical",
      verdict: hasErrors ? "fail" : "pass",
      score: hasErrors ? 0 : 1.0,
      issues,
      evaluator: "mechanical",
      durationMs: Date.now() - startMs,
      timestamp: new Date().toISOString(),
    };
  }
}
