/**
 * Spec Generator — B/T/Q Spec 문서 생성 진입점
 */
import type { OpenRouterEnv } from "@ai-foundry/utils";
import type { Env } from "../env.js";
import { collectSkillSpecData } from "./collector.js";
import { collectOrgSpecData } from "./org-collector.js";
import { generateBusinessSpec } from "./generators/business.js";
import { generateTechnicalSpec } from "./generators/technical.js";
import { generateQualitySpec } from "./generators/quality.js";
import { enhanceWithLlm } from "./llm-enhancer.js";
import type {
  SpecDocument, SpecType, SpecMetadata,
  OrgSpecDocument, OrgSpecMetadata, OrgSpecData, SkillSpecData,
} from "./types.js";

export type { SpecDocument, SpecType, SpecSection, SpecMetadata } from "./types.js";
export type { OrgSpecDocument, OrgSpecMetadata } from "./types.js";

export async function generateSpec(
  env: Env,
  skillId: string,
  type: SpecType,
  options?: { useLlm?: boolean },
): Promise<SpecDocument | null> {
  const data = await collectSkillSpecData(env, skillId);
  if (!data) return null;

  // Template 기반 섹션 생성
  let sections = type === "business"
    ? generateBusinessSpec(data)
    : type === "technical"
      ? generateTechnicalSpec(data)
      : generateQualitySpec(data);

  // LLM 보강 (optional — OpenRouter 직접 호출)
  if (options?.useLlm !== false && env.OPENROUTER_API_KEY) {
    const orEnv: OpenRouterEnv = { OPENROUTER_API_KEY: env.OPENROUTER_API_KEY };
    sections = await enhanceWithLlm(orEnv, data, sections, type);
  }

  // AI-Ready 점수 (B/T/Q 각각)
  // scoreSkill은 SkillPackage를 요구 — 간이 메타데이터 구성
  const metadata: SpecMetadata = {
    domain: data.domain,
    policyCount: data.policies.length,
    aiReadyScore: { business: 0, technical: 0, quality: 0 },
  };
  if (data.subdomain) metadata.subdomain = data.subdomain;

  // 점수는 R2에서 이미 조회한 데이터로 계산 (collector가 이미 로드)
  // 간이 점수 계산
  try {
    // R2에서 로드한 SkillPackage를 재구성하는 대신, 간이 계산
    const biz = data.policies.length > 0 ? 0.5 : 0;
    const tech = (data.technicalSpec?.apis.length ?? 0) > 0 ? 0.35 : 0;
    const qual = data.trust.score > 0 ? 0.3 : 0;
    metadata.aiReadyScore = {
      business: Math.min(1, biz + (data.extraction?.processes.length ? 0.25 : 0) + (data.terms.length > 0 ? 0.25 : 0)),
      technical: Math.min(1, tech + ((data.technicalSpec?.tables.length ?? 0) > 0 ? 0.35 : 0) + (data.adapters.mcp ? 0.3 : 0)),
      quality: Math.min(1, qual + (data.policies.some((p) => p.source.excerpt) ? 0.3 : 0) + 0.4),
    };
  } catch {
    // 점수 계산 실패 시 0으로 유지
  }

  return {
    skillId,
    type,
    generatedAt: new Date().toISOString(),
    sections,
    metadata,
  };
}

export async function generateAllSpecs(
  env: Env,
  skillId: string,
  options?: { useLlm?: boolean },
): Promise<SpecDocument[] | null> {
  const types: SpecType[] = ["business", "technical", "quality"];
  const results = await Promise.all(
    types.map((t) => generateSpec(env, skillId, t, options)),
  );

  if (results.every((r) => r === null)) return null;
  return results.filter((r): r is SpecDocument => r !== null);
}

// ── Org 단위 Spec 생성 ──────────────────────────

