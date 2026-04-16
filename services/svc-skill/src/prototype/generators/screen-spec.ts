/**
 * Screen Spec Generator — G9: fsFile(기능정의) + dmFile(데이터모델) → specs/06-screens.md
 *
 * 1. fsFile.content에서 FN 목록 추출 (## FN-NNN 패턴)
 * 2. FN title 한국어 키워드 → 화면 유형 추론 (list/detail/form/dashboard/workflow)
 * 3. dmFile.content에서 CREATE TABLE 테이블명 추출
 * 4. 화면별 필드/흐름/에러 + 내비게이션 매트릭스
 * 5. LLM: svc-llm-router 경유 상세 화면 설계 보강
 */
import type { GeneratedFile } from "@ai-foundry/types";
import { callLlmRouter } from "@ai-foundry/utils";
import type { Env } from "../../env.js";
import type { CollectedData } from "../collector.js";

// ── 타입 ─────────────────────────────────────

interface FnEntry {
  id: string;
  title: string;
}

type ScreenType = "list" | "detail" | "form" | "dashboard" | "workflow";

interface ScreenDef {
  id: string;
  name: string;
  type: ScreenType;
  relatedFn: FnEntry;
  relatedTables: string[];
}

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

// ── 테이블명 추출 ───────────────────────────────

function extractTableNames(dmContent: string): string[] {
  const matches = dmContent.match(/CREATE TABLE (\w+)/g);
  if (!matches) return [];
  return matches.map((m) => m.replace("CREATE TABLE ", ""));
}

// ── 화면 유형 추론 ──────────────────────────────

function inferScreenType(title: string): ScreenType {
  if (/목록|조회|리스트|검색/.test(title)) return "list";
  if (/상세|정보|보기/.test(title)) return "detail";
  if (/통계|현황|대시보드|집계/.test(title)) return "dashboard";
  if (/승인|반려|검토/.test(title)) return "workflow";
  if (/등록|생성|수정|편집/.test(title)) return "form";
  return "form";
}

// ── 화면 유형 한국어 라벨 ───────────────────────

function screenTypeLabel(type: ScreenType): string {
  switch (type) {
    case "list": return "목록 화면";
    case "detail": return "상세 화면";
    case "form": return "입력/수정 화면";
    case "dashboard": return "대시보드";
    case "workflow": return "워크플로우 화면";
  }
}

// ── 기본 필드 생성 ──────────────────────────────

function defaultFields(type: ScreenType): string[] {
  switch (type) {
    case "list":
      return ["검색 조건", "목록 테이블", "페이지네이션", "정렬 옵션"];
    case "detail":
      return ["상세 정보 영역", "관련 데이터 섹션", "액션 버튼"];
    case "form":
      return ["입력 필드 그룹", "유효성 검증 표시", "저장/취소 버튼"];
    case "dashboard":
      return ["KPI 카드", "차트 영역", "필터", "기간 선택"];
    case "workflow":
      return ["상태 표시", "승인/반려 버튼", "코멘트 입력", "이력 목록"];
  }
}

// ── 기본 사용자 흐름 ────────────────────────────

function defaultUserFlow(type: ScreenType): string[] {
  switch (type) {
    case "list":
      return ["1. 화면 진입 → 목록 조회", "2. 검색/필터 조건 입력", "3. 항목 선택 → 상세 이동"];
    case "detail":
      return ["1. 목록에서 항목 선택", "2. 상세 정보 확인", "3. 수정/삭제 액션"];
    case "form":
      return ["1. 입력 필드 작성", "2. 유효성 검증", "3. 저장 → 확인 메시지"];
    case "dashboard":
      return ["1. 대시보드 진입", "2. 기간/필터 선택", "3. 차트/KPI 확인"];
    case "workflow":
      return ["1. 대기 항목 확인", "2. 상세 검토", "3. 승인/반려 + 코멘트"];
  }
}

// ── 기본 에러 표시 ──────────────────────────────

function defaultErrors(type: ScreenType): string[] {
  switch (type) {
    case "list":
      return ["데이터 로딩 실패", "검색 결과 없음"];
    case "detail":
      return ["데이터 로딩 실패", "항목 미존재 (404)"];
    case "form":
      return ["필수 필드 미입력", "유효성 검증 실패", "저장 실패"];
    case "dashboard":
      return ["데이터 로딩 실패", "기간 범위 초과"];
    case "workflow":
      return ["권한 없음", "상태 전이 실패", "동시 수정 충돌"];
  }
}

// ── 화면 목록 빌드 ──────────────────────────────

function buildScreens(fns: FnEntry[], tableNames: string[]): ScreenDef[] {
  return fns.map((fn, i) => ({
    id: `SCR-${String(i + 1).padStart(3, "0")}`,
    name: fn.title,
    type: inferScreenType(fn.title),
    relatedFn: fn,
    relatedTables: tableNames,
  }));
}

// ── Mechanical 생성 ─────────────────────────────

