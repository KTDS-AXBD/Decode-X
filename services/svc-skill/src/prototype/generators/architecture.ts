/**
 * Architecture Generator — G5(feature-spec) → specs/04-architecture.md
 *
 * 1. fsFile.content에서 FN 목록 추출 (## FN-NNN 패턴)
 * 2. FN → 도메인별 모듈 그룹핑
 * 3. 고정 4-Layer 아키텍처
 * 4. RBAC 매트릭스 (USER / ADMIN / SYSTEM)
 * 5. 비기능 요구사항 템플릿
 */
import type { GeneratedFile } from "@ai-foundry/types";
import { callLlmRouter } from "@ai-foundry/utils";
import type { Env } from "../../env.js";
import type { CollectedData } from "../collector.js";

interface FnEntry {
  id: string;
  title: string;
}

interface Module {
  name: string;
  fns: FnEntry[];
}

const _LAYERS = ["Presentation", "Application", "Domain", "Infrastructure"] as const;

const ROLES = ["USER", "ADMIN", "SYSTEM"] as const;

// ── FN 목록 추출 ────────────────────────────────

function extractFnList(content: string): FnEntry[] {
  const entries: FnEntry[] = [];
  const pattern = /^##\s+(FN-\d{3})[:\s]+(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const id = match[1];
    const title = match[2];
    if (id && title) {
      entries.push({ id, title: title.trim() });
    }
  }

  return entries;
}

// ── 모듈 그룹핑 (FN title에서 도메인 키워드 추출) ──

function groupIntoModules(fns: FnEntry[]): Module[] {
  const map = new Map<string, FnEntry[]>();

  for (const fn of fns) {
    // title의 첫 단어 또는 도메인 키워드를 모듈명으로 사용
    const moduleName = inferModuleName(fn.title);
    const existing = map.get(moduleName);
    if (existing) {
      existing.push(fn);
    } else {
      map.set(moduleName, [fn]);
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, moduleFns]) => ({ name, fns: moduleFns }));
}

function inferModuleName(title: string): string {
  // 한국어/영어 첫 단어를 모듈명으로 사용
  const first = title.split(/[\s/·:]+/)[0];
  return first ?? "기타";
}

// ── Mechanical 생성 ─────────────────────────────

function generateMechanical(
  fns: FnEntry[],
  modules: Module[],
  data: CollectedData,
): string {
  const lines: string[] = [];

  lines.push("# 아키텍처 명세");
  lines.push("");
  lines.push("> AI Foundry 역공학 파이프라인에서 자동 생성됨");
  lines.push(`> 생성일: ${new Date().toISOString()}`);
  lines.push(`> 기능: ${fns.length}건 | 모듈: ${modules.length}개`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // 1. 모듈 구성
  lines.push("## 1. 모듈 구성");
  lines.push("");

  for (const mod of modules) {
    lines.push(`### ${mod.name}`);
    lines.push("");
    lines.push("| FN | 기능명 |");
    lines.push("|-----|--------|");
    for (const fn of mod.fns) {
      lines.push(`| ${fn.id} | ${fn.title} |`);
    }
    lines.push("");
  }

  // 2. 레이어 아키텍처
  lines.push("## 2. 레이어 아키텍처");
  lines.push("");
  lines.push("| 레이어 | 책임 | 주요 컴포넌트 |");
  lines.push("|--------|------|---------------|");
  lines.push("| Presentation | UI/API 엔드포인트 | Router, Controller, Middleware |");
  lines.push("| Application | 유스케이스 오케스트레이션 | Service, UseCase, DTO |");
  lines.push("| Domain | 비즈니스 로직/엔티티 | Entity, ValueObject, DomainService |");
  lines.push("| Infrastructure | 외부 시스템 연동 | Repository, Client, Adapter |");
  lines.push("");

  // 3. RBAC 매트릭스
  lines.push("## 3. RBAC 매트릭스");
  lines.push("");
  const roleHeaders = ROLES.join(" | ");
  lines.push(`| 모듈 | ${roleHeaders} |`);
  lines.push(`|------|${ROLES.map(() => "------").join("|")}|`);

  for (const mod of modules) {
    // 기본 권한: USER=R, ADMIN=RW, SYSTEM=RW
    lines.push(`| ${mod.name} | R | RW | RW |`);
  }
  lines.push("");

  // 4. 비기능 요구사항
  lines.push("## 4. 비기능 요구사항");
  lines.push("");
  lines.push("| 항목 | 목표 |");
  lines.push("|------|------|");
  lines.push("| 동시 사용자 | 100명 |");
  lines.push("| 응답 시간 | < 500ms (P95) |");
  lines.push("| 가용성 | 99.5% |");
  lines.push("| 데이터 보존 | 5년 (감사 로그) |");
  lines.push("");

  // 5. 데이터 소스 요약
  lines.push("## 5. 데이터 소스");
  lines.push("");
  lines.push(`- 정책: ${data.policies.length}건`);
  lines.push(`- 용어: ${data.terms.length}건`);
  lines.push(`- 스킬: ${data.skills.length}건`);
  lines.push(`- 문서: ${data.documents.length}건`);
  lines.push("");

  return lines.join("\n");
}

// ── LLM 보강 ────────────────────────────────────

async function generateWithLlm(
  env: Env,
  fns: FnEntry[],
  modules: Module[],
  data: CollectedData,
): Promise<string | null> {
  const fnList = fns.map((f) => `- ${f.id}: ${f.title}`).join("\n");
  const moduleList = modules
    .map((m) => `- ${m.name}: ${m.fns.map((f) => f.id).join(", ")}`)
    .join("\n");

  const prompt = `아래는 반제품의 기능 목록과 모듈 구성이다.

## 기능 목록
${fnList}

## 모듈 구성
${moduleList}

## 데이터
- 정책: ${data.policies.length}건
- 용어: ${data.terms.length}건
- 스킬: ${data.skills.length}건

아래 형식으로 아키텍처 명세를 생성하라. 한국어로 작성.

1. 각 모듈의 책임과 의존 관계 (모듈 간 화살표)
2. 4-Layer 아키텍처 (Presentation/Application/Domain/Infrastructure)에 모듈 배치
3. RBAC 매트릭스 (USER/ADMIN/SYSTEM × 모듈별 CRUD 권한)
4. 비기능 요구사항 (동시사용자 100명, 응답시간 <500ms, 가용성 99.5%)
5. 모듈 간 의존 관계 Mermaid 다이어그램`;

  try {
    const content = await callLlmRouter(env, "svc-skill", "sonnet", prompt, {
      maxTokens: 3000,
    });
    if (content) {
      return content;
    }
  } catch {
    // LLM 실패 → null 반환, caller에서 mechanical fallback
  }

  return null;
}

// ── 메인 생성 함수 ──────────────────────────────

export async function generateArchitecture(
  env: Env,
  data: CollectedData,
  fsFile: GeneratedFile,
  options?: { skipLlm?: boolean },
): Promise<GeneratedFile> {
  const skipLlm = options?.skipLlm ?? false;
  const fns = extractFnList(fsFile.content);
  const modules = groupIntoModules(fns);

  let content: string;

  if (skipLlm) {
    content = generateMechanical(fns, modules, data);
  } else {
    const llmContent = await generateWithLlm(env, fns, modules, data);
    content = llmContent ?? generateMechanical(fns, modules, data);
  }

  return {
    path: "specs/04-architecture.md",
    content,
    type: "spec",
    generatedBy: skipLlm ? "mechanical" : "llm-sonnet",
    sourceCount: fns.length,
  };
}
