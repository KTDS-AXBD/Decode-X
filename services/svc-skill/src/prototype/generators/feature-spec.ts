/**
 * Feature Spec Generator — skills + policies + BL + DM → specs/03-functions.md
 *
 * 1. skills를 subdomain별 그룹핑 → 각 그룹 = 1 FN
 * 2. 각 FN에 관련 policies 매핑 (도메인/서브도메인 매칭)
 * 3. blFile.content에서 BL-NNN 목록 추출
 * 4. dmFile.content에서 CREATE TABLE 테이블명 추출
 * 5. FN-001~NNN 순번 부여
 * 6. Mechanical: 테이블 형태 기능 정의서
 * 7. LLM: 상세 플로우 + 에러케이스 보강
 */
import type { GeneratedFile } from "@ai-foundry/types";
import { callLlmRouter } from "@ai-foundry/utils";
import type { Env } from "../../env.js";
import type { CollectedData, PolicyRow, SkillRow } from "../collector.js";

// ── 헬퍼 ────────────────────────────────────────

interface _SkillGroup {
  subdomain: string;
  domain: string;
  skills: SkillRow[];
  relatedPolicies: PolicyRow[];
}

function groupSkillsBySubdomain(skills: SkillRow[]): Map<string, SkillRow[]> {
  const map = new Map<string, SkillRow[]>();
  for (const s of skills) {
    const key = s.subdomain ?? s.domain;
    const existing = map.get(key);
    if (existing) {
      existing.push(s);
    } else {
      map.set(key, [s]);
    }
  }
  return map;
}

function matchPolicies(
  skills: SkillRow[],
  policies: PolicyRow[],
): PolicyRow[] {
  // 도메인/서브도메인 기반 매칭
  const domains = new Set(skills.map((s) => s.domain.toUpperCase()));
  const subdomains = new Set(
    skills.filter((s) => s.subdomain).map((s) => s.subdomain!.toUpperCase()),
  );

  return policies.filter((p) => {
    if (!p.policy_code) return false;
    const parts = p.policy_code.split("-");
    const policyDomain = parts[1]?.toUpperCase() ?? "";
    const policyType = parts.slice(2, -1).join("-").toUpperCase();

    return domains.has(policyDomain) ||
      subdomains.has(policyDomain) ||
      subdomains.has(policyType);
  });
}

export function extractBlReferences(blContent: string): string[] {
  const matches = blContent.match(/BL-\d{3,}/g);
  return matches ? [...new Set(matches)] : [];
}

export function extractTableNames(dmContent: string): string[] {
  const matches = dmContent.match(/CREATE TABLE (\w+)/g);
  if (!matches) return [];
  return matches.map((m) => {
    const name = m.replace("CREATE TABLE ", "");
    return name;
  });
}

// ── FN 구조 ─────────────────────────────────────

interface FunctionDef {
  id: string;
  name: string;
  domain: string;
  subdomain: string;
  policyCount: number;
  policies: PolicyRow[];
  skills: SkillRow[];
  relatedBLs: string[];
  relatedTables: string[];
}

function buildFunctions(
  skillGroups: Map<string, SkillRow[]>,
  policies: PolicyRow[],
  blRefs: string[],
  tableNames: string[],
): FunctionDef[] {
  const fns: FunctionDef[] = [];
  let seq = 1;

  const sortedKeys = Array.from(skillGroups.keys()).sort();

  for (const key of sortedKeys) {
    const skills = skillGroups.get(key)!;
    const domain = skills[0]!.domain;
    const subdomain = skills[0]!.subdomain ?? domain;
    const related = matchPolicies(skills, policies);

    fns.push({
      id: `FN-${String(seq).padStart(3, "0")}`,
      name: subdomain,
      domain,
      subdomain,
      policyCount: related.length,
      policies: related,
      skills,
      relatedBLs: blRefs,
      relatedTables: tableNames,
    });
    seq++;
  }

  return fns;
}

// ── Mechanical 생성 ─────────────────────────────

function generateMechanicalFn(fn: FunctionDef): string {
  const lines: string[] = [];
  lines.push(`### ${fn.id}: ${fn.name}`);
  lines.push("");
  lines.push(`- **도메인**: ${fn.domain}`);
  lines.push(`- **서브도메인**: ${fn.subdomain}`);
  lines.push(`- **관련 정책**: ${fn.policyCount}건`);
  lines.push(`- **관련 스킬**: ${fn.skills.length}건`);
  lines.push("");

  // 입력/출력
  lines.push("#### 입력");
  lines.push("");
  lines.push("| 필드 | 타입 | 필수 | 설명 |");
  lines.push("|------|------|------|------|");
  lines.push("| id | TEXT | Y | 대상 식별자 |");
  lines.push("");

  lines.push("#### 처리 플로우");
  lines.push("");
  if (fn.policies.length > 0) {
    let step = 1;
    for (const p of fn.policies.slice(0, 5)) {
      lines.push(`${step}. ${p.condition} → ${p.criteria} → ${p.outcome} (${p.policy_code})`);
      step++;
    }
    if (fn.policies.length > 5) {
      lines.push(`... 외 ${fn.policies.length - 5}건`);
    }
  } else {
    lines.push("(관련 정책 없음)");
  }
  lines.push("");

  lines.push("#### 출력");
  lines.push("");
  lines.push("| 필드 | 타입 | 설명 |");
  lines.push("|------|------|------|");
  lines.push("| success | boolean | 처리 결과 |");
  lines.push("| data | object | 결과 데이터 |");
  lines.push("");

  // 에러 케이스
  lines.push("#### 에러 케이스");
  lines.push("");
  lines.push("| 코드 | 조건 | HTTP |");
  lines.push("|------|------|------|");
  lines.push("| INVALID_INPUT | 필수 필드 누락 | 400 |");
  lines.push("| NOT_FOUND | 대상 미존재 | 404 |");
  lines.push("");

  return lines.join("\n");
}

