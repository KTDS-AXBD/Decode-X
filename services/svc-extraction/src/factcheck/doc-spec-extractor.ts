/**
 * Document Spec Extractor — parses Markdown tables from document chunks
 * to extract API and Table specifications for Fact Check comparison.
 *
 * LPON documents (XLSX -> Unstructured.io) produce Markdown tables with
 * Korean/English headers. This module detects schema type via keyword
 * matching and extracts structured DocApi[] and DocTable[].
 */

import type { DocSpec, DocApi, DocTable, DocTableColumn, DocApiParam } from "./types.js";
import type { Env } from "../env.js";

// ── Types ────────────────────────────────────────────────────────

/** A parsed Markdown table with header labels and data rows. */
export interface ParsedTable {
  headers: string[];
  rows: string[][];
  /** Raw text preceding the table (for table name detection). */
  precedingContext: string;
}

/** Classification types relevant for doc spec extraction. */
const DOC_CLASSIFICATIONS = new Set(["api_spec", "erd", "general"]);

// ── Keyword Maps ─────────────────────────────────────────────────

const API_PATH_KEYWORDS = ["URL", "경로", "URI", "Path", "Endpoint", "엔드포인트"];
const API_METHOD_KEYWORDS = ["Method", "메소드", "HTTP", "방식"];
const API_ID_KEYWORDS = ["인터페이스ID", "API ID", "IF-ID", "I/F ID"];
const API_DESC_KEYWORDS = ["설명", "비고", "Description", "인터페이스명"];
const API_PARAM_KEYWORDS = ["파라미터", "Parameter", "입력", "Input"];

const TBL_COLUMN_NAME_KEYWORDS = ["컬럼명", "Column", "필드명", "Field", "영문명", "영문"];
const TBL_DATA_TYPE_KEYWORDS = ["데이터타입", "Type", "타입", "DataType", "자료형"];
const TBL_NULLABLE_KEYWORDS = ["NULL", "Nullable", "필수", "NOT NULL"];
const TBL_PK_KEYWORDS = ["PK", "Primary", "기본키"];
const TBL_DESC_KEYWORDS = ["설명", "비고", "한글명", "Description"];

// ── Markdown Table Regex ─────────────────────────────────────────

/**
 * Matches a full Markdown table block:
 *   | header1 | header2 |
 *   |---------|---------|
 *   | cell1   | cell2   |
 */
const RE_MD_TABLE = /\|[^\n]+\|\n\|[-:\s|]+\|\n(?:\|[^\n]+\|\n?)+/g;

/**
 * Matches a Markdown heading line preceding a table (for table name detection).
 * e.g. "### 테이블명: TB_VOUCHER" or "## TB_ACCOUNT"
 */
const RE_HEADING = /^#{1,6}\s+(.+)$/gm;

/**
 * Matches table name in heading context.
 * e.g. "테이블명: TB_VOUCHER" or "테이블명 : TB_VOUCHER" or "TABLE: TB_VOUCHER"
 */
const RE_TABLE_NAME_IN_HEADING = /(?:테이블명|테이블|Table(?:\s*Name)?)\s*[:\uFF1A]\s*(\S+)/i;

// ── Helper: keyword matching ─────────────────────────────────────

function matchesKeyword(header: string, keywords: string[]): boolean {
  const h = header.trim();
  return keywords.some((kw) => {
    return h.toLowerCase().includes(kw.toLowerCase());
  });
}

function findColumnIndex(headers: string[], keywords: string[]): number {
  return headers.findIndex((h) => matchesKeyword(h, keywords));
}

// ── Parse Markdown Tables ────────────────────────────────────────

/**
 * Extract all Markdown tables from raw text.
 * Each table includes the preceding text for context (table name detection).
 */
