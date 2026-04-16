/**
 * Data Model Generator — terms → specs/02-data-model.md
 *
 * 1. terms를 term_type별 분류 (entity/attribute/relation)
 * 2. entity → 테이블명 (snake_case)
 * 3. attribute → broader_term_id로 entity 매핑 → 컬럼
 * 4. relation → FK 관계
 * 5. Mechanical: CREATE TABLE SQL + Mermaid ERD
 * 6. LLM: svc-llm-router 경유 정교한 스키마
 */
import type { GeneratedFile } from "@ai-foundry/types";
import { callLlmRouter } from "@ai-foundry/utils";
import type { Env } from "../../env.js";
import type { TermRow } from "../collector.js";

// ── 헬퍼 ────────────────────────────────────────

function termToTableName(label: string): string {
  return label.replace(/\s+/g, "_").toLowerCase();
}

function inferColumnType(definition: string | null): string {
  if (!definition) return "TEXT";
  if (/금액|수량|건수|횟수/.test(definition)) return "INTEGER";
  if (/비율|점수|확률/.test(definition)) return "REAL";
  return "TEXT";
}

interface TableDef {
  name: string;
  label: string;
  termId: string;
  columns: Array<{ name: string; type: string; label: string; definition: string | null }>;
}

interface RelationDef {
  label: string;
  definition: string | null;
}

function classifyTerms(terms: TermRow[]) {
  const entities: TermRow[] = [];
  const attributes: TermRow[] = [];
  const relations: TermRow[] = [];

  for (const t of terms) {
    switch (t.term_type) {
      case "entity":
        entities.push(t);
        break;
      case "attribute":
        attributes.push(t);
        break;
      case "relation":
        relations.push(t);
        break;
      // 기타 term_type은 무시
    }
  }
  return { entities, attributes, relations };
}

function buildTables(
  entities: TermRow[],
  attributes: TermRow[],
): { tables: TableDef[]; unassigned: Array<{ name: string; type: string; label: string; definition: string | null }> } {
  const _entityIdSet = new Set(entities.map((e) => e.term_id));
  const tables: TableDef[] = [];

  for (const e of entities) {
    tables.push({
      name: termToTableName(e.label),
      label: e.label,
      termId: e.term_id,
      columns: [],
    });
  }

  const unassigned: Array<{ name: string; type: string; label: string; definition: string | null }> = [];

  for (const attr of attributes) {
    const parentTable = tables.find((t) => t.termId === attr.broader_term_id);
    const colName = termToTableName(attr.label);
    const colType = inferColumnType(attr.definition);

    if (parentTable) {
      parentTable.columns.push({ name: colName, type: colType, label: attr.label, definition: attr.definition });
    } else {
      unassigned.push({ name: colName, type: colType, label: attr.label, definition: attr.definition });
    }
  }

  return { tables, unassigned };
}

// ── Mechanical 생성 ─────────────────────────────

