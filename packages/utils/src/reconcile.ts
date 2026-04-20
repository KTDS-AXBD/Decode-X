import type {
  DocApiSpec,
  ReconcileResult,
  ReconciliationReport,
} from "@ai-foundry/types";
import type { SourceAnalysisResult } from "@ai-foundry/types";

// Normalize path: remove trailing slash, convert {param} → :param
function normalizePath(p: string): string {
  return p
    .replace(/\{([^}]+)\}/g, ":$1")
    .replace(/\/+$/, "") || "/";
}

function buildKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${normalizePath(path)}`;
}

export function reconcile(
  source: SourceAnalysisResult,
  docSpec: DocApiSpec,
): ReconciliationReport {
  const results: ReconcileResult[] = [];

  // Build source endpoint map: key → { path, methods, paramCount }
  const sourceMap = new Map<string, { path: string; paramCount: number }>();
  for (const ctrl of source.controllers) {
    for (const ep of ctrl.endpoints) {
      for (const method of ep.httpMethod) {
        const key = buildKey(method, ep.path);
        sourceMap.set(key, {
          path: ep.path,
          paramCount: ep.parameters.length,
        });
      }
    }
  }

  // Build doc endpoint map: key → { path, paramCount }
  const docMap = new Map<string, { path: string; paramCount: number }>();
  for (const ep of docSpec.endpoints) {
    const key = buildKey(ep.method, ep.path);
    docMap.set(key, {
      path: ep.path,
      paramCount: ep.params?.length ?? 0,
    });
  }

  // SOURCE_MISSING: in source but not in doc
  for (const [key, src] of sourceMap.entries()) {
    if (!docMap.has(key)) {
      results.push({
        marker: "SOURCE_MISSING",
        subject: src.path,
        httpMethod: key.split(" ")[0] ?? undefined,
        sourceDetail: `source has ${src.paramCount} param(s)`,
        docDetail: "not documented",
      });
    }
  }

  // DOC_ONLY: in doc but not in source
  for (const [key, doc] of docMap.entries()) {
    if (!sourceMap.has(key)) {
      results.push({
        marker: "DOC_ONLY",
        subject: doc.path,
        httpMethod: key.split(" ")[0] ?? undefined,
        docDetail: `doc specifies ${doc.paramCount} param(s)`,
        sourceDetail: "not implemented",
      });
    }
  }

  // DIVERGENCE: in both but different
  for (const [key, src] of sourceMap.entries()) {
    const doc = docMap.get(key);
    if (!doc) continue;

    if (src.paramCount !== doc.paramCount) {
      results.push({
        marker: "DIVERGENCE",
        subject: src.path,
        httpMethod: key.split(" ")[0] ?? undefined,
        sourceDetail: `${src.paramCount} param(s)`,
        docDetail: `${doc.paramCount} param(s)`,
        divergenceReason: `paramCount: source=${src.paramCount} doc=${doc.paramCount}`,
      });
    }
  }

  const summary = {
    sourceMissing: results.filter((r) => r.marker === "SOURCE_MISSING").length,
    docOnly: results.filter((r) => r.marker === "DOC_ONLY").length,
    divergences: results.filter((r) => r.marker === "DIVERGENCE").length,
    total: results.length,
  };

  return {
    projectName: source.projectName,
    analyzedAt: new Date().toISOString(),
    results,
    summary,
  };
}
