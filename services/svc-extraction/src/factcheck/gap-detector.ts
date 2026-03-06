/**
 * Gap Detector — MatchResult로부터 Gap을 분류하고 생성.
 *
 * 1. MID gaps — 소스에만 존재 (문서에 누락)
 * 2. MC gaps  — 문서에만 존재 (소스에 누락)
 * 3. SM gaps  — 매칭된 테이블의 컬럼 불일치
 * 4. TM gaps  — 매칭된 테이블의 타입 불일치
 * 5. PM gaps  — 매칭된 API의 파라미터 불일치
 */

import type { FactCheckGap, GapType } from "@ai-foundry/types";
import type { MatchResult } from "./matcher.js";
import type {
  SourceSpec,
  DocSpec,
  SourceApi,
  SourceApiParam,
  SourceTable,
  DocApi,
  DocTable,
} from "./types.js";
import { classifySeverity, isTypeCompatible } from "./severity.js";
import { matchColumnName } from "./matcher.js";

// ── Public types ────────────────────────────────────────────────

export interface GapDetectionResult {
  gaps: FactCheckGap[];
  stats: {
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    total: number;
  };
}

// ── Main ────────────────────────────────────────────────────────

/**
 * Detect gaps from a match result by comparing matched and unmatched items.
 */
export function detectGaps(
  matchResult: MatchResult,
  sourceSpec: SourceSpec,
  docSpec: DocSpec,
  resultId: string,
  organizationId: string,
): GapDetectionResult {
  const gaps: FactCheckGap[] = [];

  // 1. MID gaps — source items not found in document
  for (const api of matchResult.unmatchedSourceApis) {
    gaps.push(buildGap({
      resultId,
      organizationId,
      gapType: "MID",
      sourceItem: JSON.stringify({ path: api.path, method: api.httpMethods, controller: api.controllerClass }),
      sourceDocumentId: api.documentId,
      description: `소스 API '${api.path}' (${api.controllerClass}.${api.methodName})가 문서에 존재하지 않습니다`,
      isPrimaryKey: false,
      isExternalApi: !isInternalApi(api),
    }));
  }

  for (const table of matchResult.unmatchedSourceTables) {
    gaps.push(buildGap({
      resultId,
      organizationId,
      gapType: "MID",
      sourceItem: JSON.stringify({ tableName: table.tableName, columns: table.columns.length, source: table.source }),
      sourceDocumentId: table.documentId,
      description: `소스 테이블 '${table.tableName}' (컬럼 ${table.columns.length}개)이 문서에 존재하지 않습니다`,
      isPrimaryKey: true, // core table missing → HIGH
      isExternalApi: false,
    }));
  }

  // 2. MC gaps — document items not found in source
  for (const api of matchResult.unmatchedDocApis) {
    gaps.push(buildGap({
      resultId,
      organizationId,
      gapType: "MC",
      sourceItem: JSON.stringify({ note: "문서에만 존재하는 API" }),
      documentItem: JSON.stringify({ path: api.path, method: api.httpMethod }),
      documentId: api.documentId,
      description: `문서 API '${api.path}'에 대응하는 소스 코드가 존재하지 않습니다`,
      isPrimaryKey: false,
      isRequired: false,
    }));
  }

  for (const table of matchResult.unmatchedDocTables) {
    gaps.push(buildGap({
      resultId,
      organizationId,
      gapType: "MC",
      sourceItem: JSON.stringify({ note: "문서에만 존재하는 테이블" }),
      documentItem: JSON.stringify({ tableName: table.tableName, columns: table.columns.length }),
      documentId: table.documentId,
      description: `문서 테이블 '${table.tableName}'에 대응하는 소스 코드가 존재하지 않습니다`,
      isPrimaryKey: false,
      isRequired: true, // table in doc but not in source → HIGH
    }));
  }

  // 3 & 4. Compare columns for matched tables → SM + TM gaps
  for (const matched of matchResult.matchedItems) {
    if (matched.sourceRef.type === "table" && matched.docRef) {
      const srcTable = findSourceTable(sourceSpec, matched.sourceRef.name);
      const docTable = findDocTable(docSpec, matched.docRef.name);

      if (srcTable && docTable) {
        gaps.push(...detectColumnGaps(srcTable, docTable, resultId, organizationId));
      }
    }
  }

  // 5. Compare parameters for matched APIs → PM gaps
  for (const matched of matchResult.matchedItems) {
    if (matched.sourceRef.type === "api" && matched.docRef) {
      const srcApi = findSourceApi(sourceSpec, matched.sourceRef.name);
      const docApi = findDocApi(docSpec, matched.docRef.name);

      if (srcApi && docApi) {
        gaps.push(...detectParamGaps(srcApi, docApi, resultId, organizationId));
      }
    }
  }

  // Build stats
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const gap of gaps) {
    byType[gap.gapType] = (byType[gap.gapType] ?? 0) + 1;
    bySeverity[gap.severity] = (bySeverity[gap.severity] ?? 0) + 1;
  }

  return {
    gaps,
    stats: {
      byType,
      bySeverity,
      total: gaps.length,
    },
  };
}

