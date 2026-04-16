/**
 * Org Spec Data Collector — 조직 전체 Skills의 B/T/Q Spec 데이터 집계
 *
 * 1. D1에서 organization_id로 skills 조회 (limit 적용)
 * 2. R2에서 각 SkillPackage 로드 (batch 5건씩)
 * 3. 모든 데이터를 OrgSpecData로 합산
 */
import type { SkillPackage } from "@ai-foundry/types";
import { createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";
import type {
  OrgSpecData,
  PolicySummary,
  TechnicalSpecData,
  TermSummary,
} from "./types.js";

const logger = createLogger("spec-gen:org-collector");

// ── SkillPackage → PolicySummary 변환 (collector.ts와 동일 로직) ──

function toPolicySummaries(pkg: SkillPackage): PolicySummary[] {
  return pkg.policies.map((p) => {
    const source: PolicySummary["source"] = { documentId: p.source.documentId };
    if (p.source.pageRef) source.pageRef = p.source.pageRef;
    if (p.source.excerpt) source.excerpt = p.source.excerpt;
    return {
      code: p.code,
      title: p.title,
      condition: p.condition,
      criteria: p.criteria,
      outcome: p.outcome,
      tags: p.tags,
      source,
      trust: { level: p.trust.level, score: p.trust.score },
    };
  });
}

function toTechnicalSpec(pkg: SkillPackage): TechnicalSpecData | null {
  const ts = pkg.technicalSpec;
  if (!ts) return null;
  return {
    apis: ts.apis ?? [],
    tables: ts.tables ?? [],
    dataFlows: ts.dataFlows ?? [],
    errors: ts.errors ?? [],
  };
}

// ── 메인 수집 함수 ──────────────────────────────

export async function collectOrgSpecData(
  env: Env,
  orgId: string,
  limit = 50,
): Promise<OrgSpecData | null> {
  const maxLimit = Math.min(limit, 100);

  // 1. D1에서 Org의 skills 조회
  const rows = await env.DB_SKILL.prepare(
    "SELECT skill_id, r2_key, domain FROM skills WHERE organization_id = ? ORDER BY created_at DESC LIMIT ?",
  )
    .bind(orgId, maxLimit)
    .all<{ skill_id: string; r2_key: string; domain: string }>();

  const skills = rows.results ?? [];
  if (skills.length === 0) {
    logger.warn("No skills found for org", { orgId });
    return null;
  }

  // 2. R2에서 SkillPackage 로드 (batch)
  const allPolicies: PolicySummary[] = [];
  const allTechnicalSpecs: TechnicalSpecData[] = [];
  let trustSum = 0;
  let trustCount = 0;
  let mcpCount = 0;
  let openapiCount = 0;

  const batchSize = 5;
  for (let i = 0; i < skills.length; i += batchSize) {
    const batch = skills.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (row) => {
        const r2Obj = await env.R2_SKILL_PACKAGES.get(row["r2_key"]);
        if (!r2Obj) {
          logger.warn("R2 object not found", { skillId: row["skill_id"], r2Key: row["r2_key"] });
          return null;
        }
        return (await r2Obj.json()) as SkillPackage;
      }),
    );

    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value) continue;
      const pkg = r.value;

      allPolicies.push(...toPolicySummaries(pkg));

      const techSpec = toTechnicalSpec(pkg);
      if (techSpec) allTechnicalSpecs.push(techSpec);

      trustSum += pkg.trust.score;
      trustCount++;

      if (pkg.adapters.mcp) mcpCount++;
      if (pkg.adapters.openapi) openapiCount++;
    }
  }

  // 3. Ontology terms 집계 (전체 org terms — limit으로 비용 제어)
  let orgTerms: TermSummary[] = [];
  try {
    const res = await env.SVC_ONTOLOGY.fetch(`https://internal/terms?limit=200`, {
      headers: {
        "X-Internal-Secret": env.INTERNAL_API_SECRET,
        "Content-Type": "application/json",
        "X-Organization-Id": orgId,
      },
    });
    if (res.ok) {
      const body = (await res.json()) as {
        data: { terms: Array<{ label: string; definition: string | null; skos_uri: string | null; term_type: string }> };
      };
      orgTerms = (body.data?.terms ?? []).map((t) => ({
        label: t.label,
        definition: t.definition,
        skosUri: t.skos_uri,
        termType: t.term_type,
      }));
    }
  } catch (err) {
    logger.warn("Org terms fetch failed, proceeding without", { orgId, err: String(err) });
  }

  // 도메인 빈도 계산 — 가장 많은 도메인 선택
  const domainCounts = new Map<string, number>();
  for (const s of skills) {
    const d = s["domain"];
    domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
  }
  let topDomain = "unknown";
  let topCount = 0;
  for (const [d, c] of domainCounts) {
    if (c > topCount) {
      topDomain = d;
      topCount = c;
    }
  }

  logger.info("Org spec data collected", {
    orgId,
    skillCount: skills.length,
    policyCount: allPolicies.length,
    techSpecCount: allTechnicalSpecs.length,
    termCount: orgTerms.length,
  });

  return {
    organizationId: orgId,
    domain: topDomain,
    skillCount: skills.length,
    allPolicies,
    allTechnicalSpecs,
    allExtractions: [], // extraction은 개별 skill에서만 사용 — org 레벨은 생략
    allTerms: orgTerms,
    avgTrustScore: trustCount > 0 ? trustSum / trustCount : 0,
    adapters: { mcpCount, openapiCount },
  };
}
