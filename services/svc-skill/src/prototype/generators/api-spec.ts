/**
 * API Spec Generator — G5(feature-spec) → specs/05-api.md
 *
 * 1. fsFile.content에서 FN 목록 추출
 * 2. FN → REST 엔드포인트 매핑 (조회→GET, 생성→POST, 상태변경→POST action)
 * 3. 입출력 필드 → JSON Schema 변환
 * 4. 에러 코드 → HTTP 상태 매핑
 * 5. 리소스별 그룹핑
 */
import type { GeneratedFile } from "@ai-foundry/types";
import { callLlmRouter } from "@ai-foundry/utils";
import type { Env } from "../../env.js";

interface FnEntry {
  id: string;
  title: string;
}

interface ApiEndpoint {
  fn: FnEntry;
  method: string;
  path: string;
  resource: string;
  description: string;
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

// ── FN → REST 엔드포인트 매핑 ───────────────────

const ACTION_KEYWORDS: Record<string, { method: string; suffix: string }> = {
  조회: { method: "GET", suffix: "" },
  검색: { method: "GET", suffix: "/search" },
  목록: { method: "GET", suffix: "" },
  리스트: { method: "GET", suffix: "" },
  상세: { method: "GET", suffix: "/:id" },
  등록: { method: "POST", suffix: "" },
  생성: { method: "POST", suffix: "" },
  추가: { method: "POST", suffix: "" },
  수정: { method: "PUT", suffix: "/:id" },
  변경: { method: "PUT", suffix: "/:id" },
  삭제: { method: "DELETE", suffix: "/:id" },
  승인: { method: "POST", suffix: "/:id/approve" },
  반려: { method: "POST", suffix: "/:id/reject" },
  취소: { method: "POST", suffix: "/:id/cancel" },
  충전: { method: "POST", suffix: "/:id/charge" },
  환불: { method: "POST", suffix: "/:id/refund" },
};

function inferResource(title: string): string {
  // title에서 동사를 제거하고 명사 부분을 resource로 사용
  const nouns = title
    .replace(/조회|검색|목록|리스트|상세|등록|생성|추가|수정|변경|삭제|승인|반려|취소|충전|환불|관리|처리/g, "")
    .trim();

  if (!nouns) return "resources";

  // 한국어 → kebab-case 변환 (간소화: 그대로 사용)
  return nouns
    .replace(/\s+/g, "-")
    .toLowerCase() || "resources";
}

function mapFnToEndpoint(fn: FnEntry): ApiEndpoint {
  let method = "POST";
  let suffix = "";
  const description = fn.title;

  for (const [keyword, mapping] of Object.entries(ACTION_KEYWORDS)) {
    if (fn.title.includes(keyword)) {
      method = mapping.method;
      suffix = mapping.suffix;
      break;
    }
  }

  const resource = inferResource(fn.title);
  const path = `/api/v1/${resource}${suffix}`;

  return { fn, method, path, resource, description };
}

// ── 리소스별 그룹핑 ─────────────────────────────

function groupByResource(endpoints: ApiEndpoint[]): Map<string, ApiEndpoint[]> {
  const map = new Map<string, ApiEndpoint[]>();

  for (const ep of endpoints) {
    const existing = map.get(ep.resource);
    if (existing) {
      existing.push(ep);
    } else {
      map.set(ep.resource, [ep]);
    }
  }

  return map;
}

// ── HTTP 에러 코드 매핑 ─────────────────────────

const ERROR_CODES = [
  { code: 400, name: "Bad Request", description: "잘못된 요청 파라미터" },
  { code: 401, name: "Unauthorized", description: "인증 필요" },
  { code: 403, name: "Forbidden", description: "권한 없음" },
  { code: 404, name: "Not Found", description: "리소스 없음" },
  { code: 409, name: "Conflict", description: "상태 충돌 (중복 처리)" },
  { code: 422, name: "Unprocessable Entity", description: "비즈니스 룰 위반" },
  { code: 500, name: "Internal Server Error", description: "서버 내부 오류" },
];

// ── JSON Schema 스켈레톤 ────────────────────────

function generateJsonSchema(fn: FnEntry, method: string): string {
  if (method === "GET" || method === "DELETE") {
    return "  파라미터: query string 또는 path parameter";
  }

  return `  \`\`\`json
  {
    "type": "object",
    "properties": {
      "id": { "type": "string", "description": "${fn.title} ID" }
    },
    "required": ["id"]
  }
  \`\`\``;
}

// ── Mechanical 생성 ─────────────────────────────

function generateMechanical(
  fns: FnEntry[],
  endpoints: ApiEndpoint[],
  resourceGroups: Map<string, ApiEndpoint[]>,
): string {
  const lines: string[] = [];

  lines.push("# API 명세");
  lines.push("");
  lines.push("> AI Foundry 역공학 파이프라인에서 자동 생성됨");
  lines.push(`> 생성일: ${new Date().toISOString()}`);
  lines.push(`> 총 엔드포인트: ${endpoints.length}건 | 리소스 그룹: ${resourceGroups.size}개`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // 1. API 요약 테이블
  lines.push("## 1. API 요약");
  lines.push("");
  lines.push("| FN | Method | Path | 설명 |");
  lines.push("|-----|--------|------|------|");

  for (const ep of endpoints) {
    lines.push(`| ${ep.fn.id} | ${ep.method} | \`${ep.path}\` | ${ep.description} |`);
  }
  lines.push("");

  // 2. 리소스별 상세
  lines.push("## 2. 리소스별 상세");
  lines.push("");

  for (const [resource, eps] of resourceGroups) {
    lines.push(`### ${resource}`);
    lines.push("");

    for (const ep of eps) {
      lines.push(`#### ${ep.method} \`${ep.path}\``);
      lines.push("");
      lines.push(`- **기능**: ${ep.fn.id} ${ep.description}`);
      lines.push(`- **인증**: Bearer Token`);
      lines.push("");

      // 요청 스키마
      lines.push("**Request**");
      lines.push("");
      lines.push(generateJsonSchema(ep.fn, ep.method));
      lines.push("");

      // 응답
      lines.push("**Response** (200)");
      lines.push("");
      lines.push("  ```json");
      lines.push("  { \"success\": true, \"data\": { } }");
      lines.push("  ```");
      lines.push("");
    }
  }

  // 3. 공통 에러 코드
  lines.push("## 3. 공통 에러 코드");
  lines.push("");
  lines.push("| HTTP | 코드명 | 설명 |");
  lines.push("|------|--------|------|");

  for (const err of ERROR_CODES) {
    lines.push(`| ${err.code} | ${err.name} | ${err.description} |`);
  }
  lines.push("");

  // 4. 공통 응답 포맷
  lines.push("## 4. 공통 응답 포맷");
  lines.push("");
  lines.push("```json");
  lines.push("// 성공");
  lines.push("{ \"success\": true, \"data\": { ... } }");
  lines.push("");
  lines.push("// 실패");
  lines.push("{ \"success\": false, \"error\": { \"code\": \"ERROR_CODE\", \"message\": \"설명\" } }");
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

// ── LLM 보강 ────────────────────────────────────

async function generateWithLlm(
  env: Env,
  fns: FnEntry[],
  endpoints: ApiEndpoint[],
): Promise<string | null> {
  const epList = endpoints
    .map((ep) => `- ${ep.fn.id}: ${ep.method} ${ep.path} — ${ep.description}`)
    .join("\n");

  const prompt = `아래는 반제품의 기능(FN) 목록과 매핑된 REST API 엔드포인트이다.

## 엔드포인트 목록
${epList}

아래 형식으로 API 명세를 생성하라. 한국어로 작성.

1. 각 엔드포인트별:
   - Request JSON Schema (type, properties, required)
   - Response JSON Schema
   - 예시 페이로드 (Request/Response)
   - 에러 케이스 (비즈니스 룰 위반 시 HTTP 422 + 에러 코드)
2. 리소스별 그룹핑
3. 공통 응답 포맷: { success, data } / { success, error: { code, message } }
4. 인증: Bearer Token
5. 페이지네이션: limit/offset 쿼리 파라미터 (GET 목록)`;

  try {
    const content = await callLlmRouter(env, "svc-skill", "sonnet", prompt, {
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

export async function generateApiSpec(
  env: Env,
  fsFile: GeneratedFile,
  options?: { skipLlm?: boolean },
): Promise<GeneratedFile> {
  const skipLlm = options?.skipLlm ?? false;
  const fns = extractFnList(fsFile.content);
  const endpoints = fns.map(mapFnToEndpoint);
  const resourceGroups = groupByResource(endpoints);

  let content: string;

  if (skipLlm) {
    content = generateMechanical(fns, endpoints, resourceGroups);
  } else {
    const llmContent = await generateWithLlm(env, fns, endpoints);
    if (llmContent) {
      content = llmContent;
    } else {
      content = generateMechanical(fns, endpoints, resourceGroups);
    }
  }

  return {
    path: "specs/05-api.md",
    content,
    type: "spec",
    generatedBy: skipLlm ? "mechanical" : "llm-sonnet",
    sourceCount: fns.length,
  };
}