function generateCreateTable(table: TableDef): string {
  const lines: string[] = [];
  lines.push(`### ${table.name} (${table.label})`);
  lines.push("");
  lines.push("```sql");
  lines.push(`CREATE TABLE ${table.name} (`);
  lines.push("  id TEXT PRIMARY KEY,");

  for (const col of table.columns) {
    const comment = col.definition ? ` -- ${col.definition}` : "";
    lines.push(`  ${col.name} ${col.type},${comment}`);
  }

  lines.push("  created_at TEXT NOT NULL DEFAULT (datetime('now')),");
  lines.push("  updated_at TEXT NOT NULL DEFAULT (datetime('now'))");
  lines.push(");");
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

function generateMermaidErd(tables: TableDef[], relations: RelationDef[]): string {
  if (tables.length === 0) return "";

  const lines: string[] = [];
  lines.push("```mermaid");
  lines.push("erDiagram");

  for (const table of tables) {
    lines.push(`  ${table.name} {`);
    lines.push("    text id PK");
    for (const col of table.columns) {
      lines.push(`    ${col.type.toLowerCase()} ${col.name}`);
    }
    lines.push("  }");
  }

  // relation → FK 관계 (label에서 두 entity 추론)
  if (relations.length > 0) {
    for (const rel of relations) {
      lines.push(`  %% relation: ${rel.label}`);
    }
  }

  lines.push("```");
  return lines.join("\n");
}

function generateMechanical(
  tables: TableDef[],
  unassigned: Array<{ name: string; type: string; label: string; definition: string | null }>,
  relations: RelationDef[],
  termCount: number,
): string {
  const lines: string[] = [];
  lines.push("# 데이터 모델 명세");
  lines.push("");
  lines.push("> AI Foundry 역공학 파이프라인에서 자동 생성됨");
  lines.push(`> 생성일: ${new Date().toISOString()}`);
  lines.push(`> 총 용어: ${termCount}건 | 테이블: ${tables.length}개`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // ERD
  const erd = generateMermaidErd(tables, relations);
  if (erd) {
    lines.push("## ERD");
    lines.push("");
    lines.push(erd);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // 테이블 정의
  lines.push("## 테이블 정의");
  lines.push("");

  if (tables.length === 0) {
    lines.push("> entity 타입 용어가 없어 테이블을 생성할 수 없습니다.");
    lines.push("");
  }

  for (const table of tables) {
    lines.push(generateCreateTable(table));
  }

  // 미할당 속성
  if (unassigned.length > 0) {
    lines.push("## 미할당 속성 (_unassigned)");
    lines.push("");
    lines.push("| 속성명 | 타입 | 레이블 | 정의 |");
    lines.push("|--------|------|--------|------|");
    for (const col of unassigned) {
      lines.push(`| ${col.name} | ${col.type} | ${col.label} | ${col.definition ?? "-"} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── LLM 보강 ────────────────────────────────────

async function generateWithLlm(
  env: Env,
  entities: TermRow[],
  attributes: TermRow[],
  relations: TermRow[],
): Promise<string | null> {
  const entityList = entities.map((e) => `- [entity] ${e.label}: ${e.definition ?? "(정의 없음)"}`).join("\n");
  const attrList = attributes.map((a) => {
    const broader = a.broader_term_id ? `, broader=${a.broader_term_id}` : "";
    return `- [attribute] ${a.label}: ${a.definition ?? "(정의 없음)"}${broader}`;
  }).join("\n");
  const relList = relations.map((r) => `- [relation] ${r.label}: ${r.definition ?? "(정의 없음)"}`).join("\n");

  const totalTerms = entities.length + attributes.length + relations.length;

  const prompt = `아래 도메인 용어 ${totalTerms}건을 분석하여 데이터 모델을 설계해줘.

## 용어 목록

### Entity (${entities.length}건)
${entityList || "(없음)"}

### Attribute (${attributes.length}건)
${attrList || "(없음)"}

### Relation (${relations.length}건)
${relList || "(없음)"}

## 요구사항
1. 각 entity → CREATE TABLE (id TEXT PRIMARY KEY, ... 컬럼, created_at, updated_at)
2. attribute → 적절한 컬럼 타입 (TEXT/INTEGER/REAL)
3. relation → FOREIGN KEY + Mermaid erDiagram
4. 각 테이블에 비즈니스 의미 주석
5. Enum CHECK 제약 (status 등)
6. 인덱스 (FK, status, 자주 조회 컬럼)

출력 포맷: Markdown + CREATE TABLE SQL (SQLite 호환) + Mermaid ERD.`;

  try {
    const content = await callLlmRouter(env, "svc-skill", "sonnet", prompt, {
      system: "너는 데이터 모델 설계 전문가야. 도메인 용어 목록에서 관계형 DB 스키마를 설계한다. 출력 포맷: Markdown + CREATE TABLE SQL (SQLite 호환) + Mermaid ERD.",
      maxTokens: 4000,
    });
    if (content) {
      return content;
    }
  } catch {
    // LLM 실패 → null 반환, caller에서 fallback
  }
  return null;
}

// ── 메인 생성 함수 ──────────────────────────────

export async function generateDataModel(
  env: Env,
  terms: TermRow[],
  options?: { skipLlm?: boolean },
): Promise<GeneratedFile> {
  const skipLlm = options?.skipLlm ?? false;
  const { entities, attributes, relations } = classifyTerms(terms);
  const { tables, unassigned } = buildTables(entities, attributes);

  const relationDefs: RelationDef[] = relations.map((r) => ({
    label: r.label,
    definition: r.definition,
  }));

  let content: string;
  let generatedBy: "mechanical" | "llm-sonnet" = "mechanical";

  if (!skipLlm) {
    const llmContent = await generateWithLlm(env, entities, attributes, relations);
    if (llmContent) {
      // LLM 성공: 헤더 + LLM 출력
      const header = [
        "# 데이터 모델 명세",
        "",
        "> AI Foundry 역공학 파이프라인에서 자동 생성됨 (LLM 보강)",
        `> 생성일: ${new Date().toISOString()}`,
        `> 총 용어: ${terms.length}건 | 테이블: ${tables.length}개`,
        "",
        "---",
        "",
      ].join("\n");
      content = header + llmContent;
      generatedBy = "llm-sonnet";
    } else {
      // LLM 실패: mechanical fallback
      content = generateMechanical(tables, unassigned, relationDefs, terms.length);
    }
  } else {
    content = generateMechanical(tables, unassigned, relationDefs, terms.length);
  }

  return {
    path: "specs/02-data-model.md",
    content,
    type: "spec",
    generatedBy,
    sourceCount: terms.length,
  };
}
