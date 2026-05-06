#!/usr/bin/env tsx
/**
 * LPON 전체 도메인 rebundle wrapper
 *
 * scripts/rebundle-production.ts를 LPON_DOMAINS 순으로 순차 실행.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=xxx npx tsx scripts/divergence/rebundle-all-domains.ts
 *   CLOUDFLARE_API_TOKEN=xxx npx tsx scripts/divergence/rebundle-all-domains.ts --dry-run
 *
 * Prerequisites:
 *   - LPON approved policies must exist in production svc-policy D1 (db-policy)
 *   - svc-llm-router production endpoint must be reachable (decommissioned TD-44)
 *   - CLOUDFLARE_API_TOKEN must have R2 Write + D1 Write permissions
 *
 * Phase 4 Note:
 *   As of Sprint 267 (Phase 3b), LPON has 0 approved policies in production D1.
 *   Full LPON policy ingestion requires Java source re-parsing (Tree-sitter based),
 *   which is deferred to Phase 4 due to Java source unavailability.
 *   This script is ready but will produce 0 bundles until Phase 4 ingestion completes.
 */

import { spawnSync } from "child_process";
import { join } from "path";

const LPON_DOMAINS = ["giftvoucher"]; // LPON의 production 도메인
const ORG_ID = "LPON";
const DRY_RUN = process.argv.includes("--dry-run");
const REBUNDLE_SCRIPT = join(__dirname, "..", "rebundle-production.ts");

const CF_TOKEN = process.env["CLOUDFLARE_API_TOKEN"] ?? "";
if (!CF_TOKEN && !DRY_RUN) {
  console.error("❌ CLOUDFLARE_API_TOKEN 환경변수 필요");
  process.exit(1);
}

console.log("═══════════════════════════════════════════════");
console.log("🔄 LPON All-Domains Rebundle Wrapper");
console.log(`   Org: ${ORG_ID}`);
console.log(`   Domains: ${LPON_DOMAINS.join(", ")}`);
console.log(`   Mode: ${DRY_RUN ? "DRY RUN" : "EXECUTE"}`);
console.log("═══════════════════════════════════════════════\n");

if (DRY_RUN) {
  console.log("📋 [DRY RUN] 실행 예정 도메인:");
  for (const domain of LPON_DOMAINS) {
    console.log(`   CLOUDFLARE_API_TOKEN=*** ORG_ID=${ORG_ID} DOMAIN=${domain} bun run ${REBUNDLE_SCRIPT}`);
  }
  console.log("\n⚠️  Phase 4 Note: LPON 0 approved policies in production D1.");
  console.log("   Java source re-parsing required before rebundle is productive.");
  process.exit(0);
}

let successCount = 0;
let failCount = 0;

for (const domain of LPON_DOMAINS) {
  console.log(`\n▶ Domain: ${domain}`);
  const result = spawnSync("bun", ["run", REBUNDLE_SCRIPT], {
    env: {
      ...process.env,
      ORG_ID,
      DOMAIN: domain,
      CLOUDFLARE_API_TOKEN: CF_TOKEN,
      CLOUDFLARE_ACCOUNT_ID: "b6c06059b413892a92f150e5ca496236",
    },
    stdio: "inherit",
  });

  if (result.status === 0) {
    successCount++;
  } else {
    console.error(`   ❌ ${domain} rebundle 실패 (exit ${result.status ?? "unknown"})`);
    failCount++;
  }
}

console.log("\n═══════════════════════════════════════════════");
console.log("📊 All-Domains Rebundle 완료");
console.log(`   성공: ${successCount}/${LPON_DOMAINS.length} 도메인`);
console.log(`   실패: ${failCount}/${LPON_DOMAINS.length} 도메인`);
console.log("═══════════════════════════════════════════════");
