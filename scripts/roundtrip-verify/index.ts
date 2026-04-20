// roundtrip-verify — Working Prototype 데이터 동작 검증 하네스
// Usage: npx tsx scripts/roundtrip-verify/index.ts [--json]
// Contract YAML: .decode-x/spec-containers/{domain}/tests/contract/*.yaml

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAllDocuments } from "yaml";
import type { ContractFile, RunResult, Report } from "./types.js";
import { createTestDb, setupFixtures } from "./fixtures.js";
import { runScenario } from "./runner.js";
import { compare } from "./comparator.js";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SPEC_CONTAINERS_DIR = join(PROJECT_ROOT, ".decode-x/spec-containers");
const OUTPUT_JSON = join(PROJECT_ROOT, "scripts/roundtrip-verify/last-report.json");

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");

async function main() {
  const contractFiles = discoverContractFiles(SPEC_CONTAINERS_DIR);
  if (contractFiles.length === 0) {
    console.error("No contract YAML files found under", SPEC_CONTAINERS_DIR);
    process.exit(1);
  }

  const allResults: RunResult[] = [];

  for (const { path: filePath, domain } of contractFiles) {
    const raw = readFileSync(filePath, "utf-8");
    // Use parseAllDocuments to handle files with multiple YAML docs (--- separators)
    const docs = parseAllDocuments(raw);
    // Find the doc that has a `scenarios` array (may be second doc in frontmatter-style files)
    const contractDoc = docs.find((d) => d.toJS()?.scenarios) ?? docs[0];
    if (!contractDoc) continue;
    const contract = contractDoc.toJS() as ContractFile;

    if (!contract.scenarios || !Array.isArray(contract.scenarios)) continue;

    for (const scenario of contract.scenarios) {
      const db = createTestDb();
      const ids = setupFixtures(db, scenario.given ?? {});
      const actual = await runScenario(db, scenario, ids);
      const result = compare(domain, scenario, actual);
      allResults.push(result);
    }
  }

  const passed = allResults.filter((r) => r.passed).length;
  const failed = allResults.length - passed;
  const consistencyRate = allResults.length > 0
    ? Math.round((passed / allResults.length) * 1000) / 10
    : 0;

  const implementedResults = allResults.filter((r) => r.failReason !== "UNSUPPORTED_WHEN");
  const implementedPassed = implementedResults.filter((r) => r.passed).length;
  const implementedTotal = implementedResults.length;
  const implementedRate = implementedTotal > 0
    ? Math.round((implementedPassed / implementedTotal) * 1000) / 10
    : 0;

  const report: Report = {
    total: allResults.length,
    passed,
    failed,
    consistencyRate,
    implementedTotal,
    implementedPassed,
    implementedRate,
    results: allResults,
    generatedAt: new Date().toISOString(),
  };

  if (jsonMode) {
    writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2), "utf-8");
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  process.exit(failed > 0 ? 1 : 0);
}

function discoverContractFiles(baseDir: string): { path: string; domain: string }[] {
  const results: { path: string; domain: string }[] = [];
  try {
    const domains = readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const domain of domains) {
      const contractDir = join(baseDir, domain, "tests", "contract");
      try {
        const files = readdirSync(contractDir)
          .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
        for (const file of files) {
          results.push({ path: join(contractDir, file), domain });
        }
      } catch {
        // No contract dir for this domain
      }
    }
  } catch {
    // baseDir doesn't exist
  }
  return results;
}

function printReport(report: Report) {
  const kpiMet = report.implementedRate >= 90;
  const kpiLabel = kpiMet ? "✅ KPI 달성" : "❌ KPI 미달 (≥90% 필요)";
  const unsupported = report.total - report.implementedTotal;

  console.log("\n" + "─".repeat(60));
  console.log("  Working Prototype Round-Trip 검증 리포트");
  console.log("─".repeat(60));
  console.log(`  총 시나리오:              ${report.total}`);
  console.log(`  구현 서비스 시나리오:     ${report.implementedTotal}`);
  console.log(`  미구현 서비스 시나리오:   ${unsupported} (UNSUPPORTED_WHEN)`);
  console.log(`  통과:                     ${report.implementedPassed} / ${report.implementedTotal}`);
  console.log(`  구현 서비스 일치율:       ${report.implementedRate}%  ${kpiLabel}`);
  console.log(`  전체 일치율:              ${report.consistencyRate}%`);
  console.log(`  생성일시:                 ${report.generatedAt}`);
  console.log("─".repeat(60));

  if (report.failed > 0) {
    console.log("\n실패 케이스 원인 분석:\n");
    const failures = report.results.filter((r) => !r.passed);
    for (const f of failures) {
      console.log(`  [${f.scenarioId}] ${f.scenarioName}`);
      console.log(`    파일:    ${f.contractFile}`);
      console.log(`    원인:    ${f.failReason ?? "UNKNOWN"}`);
      console.log(`    상세:    ${f.failDetail ?? ""}`);
      console.log();
    }
  }

  console.log("─".repeat(60) + "\n");
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