/** OrgSpecData → SkillSpecData 형태로 변환하여 기존 generators 재사용 */
function orgToSkillSpecData(org: OrgSpecData): SkillSpecData {
  // TechnicalSpec 병합 — 모든 skill의 APIs/Tables/DataFlows/Errors 합산
  const mergedTech = org.allTechnicalSpecs.length > 0
    ? {
        apis: org.allTechnicalSpecs.flatMap((t) => t.apis),
        tables: org.allTechnicalSpecs.flatMap((t) => t.tables),
        dataFlows: org.allTechnicalSpecs.flatMap((t) => t.dataFlows),
        errors: org.allTechnicalSpecs.flatMap((t) => t.errors),
      }
    : null;

  // Extraction 병합
  const mergedExtraction = org.allExtractions.length > 0
    ? {
        processes: org.allExtractions.flatMap((e) => e.processes),
        entities: org.allExtractions.flatMap((e) => e.entities),
        relationships: org.allExtractions.flatMap((e) => e.relationships),
        rules: org.allExtractions.flatMap((e) => e.rules),
      }
    : null;

  return {
    skillId: `org:${org.organizationId}`,
    organizationId: org.organizationId,
    domain: org.domain,
    policies: org.allPolicies,
    technicalSpec: mergedTech,
    adapters: {
      mcp: org.adapters.mcpCount > 0 ? `${org.adapters.mcpCount} skills` : undefined,
      openapi: org.adapters.openapiCount > 0 ? `${org.adapters.openapiCount} skills` : undefined,
    },
    trust: { level: org.avgTrustScore >= 0.7 ? "reviewed" : "unreviewed", score: org.avgTrustScore },
    provenance: {
      sourceDocumentIds: [],
      organizationId: org.organizationId,
      extractedAt: new Date().toISOString(),
      pipeline: { stages: ["org-aggregate"], models: {} },
    },
    ontologyRef: { graphId: "", termUris: [] },
    extraction: mergedExtraction,
    terms: org.allTerms,
  };
}

function computeOrgMetadata(org: OrgSpecData): OrgSpecMetadata {
  const totalApis = org.allTechnicalSpecs.reduce((sum, t) => sum + t.apis.length, 0);
  const totalTables = org.allTechnicalSpecs.reduce((sum, t) => sum + t.tables.length, 0);

  const biz = org.allPolicies.length > 0 ? 0.5 : 0;
  const tech = totalApis > 0 ? 0.35 : 0;
  const qual = org.avgTrustScore > 0 ? 0.3 : 0;

  return {
    domain: org.domain,
    totalPolicies: org.allPolicies.length,
    avgTrustScore: Math.round(org.avgTrustScore * 1000) / 1000,
    aiReadyScore: {
      business: Math.min(1, biz + (org.allExtractions.length > 0 ? 0.25 : 0) + (org.allTerms.length > 0 ? 0.25 : 0)),
      technical: Math.min(1, tech + (totalTables > 0 ? 0.35 : 0) + (org.adapters.mcpCount > 0 ? 0.3 : 0)),
      quality: Math.min(1, qual + (org.allPolicies.some((p) => p.source.excerpt) ? 0.3 : 0) + 0.4),
    },
  };
}

export async function generateOrgSpec(
  env: Env,
  orgId: string,
  type: SpecType,
  options?: { useLlm?: boolean; limit?: number },
): Promise<OrgSpecDocument | null> {
  const orgData = await collectOrgSpecData(env, orgId, options?.limit);
  if (!orgData) return null;

  const skillData = orgToSkillSpecData(orgData);

  let sections = type === "business"
    ? generateBusinessSpec(skillData)
    : type === "technical"
      ? generateTechnicalSpec(skillData)
      : generateQualitySpec(skillData);

  if (options?.useLlm !== false && env.OPENROUTER_API_KEY) {
    const orEnv: OpenRouterEnv = { OPENROUTER_API_KEY: env.OPENROUTER_API_KEY };
    sections = await enhanceWithLlm(orEnv, skillData, sections, type);
  }

  return {
    organizationId: orgId,
    type,
    generatedAt: new Date().toISOString(),
    skillCount: orgData.skillCount,
    sections,
    metadata: computeOrgMetadata(orgData),
  };
}

export async function generateAllOrgSpecs(
  env: Env,
  orgId: string,
  options?: { useLlm?: boolean; limit?: number },
): Promise<OrgSpecDocument[] | null> {
  const types: SpecType[] = ["business", "technical", "quality"];
  const results = await Promise.all(
    types.map((t) => generateOrgSpec(env, orgId, t, options)),
  );

  if (results.every((r) => r === null)) return null;
  return results.filter((r): r is OrgSpecDocument => r !== null);
}