function generateMechanical(
  screens: ScreenDef[],
  _tableNames: string[],
): string {
  const lines: string[] = [];

  // 헤더
  lines.push("# 화면 정의서");
  lines.push("");
  lines.push("> AI Foundry 역공학 파이프라인에서 자동 생성됨");
  lines.push(`> 생성일: ${new Date().toISOString()}`);
  lines.push(`> 총 화면: ${screens.length}건`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // 목차
  lines.push("## 목차");
  lines.push("");
  if (screens.length === 0) {
    lines.push("> FN 정의가 없어 화면을 생성할 수 없습니다.");
    lines.push("");
  }
  for (const scr of screens) {
    lines.push(`- ${scr.id}: ${scr.name} (${screenTypeLabel(scr.type)})`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // 각 화면 정의
  for (const scr of screens) {
    lines.push(`## ${scr.id}: ${scr.name}`);
    lines.push("");
    lines.push(`- **유형**: ${screenTypeLabel(scr.type)}`);
    lines.push(`- **관련 FN**: ${scr.relatedFn.id}`);
    lines.push(`- **관련 테이블**: ${scr.relatedTables.length > 0 ? scr.relatedTables.join(", ") : "-"}`);
    lines.push("");

    // 화면 필드
    lines.push("### 화면 필드");
    lines.push("");
    const fields = defaultFields(scr.type);
    for (const f of fields) {
      lines.push(`- ${f}`);
    }
    lines.push("");

    // 사용자 흐름
    lines.push("### 사용자 흐름");
    lines.push("");
    const flow = defaultUserFlow(scr.type);
    for (const step of flow) {
      lines.push(step);
    }
    lines.push("");

    // 에러 표시
    lines.push("### 에러 표시");
    lines.push("");
    const errors = defaultErrors(scr.type);
    for (const e of errors) {
      lines.push(`- ${e}`);
    }
    lines.push("");
  }

  // 내비게이션 플로우 매트릭스
  if (screens.length > 0) {
    lines.push("## 내비게이션 플로우 매트릭스");
    lines.push("");
    const headers = screens.map((s) => s.id);
    lines.push(`| From \\ To | ${headers.join(" | ")} |`);
    lines.push(`|-----------|${headers.map(() => "---").join("|")}|`);

    for (const from of screens) {
      const cells = screens.map((to) => {
        if (from.id === to.id) return "-";
        // list → detail/form, form → list, detail → form/list, dashboard → list, workflow → detail
        if (from.type === "list" && (to.type === "detail" || to.type === "form")) return "→";
        if (from.type === "form" && to.type === "list") return "→";
        if (from.type === "detail" && (to.type === "form" || to.type === "list")) return "→";
        if (from.type === "dashboard" && to.type === "list") return "→";
        if (from.type === "workflow" && to.type === "detail") return "→";
        return "";
      });
      lines.push(`| ${from.id} | ${cells.join(" | ")} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── LLM 보강 ────────────────────────────────────

async function generateWithLlm(
  env: Env,
  screens: ScreenDef[],
  tableNames: string[],
): Promise<string | null> {
  const screenList = screens
    .map((s) => `- ${s.id}: ${s.name} (${s.type}, FN: ${s.relatedFn.id})`)
    .join("\n");

  const tableList = tableNames.length > 0
    ? tableNames.join(", ")
    : "(테이블 없음)";

  const prompt = `아래는 반제품의 화면 목록과 데이터 모델이다.

## 화면 목록 (${screens.length}건)
${screenList}

## 데이터 모델 테이블
${tableList}

아래 형식으로 화면 정의서를 생성하라. 한국어로 작성.

각 화면별:
1. 화면 유형 및 목적
2. 화면 필드 (입력/출력 필드, 타입, 필수여부)
3. 사용자 흐름 (단계별)
4. 에러 표시 (에러 상황별 UI 처리)
5. 관련 테이블 매핑

마지막에 내비게이션 플로우 매트릭스 (화면 간 이동 관계) 포함.`;

  try {
    const content = await callLlmRouter(env, "svc-skill", "sonnet", prompt, {
      system: "너는 화면 설계 전문가야. 기능 정의서와 데이터 모델을 기반으로 화면별 필드/흐름/에러를 정의한다.",
      maxTokens: 4000,
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

export async function generateScreenSpec(
  env: Env,
  data: CollectedData,
  fsFile: GeneratedFile,
  dmFile: GeneratedFile,
  options?: { skipLlm?: boolean },
): Promise<GeneratedFile> {
  const skipLlm = options?.skipLlm ?? false;

  const fns = extractFnList(fsFile.content);
  const tableNames = extractTableNames(dmFile.content);
  const screens = buildScreens(fns, tableNames);

  let content: string;
  let generatedBy: "mechanical" | "llm-sonnet" = "mechanical";

  if (!skipLlm) {
    const llmContent = await generateWithLlm(env, screens, tableNames);
    if (llmContent) {
      const header = [
        "# 화면 정의서",
        "",
        "> AI Foundry 역공학 파이프라인에서 자동 생성됨 (LLM 보강)",
        `> 생성일: ${new Date().toISOString()}`,
        `> 총 화면: ${screens.length}건`,
        "",
        "---",
        "",
      ].join("\n");
      content = header + llmContent;
      generatedBy = "llm-sonnet";
    } else {
      content = generateMechanical(screens, tableNames);
    }
  } else {
    content = generateMechanical(screens, tableNames);
  }

  return {
    path: "specs/06-screens.md",
    content,
    type: "spec",
    generatedBy,
    sourceCount: screens.length,
  };
}