// ── Column Gap Detection ────────────────────────────────────────

function detectColumnGaps(
  srcTable: SourceTable,
  docTable: DocTable,
  resultId: string,
  organizationId: string,
): FactCheckGap[] {
  const gaps: FactCheckGap[] = [];

  // Find matched columns
  const matchedSrcCols = new Set<number>();
  const matchedDocCols = new Set<number>();

  for (let si = 0; si < srcTable.columns.length; si++) {
    const srcCol = srcTable.columns[si];
    if (!srcCol) continue;

    for (let di = 0; di < docTable.columns.length; di++) {
      if (matchedDocCols.has(di)) continue;
      const docCol = docTable.columns[di];
      if (!docCol) continue;

      const srcName = srcCol.javaProperty ?? srcCol.name;
      if (matchColumnName(srcName, docCol.name)) {
        matchedSrcCols.add(si);
        matchedDocCols.add(di);

        // Check type compatibility for matched columns
        const srcType = srcCol.javaType ?? srcCol.sqlType;
        const docType = docCol.dataType;
        if (srcType && docType && !isTypeCompatible(srcType, docType)) {
          gaps.push(buildGap({
            resultId,
            organizationId,
            gapType: "TM",
            sourceItem: JSON.stringify({ table: srcTable.tableName, column: srcCol.name, type: srcType }),
            sourceDocumentId: srcTable.documentId,
            documentItem: JSON.stringify({ table: docTable.tableName, column: docCol.name, type: docType }),
            documentId: docTable.documentId,
            description: `테이블 '${srcTable.tableName}' 컬럼 '${srcCol.name}': 소스 타입 '${srcType}'과 문서 타입 '${docType}'이 호환되지 않습니다`,
            isPrimaryKey: srcCol.isPrimaryKey,
            sourceType: srcType,
            docType,
          }));
        }

        break;
      }
    }
  }

  // Source columns not in doc → SM gap
  for (let si = 0; si < srcTable.columns.length; si++) {
    if (matchedSrcCols.has(si)) continue;
    const srcCol = srcTable.columns[si];
    if (!srcCol) continue;

    gaps.push(buildGap({
      resultId,
      organizationId,
      gapType: "SM",
      sourceItem: JSON.stringify({ table: srcTable.tableName, column: srcCol.name, type: srcCol.javaType ?? srcCol.sqlType }),
      sourceDocumentId: srcTable.documentId,
      documentItem: JSON.stringify({ table: docTable.tableName, note: "컬럼 미존재" }),
      documentId: docTable.documentId,
      description: `테이블 '${srcTable.tableName}' 소스 컬럼 '${srcCol.name}'이 문서 테이블 '${docTable.tableName}'에 존재하지 않습니다`,
      isPrimaryKey: srcCol.isPrimaryKey,
      isRequired: !srcCol.nullable,
    }));
  }

  // Doc columns not in source → SM gap
  for (let di = 0; di < docTable.columns.length; di++) {
    if (matchedDocCols.has(di)) continue;
    const docCol = docTable.columns[di];
    if (!docCol) continue;

    gaps.push(buildGap({
      resultId,
      organizationId,
      gapType: "SM",
      sourceItem: JSON.stringify({ table: srcTable.tableName, note: "컬럼 미존재" }),
      sourceDocumentId: srcTable.documentId,
      documentItem: JSON.stringify({ table: docTable.tableName, column: docCol.name, type: docCol.dataType }),
      documentId: docTable.documentId,
      description: `테이블 '${docTable.tableName}' 문서 컬럼 '${docCol.name}'이 소스 테이블 '${srcTable.tableName}'에 존재하지 않습니다`,
      isPrimaryKey: docCol.isPrimaryKey ?? false,
      isRequired: docCol.nullable === false,
    }));
  }

  return gaps;
}

// ── Parameter Gap Detection ─────────────────────────────────────

/**
 * Check if a source parameter should be excluded from PM gap detection.
 * - Auth headers (@RequestHeader or name="Auth" + type="String")
 * - PathVariable params already encoded in URL path
 */
function shouldSkipSourceParam(param: SourceApiParam, apiPath: string): boolean {
  // Skip @RequestHeader params (auth tokens, etc.)
  if (param.annotation?.toLowerCase().includes("requestheader")) return true;

  // Skip Auth header even without annotation (LPON pattern: no annotation captured)
  if (param.name === "Auth" && param.type === "String") return true;

  // Skip @PathVariable params — already represented in URL path
  if (param.annotation?.toLowerCase().includes("pathvariable")) return true;

  // Skip params whose name appears as {paramName} in the URL
  if (apiPath.includes(`{${param.name}}`)) return true;

  return false;
}