export function parseMarkdownTables(text: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  const regex = new RegExp(RE_MD_TABLE.source, RE_MD_TABLE.flags);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const tableText = match[0];
    const lines = tableText.split("\n").filter((l) => l.trim().length > 0);

    if (lines.length < 3) continue; // header + separator + at least 1 data row

    const headerLine = lines[0];
    if (!headerLine) continue;
    // lines[1] is the separator row (|---|---|)
    const dataLines = lines.slice(2);

    const headers = parseMdRow(headerLine);
    if (headers.length === 0) continue;

    const rows: string[][] = [];
    for (const line of dataLines) {
      const cells = parseMdRow(line);
      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (rows.length === 0) continue;

    // Extract preceding context (up to 500 chars before the table)
    const tableStart = match.index;
    const contextStart = Math.max(0, tableStart - 500);
    const precedingContext = text.slice(contextStart, tableStart);

    tables.push({ headers, rows, precedingContext });
  }

  return tables;
}

/** Parse a single Markdown table row into trimmed cell values. */
function parseMdRow(line: string): string[] {
  const parts = line.split("|");
  // Trim first and last (they're empty from leading/trailing |)
  const cells = parts.slice(1, -1).map((c) => c.trim());
  return cells;
}

// ── API Spec Extraction ──────────────────────────────────────────

/** Detect if a table contains API spec data and extract DocApi entries. */
export function extractApiSpecs(
  tables: ParsedTable[],
  documentId: string,
  location: string,
): DocApi[] {
  const apis: DocApi[] = [];

  for (const table of tables) {
    const pathIdx = findColumnIndex(table.headers, API_PATH_KEYWORDS);
    const methodIdx = findColumnIndex(table.headers, API_METHOD_KEYWORDS);

    // Must have at least a path column to be an API table
    if (pathIdx < 0) continue;

    const idIdx = findColumnIndex(table.headers, API_ID_KEYWORDS);
    const descIdx = findColumnIndex(table.headers, API_DESC_KEYWORDS);
    const paramIdx = findColumnIndex(table.headers, API_PARAM_KEYWORDS);

    for (const row of table.rows) {
      const path = cellAt(row, pathIdx);
      if (!path || !looksLikePath(path)) continue;

      const api: DocApi = {
        path,
        documentId,
        location,
      };

      if (methodIdx >= 0) {
        const method = cellAt(row, methodIdx);
        if (method) {
          api.httpMethod = method.toUpperCase();
        }
      }

      if (idIdx >= 0) {
        const id = cellAt(row, idIdx);
        if (id) {
          api.interfaceId = id;
        }
      }

      if (descIdx >= 0) {
        const desc = cellAt(row, descIdx);
        if (desc) {
          api.description = desc;
        }
      }

      if (paramIdx >= 0) {
        const paramText = cellAt(row, paramIdx);
        if (paramText) {
          api.parameters = parseParamText(paramText);
        }
      }

      apis.push(api);
    }
  }

  return apis;
}

/** Check if a string looks like an API path. */
function looksLikePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("http");
}

/** Parse a simple parameter text into DocApiParam[]. */
function parseParamText(text: string): DocApiParam[] {
  const parts = text.split(/[,\n]/).map((p) => p.trim()).filter(Boolean);
  return parts.map((p): DocApiParam => {
    // Try "name: type" or "name：type" pattern
    const colonMatch = p.match(/^(\w+)\s*[:\uFF1A]\s*(.+)$/);
    if (colonMatch?.[1] && colonMatch[2]) {
      return { name: colonMatch[1], type: colonMatch[2] };
    }
    // Try "name (type)" pattern
    const parenMatch = p.match(/^(\w+)\s*\(([^)]+)\)$/);
    if (parenMatch?.[1] && parenMatch[2]) {
      return { name: parenMatch[1], type: parenMatch[2] };
    }
    return { name: p };
  });
}

// ── Table Spec Extraction ────────────────────────────────────────

