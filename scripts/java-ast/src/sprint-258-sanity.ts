/**
 * Sprint 258 — reconcile.ts sanity check
 *
 * Tree-sitter PoC AST 산출물(`/tmp/sprint-258-poc-tree-sitter.json`) → SourceAnalysisResult 변환
 * → mock DocApiSpec와 reconcile() → SOURCE_MISSING/DOC_ONLY/DIVERGENCE markers 분포 확인.
 *
 * 실행: cd scripts/java-ast && npx tsx src/sprint-258-sanity.ts [--out PATH]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { reconcile } from "../../../packages/utils/src/reconcile.js";
import type {
  DocApiSpec,
  SourceAnalysisResult,
} from "../../../packages/types/src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── PoC report → SourceAnalysisResult 변환 ───────────────────────────────────

interface PoCSampleEndpoint {
  httpMethod: string;
  fullPath: string;
  methodPath: string;
  methodName: string;
  paramCount: number;
  returnType: string;
}

interface PoCSampleClass {
  className: string;
  packageName: string;
  kind: string;
  basePath: string;
  endpoints: PoCSampleEndpoint[];
  fields?: unknown[];
}

interface PoCSample {
  file: string;
  tsClasses: PoCSampleClass[];
}

interface PoCReport {
  samples: PoCSample[];
}

function buildSourceFromPoC(poc: PoCReport): SourceAnalysisResult {
  const controllers: SourceAnalysisResult["controllers"] = [];

  for (const sample of poc.samples) {
    for (const c of sample.tsClasses) {
      if (c.kind !== "controller" || c.endpoints.length === 0) continue;
      controllers.push({
        className: c.className,
        packageName: c.packageName,
        basePath: c.basePath,
        endpoints: c.endpoints.map((ep) => ({
          httpMethod: [ep.httpMethod],
          path: ep.fullPath,
          methodName: ep.methodName,
          parameters: Array.from({ length: ep.paramCount }, (_, idx) => ({
            name: `param${idx}`,
            type: "Object",
            required: true,
          })),
          returnType: ep.returnType,
        })),
      });
    }
  }

  return {
    projectName: "lpon-poc",
    controllers,
    services: [],
    dataModels: [],
    sqlMigrations: [],
    stats: {
      totalFiles: poc.samples.length,
      javaFiles: poc.samples.length,
      sqlFiles: 0,
      controllerCount: controllers.length,
      endpointCount: controllers.reduce((s, c) => s + c.endpoints.length, 0),
      dataModelCount: 0,
      transactionCount: 0,
      ddlTableCount: 0,
      mapperCount: 0,
    },
  };
}

// ─── Mock DocApiSpec (의도적 mismatch 3종) ────────────────────────────────────

function buildMockDoc(): DocApiSpec {
  return {
    projectName: "lpon-poc",
    endpoints: [
      // (1) source에 존재 — DOC_ONLY 미분류 + DIVERGENCE 후보
      {
        method: "POST",
        path: "/api/v1/lpon/payment/charge",
        params: [{ name: "body", type: "ChargeRequest", required: true }],
      },
      {
        method: "GET",
        path: "/api/v1/lpon/payment/balance/{accountNo}",
        params: [{ name: "accountNo", type: "String", required: true }],
      },
      // (2) doc에만 존재 (source 부재) → DOC_ONLY
      {
        method: "GET",
        path: "/api/v1/lpon/payment/legacy",
        params: [],
      },
      {
        method: "DELETE",
        path: "/api/v1/lpon/payment/admin/cleanup",
        params: [],
      },
      // (3) source/doc 양쪽 존재 + paramCount 차이 → DIVERGENCE
      //     source=charge POST 1 param vs doc=charge POST 2 params
      //     (이미 (1)에서 doc charge=1 param이지만 추가 시도)
      {
        method: "POST",
        path: "/api/v1/lpon/withdrawal/initiate",
        params: [
          { name: "body", type: "WithdrawalRequest", required: true },
          { name: "extraField", type: "String", required: false },
        ],
      },
    ],
  };
}

// ─── 실행 ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  let outPath = "";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--out") outPath = args[++i] ?? "";
  }

  const pocReportPath = "/tmp/sprint-258-poc-tree-sitter.json";
  const pocReport = JSON.parse(readFileSync(pocReportPath, "utf8")) as PoCReport;

  const source = buildSourceFromPoC(pocReport);
  const doc = buildMockDoc();
  const report = reconcile(source, doc);

  console.log("=== reconcile sanity check ===");
  console.log(`  Source endpoints: ${source.stats.endpointCount} (controllers=${source.stats.controllerCount})`);
  console.log(`  Doc endpoints: ${doc.endpoints.length}`);
  console.log("");
  console.log("  Markers:");
  console.log(`    SOURCE_MISSING: ${report.summary.sourceMissing}`);
  console.log(`    DOC_ONLY:       ${report.summary.docOnly}`);
  console.log(`    DIVERGENCE:     ${report.summary.divergences}`);
  console.log(`    TOTAL:          ${report.summary.total}`);
  console.log("");

  // 결과 검증
  const passed = report.summary.total >= 1; // ≥1 marker
  console.log(`  Sanity check: ${passed ? "PASS ✅" : "FAIL ❌"} (≥1 marker required)`);

  // 상세 markers
  console.log("");
  console.log("  Marker details (first 10):");
  for (const r of report.results.slice(0, 10)) {
    console.log(`    [${r.marker}] ${r.subject} ${r.divergenceReason ? `— ${r.divergenceReason}` : ""}`);
  }

  const output = {
    timestamp: new Date().toISOString(),
    source: {
      controllerCount: source.stats.controllerCount,
      endpointCount: source.stats.endpointCount,
    },
    doc: {
      endpointCount: doc.endpoints.length,
    },
    report,
    sanity: {
      passed,
      criterion: "total_markers >= 1",
    },
  };

  if (outPath) {
    writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
    console.log(`\n[sanity] Report written: ${outPath}`);
  }

  process.exit(passed ? 0 : 1);
}

main();
