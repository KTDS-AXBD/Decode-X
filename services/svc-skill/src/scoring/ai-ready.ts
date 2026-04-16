import {
  AI_READY_OVERALL_THRESHOLD,
  AI_READY_THRESHOLDS,
  type AiReadyScore,
  type CriterionScore,
  type Policy,
  type SkillPackage,
  SkillPackageSchema,
} from "@ai-foundry/types";
import {
  API_PATTERN,
  CAMEL_CASE_PATTERN,
  DOMAIN_KEYWORD_SET,
  NUMERIC_CRITERIA_PATTERN,
  QUALITY_KEYWORDS,
  SNAKE_CASE_PATTERN,
  TECHNICAL_SCHEMA_KEYWORDS,
  hasAnyKeyword,
} from "./keywords.js";

const POLICY_CODE_REGEX = /^POL-[A-Z]+-[A-Z-]+-\d{3}$/;
const POLICY_DOMAIN_REGEX = /^POL-([A-Z]+)-/;

function mkCriterion(score: number, threshold: number, signals: CriterionScore["signals"]): CriterionScore {
  const clamped = Math.max(0, Math.min(1, score));
  return { score: Math.round(clamped * 1000) / 1000, pass: clamped >= threshold, signals };
}

function policyText(p: Policy): string {
  return [p.title, p.description ?? "", p.condition, p.criteria, p.outcome].join("\n");
}

// 1. Machine-readable
export function scoreMachineReadable(pkg: SkillPackage): CriterionScore {
  const schemaOk = typeof pkg.$schema === "string" && pkg.$schema.startsWith("https://");
  const parsed = SkillPackageSchema.safeParse(pkg);
  const zodOk = parsed.success;
  const codes = pkg.policies.map((p) => p.code);
  const codeMatchRate =
    codes.length === 0 ? 0 : codes.filter((c) => POLICY_CODE_REGEX.test(c)).length / codes.length;
  const score = (schemaOk ? 0.3 : 0) + (zodOk ? 0.5 : 0) + codeMatchRate * 0.2;
  return mkCriterion(score, AI_READY_THRESHOLDS.machineReadable, {
    schemaOk,
    zodOk,
    codeMatchRate: Math.round(codeMatchRate * 1000) / 1000,
  });
}

// 2. Semantic Consistency
export function scoreSemanticConsistency(pkg: SkillPackage): CriterionScore {
  const hasTermUris = (pkg.ontologyRef.termUris?.length ?? 0) >= 1;
  const hasSkos =
    typeof pkg.ontologyRef.skosConceptScheme === "string" && pkg.ontologyRef.skosConceptScheme.length > 0;

  const domains = new Set<string>();
  for (const p of pkg.policies) {
    const m = p.code.match(POLICY_DOMAIN_REGEX);
    if (m && m[1]) domains.add(m[1]);
  }
  const domainConsistent = domains.size <= 1;

  const score = (hasTermUris ? 0.4 : 0) + (hasSkos ? 0.3 : 0) + (domainConsistent ? 0.3 : 0);
  return mkCriterion(score, AI_READY_THRESHOLDS.semanticConsistency, {
    termUriCount: pkg.ontologyRef.termUris?.length ?? 0,
    hasSkos,
    domainConsistent,
    distinctPolicyDomains: domains.size,
  });
}

// 3. Testable
export function scoreTestable(pkg: SkillPackage): CriterionScore {
  const policies = pkg.policies;
  if (policies.length === 0) {
    return mkCriterion(0, AI_READY_THRESHOLDS.testable, { policyCount: 0 });
  }
  const longEnough = policies.filter(
    (p) => p.condition.length >= 20 && p.criteria.length >= 20 && p.outcome.length >= 20,
  ).length;
  const longRatio = longEnough / policies.length;
  const excerptCount = policies.filter(
    (p) => typeof p.source.excerpt === "string" && p.source.excerpt.length > 0,
  ).length;
  const excerptRatio = excerptCount / policies.length;
  const countBonus = Math.min(1, policies.length / 3);

  const score = longRatio * 0.5 + excerptRatio * 0.3 + countBonus * 0.2;
  return mkCriterion(score, AI_READY_THRESHOLDS.testable, {
    policyCount: policies.length,
    longRatio: Math.round(longRatio * 1000) / 1000,
    excerptRatio: Math.round(excerptRatio * 1000) / 1000,
  });
}

// 4. Traceable
export function scoreTraceable(pkg: SkillPackage): CriterionScore {
  const srcIds = new Set(pkg.provenance.sourceDocumentIds);
  const hasSources = srcIds.size >= 1;
  const policies = pkg.policies;
  const coveredRatio =
    policies.length === 0
      ? 0
      : policies.filter((p) => srcIds.has(p.source.documentId)).length / policies.length;
  const stageCount = pkg.provenance.pipeline.stages.length;
  const stageOk = stageCount >= 3;

  const score = (hasSources ? 0.3 : 0) + coveredRatio * 0.5 + (stageOk ? 0.2 : 0);
  return mkCriterion(score, AI_READY_THRESHOLDS.traceable, {
    sourceDocCount: srcIds.size,
    coveredRatio: Math.round(coveredRatio * 1000) / 1000,
    stageCount,
  });
}