/** Detect if a table contains table definition data and extract DocTable entries. */
export function extractTableSpecs(
  tables: ParsedTable[],
  documentId: string,
  location: string,
): DocTable[] {
  const results: DocTable[] = [];

  for (const table of tables) {
    const colNameIdx = findColumnIndex(table.headers, TBL_COLUMN_NAME_KEYWORDS);
    const dataTypeIdx = findColumnIndex(table.headers, TBL_DATA_TYPE_KEYWORDS);

    // Must have at least a column name field to be a table definition
    if (colNameIdx < 0) continue;

    const nullableIdx = findColumnIndex(table.headers, TBL_NULLABLE_KEYWORDS);
    const pkIdx = findColumnIndex(table.headers, TBL_PK_KEYWORDS);
    const descIdx = findColumnIndex(table.headers, TBL_DESC_KEYWORDS);

    const tableName = detectTableName(table);

    const columns: DocTableColumn[] = [];

    for (const row of table.rows) {
      const name = cellAt(row, colNameIdx);
      if (!name) continue;

      const col: DocTableColumn = { name };

      if (dataTypeIdx >= 0) {
        const dt = cellAt(row, dataTypeIdx);
        if (dt) {
          col.dataType = dt;
        }
      }

      if (nullableIdx >= 0) {
        const nv = cellAt(row, nullableIdx);
        if (nv) {
          col.nullable = parseNullable(nv, table.headers, nullableIdx);
        }
      }

      if (pkIdx >= 0) {
        const pv = cellAt(row, pkIdx);
        if (pv) {
          col.isPrimaryKey = parseBooleanYes(pv);
        }
      }

      if (descIdx >= 0) {
        const desc = cellAt(row, descIdx);
        if (desc) {
          col.description = desc;
        }
      }

      columns.push(col);
    }

    if (columns.length === 0) continue;

    results.push({
      tableName: tableName || "UNKNOWN",
      columns,
      documentId,
      location,
    });
  }

  return results;
}

/**
 * Parse nullable value considering the header keyword context.
 * - "NULL" header: Y/Yes -> true (nullable), N/No -> false (not nullable)
 * - "필수"/"NOT NULL" header: Y/Yes -> false (not nullable), N/No -> true (nullable)
 */
function parseNullable(value: string, headers: string[], colIdx: number): boolean {
  const headerText = headers[colIdx] ?? "";
  const isInvertedHeader = /필수|NOT\s*NULL/i.test(headerText);
  const isYes = parseBooleanYes(value);

  // If the header says "필수" or "NOT NULL", Y means NOT nullable
  return isInvertedHeader ? !isYes : isYes;
}

/** Parse Y/Yes/O as true, N/No/X as false. */
function parseBooleanYes(value: string): boolean {
  const v = value.trim().toUpperCase();
  return v === "Y" || v === "YES" || v === "O" || v === "TRUE" || v === "1";
}

/** Try to detect the table name from preceding context or a table name column. */
function detectTableName(table: ParsedTable): string {
  // 1. Check headers for a "테이블명" column
  const tableNameIdx = findColumnIndex(table.headers, ["테이블명", "Table Name", "TABLE", "테이블"]);
  if (tableNameIdx >= 0) {
    const firstRow = table.rows[0];
    if (firstRow) {
      const val = cellAt(firstRow, tableNameIdx);
      if (val) return val;
    }
  }

  // 2. Check preceding context for heading with table name pattern
  const headingRegex = new RegExp(RE_TABLE_NAME_IN_HEADING.source, RE_TABLE_NAME_IN_HEADING.flags);
  const headingMatch = headingRegex.exec(table.precedingContext);
  if (headingMatch?.[1]) {
    return headingMatch[1];
  }

  // 3. Check for any heading in preceding context (last heading wins)
  let lastHeading = "";
  const hRegex = new RegExp(RE_HEADING.source, RE_HEADING.flags);
  let hMatch: RegExpExecArray | null;
  while ((hMatch = hRegex.exec(table.precedingContext)) !== null) {
    if (hMatch[1]) {
      lastHeading = hMatch[1].trim();
    }
  }

  // If the last heading looks like a table name (contains TB_ or T_ prefix)
  if (/\bT(?:B)?_\w+/i.test(lastHeading)) {
    const tnMatch = lastHeading.match(/\b(T(?:B)?_\w+)/i);
    if (tnMatch?.[1]) return tnMatch[1];
  }

  return "";
}

/** Safely get a cell value from a row by index. */
function cellAt(row: string[], index: number): string {
  const val = row[index];
  if (val === undefined) return "";
  return val.trim();
}