function generateMechanical(
  fns: FunctionDef[],
  blRefs: string[],
  tableNames: string[],
  skillCount: number,
): string {
  const lines: string[] = [];
  lines.push("# 기능 정의서");
  lines.push("");
  lines.push("> AI Foundry 역공학 파이프라인에서 자동 생성됨");
  lines.push(`> 생성일: ${new Date().toISOString()}`);
  lines.push(`> 총 기능: ${fns.length}건 | 스킬: ${skillCount}개`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // 목차
  lines.push("## 목차");
  lines.push("");
  for (const fn of fns) {
    lines.push(`- [${fn.id}: ${fn.name}](#${fn.id.toLowerCase()}-${fn.name.toLowerCase().replace(/\s+/g, "-")}) (정책 ${fn.policyCount}건)`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // 기능 정의
  lines.push("## 기능 정의");
  lines.push("");

  if (fns.length === 0) {
    lines.push("> bundled 스킬이 없어 기능을 생성할 수 없습니다.");
    lines.push("");
  }

  for (const fn of fns) {
    lines.push(generateMechanicalFn(fn));
  }

  // 크로스 레퍼런스 매트릭스
  if (fns.length > 0) {
    lines.push("## 크로스 레퍼런스 매트릭스");
    lines.push("");
    lines.push("| FN | 관련 BL | 관련 테이블 |");
    lines.push("|----|---------|------------|");
    for (const fn of fns) {
      const bls = blRefs.length > 0 ? blRefs.slice(0, 3).join(", ") : "-";
      const tbls = tableNames.length > 0 ? tableNames.slice(0, 3).join(", ") : "-";
      lines.push(`| ${fn.id} | ${bls} | ${tbls} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── LLM 보강 ────────────────────────────────────

async function generateWithLlm(
  env: Env,
  fns: FunctionDef[],
  blContent: string,
  dmContent: string,
  skills: SkillRow[],
): Promise<string | null> {
  // BL/DM 요약 (토큰 제한)
  const blSummary = blContent.slice(0, 3000);
  const dmSummary = dmContent.slice(0, 2000);

  const skillList = skills.map((s) =>
    `- ${s.domain}/${s.subdomain ?? "general"}: policy_count=${s.policy_count}`,
  ).join("\n");

  const prompt = `## 비즈니스 로직 (요약)
${blSummary}

## 데이터 모델 (테이블 목록)
${dmSummary}

## 스킬 목록
${skillList}

각 스킬을 기능(FN-NNN)으로 변환해줘:
- 입력 (필드/타입/필수/검증규칙)
- 처리 플로우 (단계별, BL-NNN 참조)
- 출력 (필드/타입)
- 에러 케이스 (코드/조건/HTTP)
- 크로스 레퍼런스 매트릭스 (FN↔BL↔테이블)`;

  try {
    const content = await callLlmRouter(env, "svc-skill", "sonnet", prompt, {
      system: "너는 기능 정의서 작성 전문가야. 비즈니스 로직과 데이터 모델을 기반으로 기능별 입출력/처리플로우/에러케이스를 정의한다.",
      maxTokens: 4000,
    });
    if (content) return content;
  } catch {
    // fallback
  }
  return null;
}

// ── 메인 생성 함수 ──────────────────────────────

export async function generateFeatureSpec(
  env: Env,
  data: CollectedData,
  blFile: GeneratedFile,
  dmFile: GeneratedFile,
  options?: { skipLlm?: boolean },
): Promise<GeneratedFile> {
  const skipLlm = options?.skipLlm ?? false;

  // 선행 결과에서 참조 추출
  const blRefs = extractBlReferences(blFile.content);
  const tableNames = extractTableNames(dmFile.content);

  // skills → subdomain별 그룹 → FN 목록
  const skillGroups = groupSkillsBySubdomain(data.skills);
  const fns = buildFunctions(skillGroups, data.policies, blRefs, tableNames);

  let content: string;
  let generatedBy: "mechanical" | "llm-sonnet" = "mechanical";

  if (!skipLlm) {
    const llmContent = await generateWithLlm(
      env,
      fns,
      blFile.content,
      dmFile.content,
      data.skills,
    );
    if (llmContent) {
      const header = [
        "# 기능 정의서",
        "",
        "> AI Foundry 역공학 파이프라인에서 자동 생성됨 (LLM 보강)",
        `> 생성일: ${new Date().toISOString()}`,
        `> 총 기능: ${fns.length}건 | 스킬: ${data.skills.length}개`,
        "",
        "---",
        "",
      ].join("\n");
      content = header + llmContent;
      generatedBy = "llm-sonnet";
    } else {
      content = generateMechanical(fns, blRefs, tableNames, data.skills.length);
    }
  } else {
    content = generateMechanical(fns, blRefs, tableNames, data.skills.length);
  }

  return {
    path: "specs/03-functions.md",
    content,
    type: "spec",
    generatedBy,
    sourceCount: data.skills.length,
  };
}