// 5. Completeness (B + T + Q)
export function scoreCompleteness(
  pkg: SkillPackage,
): CriterionScore & { btq: { business: number; technical: number; quality: number } } {
  const policies = pkg.policies;
  // Include source.excerpt for T/Q signal detection (API/field mentions often live in excerpts)
  const allText = policies
    .map((p) => [policyText(p), p.source.excerpt ?? ""].join("\n"))
    .join("\n");

  // 5-B Business
  const hasRules = policies.length >= 1 && policies.every((p) => p.condition && p.criteria && p.outcome);
  const tagBag = policies.flatMap((p) => p.tags);
  const combinedForDomain = (allText + " " + tagBag.join(" ")).toLowerCase();
  const domainHit = [...DOMAIN_KEYWORD_SET].some((k) => combinedForDomain.includes(k.toLowerCase()));
  const numericHit = NUMERIC_CRITERIA_PATTERN.test(allText);
  const business = (hasRules ? 0.5 : 0) + (domainHit ? 0.25 : 0) + (numericHit ? 0.25 : 0);

  // 5-T Technical
  const ts = pkg.technicalSpec;
  const hasApis = (ts?.apis?.length ?? 0) > 0;
  const hasTables = (ts?.tables?.length ?? 0) > 0;
  const hasDataFlows = (ts?.dataFlows?.length ?? 0) > 0;
  const hasErrors = (ts?.errors?.length ?? 0) > 0;
  const techSpecHit = hasApis || hasTables || hasDataFlows || hasErrors;

  const apiHit = techSpecHit ? hasApis : API_PATTERN.test(allText);
  const schemaKwHit = hasAnyKeyword(allText, TECHNICAL_SCHEMA_KEYWORDS);
  const identifierHit = CAMEL_CASE_PATTERN.test(allText) || SNAKE_CASE_PATTERN.test(allText);
  const dataFieldHit = techSpecHit ? (hasTables || hasDataFlows || hasErrors) : (schemaKwHit || identifierHit);
  const adapterHit = Boolean(pkg.adapters.mcp) || Boolean(pkg.adapters.openapi);
  const technical = (apiHit ? 0.35 : 0) + (dataFieldHit ? 0.35 : 0) + (adapterHit ? 0.3 : 0);

  // 5-Q Quality
  const qualityKwHit = hasAnyKeyword(allText, QUALITY_KEYWORDS);
  const trustScoreOk = pkg.trust.score > 0 && policies.every((p) => p.trust.score > 0);
  const excerptRatio =
    policies.length === 0
      ? 0
      : policies.filter((p) => p.source.excerpt && p.source.excerpt.length > 0).length / policies.length;
  const excerptOk = excerptRatio >= 0.5;
  const quality = (qualityKwHit ? 0.4 : 0) + (trustScoreOk ? 0.3 : 0) + (excerptOk ? 0.3 : 0);

  const avg = (business + technical + quality) / 3;
  const base = mkCriterion(avg, AI_READY_THRESHOLDS.completeness, {
    business: Math.round(business * 1000) / 1000,
    technical: Math.round(technical * 1000) / 1000,
    quality: Math.round(quality * 1000) / 1000,
    apiHit,
    dataFieldHit,
    adapterHit,
    techSpecHit,
    qualityKwHit,
    trustScoreOk,
  });
  return {
    ...base,
    btq: {
      business: Math.round(business * 1000) / 1000,
      technical: Math.round(technical * 1000) / 1000,
      quality: Math.round(quality * 1000) / 1000,
    },
  };
}

// 6. Human-reviewable
export function scoreHumanReviewable(pkg: SkillPackage): CriterionScore {
  const policies = pkg.policies;
  const levelOk = pkg.trust.level === "reviewed" || pkg.trust.level === "validated";
  const titleOk =
    policies.length > 0 && policies.every((p) => typeof p.title === "string" && p.title.length >= 5);
  const avgLen =
    policies.length === 0 ? 0 : policies.map(policyText).reduce((n, t) => n + t.length, 0) / policies.length;
  const lengthOk = avgLen >= 200 && avgLen <= 2000;
  const authorOk = typeof pkg.metadata.author === "string" && pkg.metadata.author.length >= 1;

  const score = (levelOk ? 0.4 : 0) + (titleOk ? 0.2 : 0) + (lengthOk ? 0.2 : 0) + (authorOk ? 0.2 : 0);
  return mkCriterion(score, AI_READY_THRESHOLDS.humanReviewable, {
    trustLevel: pkg.trust.level,
    titleOk,
    avgPolicyLen: Math.round(avgLen),
    lengthOk,
    authorOk,
  });
}

// Aggregate
export function scoreSkill(pkg: SkillPackage): AiReadyScore {
  const machineReadable = scoreMachineReadable(pkg);
  const semanticConsistency = scoreSemanticConsistency(pkg);
  const testable = scoreTestable(pkg);
  const traceable = scoreTraceable(pkg);
  const completeness = scoreCompleteness(pkg);
  const humanReviewable = scoreHumanReviewable(pkg);

  const criteria = {
    machineReadable,
    semanticConsistency,
    testable,
    traceable,
    completeness,
    humanReviewable,
  };

  const overall =
    (machineReadable.score +
      semanticConsistency.score +
      testable.score +
      traceable.score +
      completeness.score +
      humanReviewable.score) /
    6;

  const failedCriteria: string[] = [];
  for (const [name, c] of Object.entries(criteria)) {
    if (!c.pass) failedCriteria.push(name);
  }
  if (overall < AI_READY_OVERALL_THRESHOLD) failedCriteria.push("overall");

  return {
    skillId: pkg.skillId,
    domain: pkg.metadata.domain,
    criteria,
    overall: Math.round(overall * 1000) / 1000,
    passAiReady: overall >= AI_READY_OVERALL_THRESHOLD,
    failedCriteria,
  };
}