function detectParamGaps(
  srcApi: SourceApi,
  docApi: DocApi,
  resultId: string,
  organizationId: string,
): FactCheckGap[] {
  const gaps: FactCheckGap[] = [];
  const docParams = docApi.parameters ?? [];

  // Check for missing required source params in doc
  for (const srcParam of srcApi.parameters) {
    if (shouldSkipSourceParam(srcParam, srcApi.path)) continue;

    const docMatch = docParams.find(
      (dp) => dp.name.toLowerCase() === srcParam.name.toLowerCase(),
    );

    if (!docMatch) {
      gaps.push(buildGap({
        resultId,
        organizationId,
        gapType: "PM",
        sourceItem: JSON.stringify({ api: srcApi.path, param: srcParam.name, type: srcParam.type, required: srcParam.required }),
        sourceDocumentId: srcApi.documentId,
        documentItem: JSON.stringify({ api: docApi.path, note: "파라미터 미존재" }),
        documentId: docApi.documentId,
        description: `API '${srcApi.path}' 소스 파라미터 '${srcParam.name}'(${srcParam.required ? "필수" : "선택"})이 문서에 정의되지 않았습니다`,
        isRequired: srcParam.required,
        isExternalApi: !isInternalApi(srcApi),
      }));
    }
  }

  // Check for doc params not in source
  for (const docParam of docParams) {
    const srcMatch = srcApi.parameters.find(
      (sp) => sp.name.toLowerCase() === docParam.name.toLowerCase(),
    );

    if (!srcMatch) {
      gaps.push(buildGap({
        resultId,
        organizationId,
        gapType: "PM",
        sourceItem: JSON.stringify({ api: srcApi.path, note: "파라미터 미존재" }),
        sourceDocumentId: srcApi.documentId,
        documentItem: JSON.stringify({ api: docApi.path, param: docParam.name, type: docParam.type }),
        documentId: docApi.documentId,
        description: `API '${docApi.path}' 문서 파라미터 '${docParam.name}'이 소스 코드에 정의되지 않았습니다`,
        isRequired: docParam.required ?? false,
        isExternalApi: !isInternalApi(srcApi),
      }));
    }
  }

  return gaps;
}

// ── Helpers ──────────────────────────────────────────────────────

interface BuildGapOptions {
  resultId: string;
  organizationId: string;
  gapType: GapType;
  sourceItem: string;
  sourceDocumentId?: string | undefined;
  documentItem?: string | undefined;
  documentId?: string | undefined;
  description: string;
  isPrimaryKey?: boolean | undefined;
  isRequired?: boolean | undefined;
  isExternalApi?: boolean | undefined;
  sourceType?: string | undefined;
  docType?: string | undefined;
}

function buildGap(opts: BuildGapOptions): FactCheckGap {
  const severity = classifySeverity({
    gapType: opts.gapType,
    isPrimaryKey: opts.isPrimaryKey,
    isRequired: opts.isRequired,
    isExternalApi: opts.isExternalApi,
    sourceType: opts.sourceType,
    docType: opts.docType,
  });

  const gap: FactCheckGap = {
    gapId: crypto.randomUUID(),
    resultId: opts.resultId,
    organizationId: opts.organizationId,
    gapType: opts.gapType,
    severity,
    sourceItem: opts.sourceItem,
    description: opts.description,
    autoResolved: false,
    reviewStatus: "pending",
    createdAt: new Date().toISOString(),
  };

  // Only set optional properties when values are actually provided
  if (opts.sourceDocumentId !== undefined) {
    gap.sourceDocumentId = opts.sourceDocumentId;
  }
  if (opts.documentItem !== undefined) {
    gap.documentItem = opts.documentItem;
  }
  if (opts.documentId !== undefined) {
    gap.documentId = opts.documentId;
  }

  return gap;
}

function isInternalApi(api: SourceApi): boolean {
  const path = api.path.toLowerCase();
  return path.includes("/internal/")
    || path.includes("/health")
    || path.includes("/debug")
    || path.includes("/test");
}

function findSourceTable(spec: SourceSpec, name: string): SourceTable | undefined {
  return spec.tables.find((t) => t.tableName === name);
}

function findDocTable(spec: DocSpec, name: string): DocTable | undefined {
  return spec.tables.find((t) => t.tableName === name);
}

function findSourceApi(spec: SourceSpec, path: string): SourceApi | undefined {
  return spec.apis.find((a) => a.path === path);
}

function findDocApi(spec: DocSpec, path: string): DocApi | undefined {
  return spec.apis.find((a) => a.path === path);
}