// ── Main: extractDocSpec ─────────────────────────────────────────

interface IngestionDocument {
  document_id: string;
  organization_id: string;
  uploaded_by: string;
  r2_key: string;
  file_type: string;
  file_size_byte: number;
  original_name: string;
  status: string;
  uploaded_at: string;
  error_message: string | null;
  error_type: string | null;
}

interface IngestionChunk {
  chunk_id: string;
  chunk_index: number;
  element_type: string;
  masked_text: string;
  classification: string;
  word_count: number;
}

/**
 * Fetch document chunks from svc-ingestion and extract API/Table specs
 * from Markdown tables found in documentation chunks.
 */
export async function extractDocSpec(
  env: Env,
  organizationId: string,
): Promise<DocSpec> {
  const allApis: DocApi[] = [];
  const allTables: DocTable[] = [];
  let apiDocCount = 0;
  let tableDocCount = 0;

  // 1. Fetch all parsed documents for the organization
  const documents = await fetchDocuments(env, organizationId);

  // 2. For each document, fetch chunks and extract specs
  for (const doc of documents) {
    if (doc.status !== "parsed") continue;

    const chunks = await fetchChunks(env, doc.document_id);
    if (chunks.length === 0) continue;

    // Filter for documentation-relevant chunks
    const docChunks = chunks.filter((c) => DOC_CLASSIFICATIONS.has(c.classification));
    if (docChunks.length === 0) continue;

    let docHasApi = false;
    let docHasTable = false;

    for (const chunk of docChunks) {
      const tables = parseMarkdownTables(chunk.masked_text);
      if (tables.length === 0) continue;

      const location = `${doc.original_name}:chunk-${chunk.chunk_index}`;

      if (chunk.classification === "api_spec") {
        const apis = extractApiSpecs(tables, doc.document_id, location);
        if (apis.length > 0) {
          allApis.push(...apis);
          docHasApi = true;
        }
      } else if (chunk.classification === "erd") {
        const tblSpecs = extractTableSpecs(tables, doc.document_id, location);
        if (tblSpecs.length > 0) {
          allTables.push(...tblSpecs);
          docHasTable = true;
        }
      } else {
        // general classification — try both extractors
        const apis = extractApiSpecs(tables, doc.document_id, location);
        if (apis.length > 0) {
          allApis.push(...apis);
          docHasApi = true;
        }
        const tblSpecs = extractTableSpecs(tables, doc.document_id, location);
        if (tblSpecs.length > 0) {
          allTables.push(...tblSpecs);
          docHasTable = true;
        }
      }
    }

    if (docHasApi) apiDocCount++;
    if (docHasTable) tableDocCount++;
  }

  return {
    apis: allApis,
    tables: allTables,
    stats: {
      apiDocCount,
      tableDocCount,
      totalApis: allApis.length,
      totalTables: allTables.length,
    },
  };
}

// ── Service Binding Helpers ──────────────────────────────────────

async function fetchDocuments(
  env: Env,
  organizationId: string,
): Promise<IngestionDocument[]> {
  const resp = await env.SVC_INGESTION.fetch(
    "http://internal/documents?limit=1000",
    {
      headers: {
        "X-Internal-Secret": env.INTERNAL_API_SECRET,
        "X-Organization-Id": organizationId,
      },
    },
  );

  if (!resp.ok) return [];

  const body: unknown = await resp.json();
  const data = (body as { success: boolean; data?: { documents?: IngestionDocument[] } })["data"];
  return data?.documents ?? [];
}

async function fetchChunks(
  env: Env,
  documentId: string,
): Promise<IngestionChunk[]> {
  const resp = await env.SVC_INGESTION.fetch(
    `http://internal/documents/${documentId}/chunks`,
    {
      headers: {
        "X-Internal-Secret": env.INTERNAL_API_SECRET,
      },
    },
  );

  if (!resp.ok) return [];

  const body: unknown = await resp.json();
  const data = (body as { success: boolean; data?: { chunks?: IngestionChunk[] } })["data"];
  return data?.chunks ?? [];
}
