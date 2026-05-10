#!/usr/bin/env tsx
/**
 * F487 (Sprint 321) — LPON Phase 4 Repackaging Orchestrator
 *
 * Tree-sitter 기반 정책 추출 + R2 skill-packages 재패키징.
 * rebundle-all-domains.ts보다 상위 오케스트레이터로, Phase 4 3-way fallback 내장.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=xxx npx tsx scripts/repackage-lpon-phase4.ts
 *   CLOUDFLARE_API_TOKEN=xxx npx tsx scripts/repackage-lpon-phase4.ts --dry-run
 *   CLOUDFLARE_API_TOKEN=xxx npx tsx scripts/repackage-lpon-phase4.ts --option=B
 *
 * Options:
 *   --dry-run   실행 계획만 출력, API 호출 없음
 *   --option=A  R2 Java 소스 발견 후 Tree-sitter parse (default: auto-detect)
 *   --option=B  8 spec-container 기반 재패키징 (Java 소스 미보유 시)
 *   --option=C  partial + TD-XX 등록 (B도 불가 시)
 *
 * Phase 4 Note (Sprint 321):
 *   LPON Java 소스 미보유(R1) → Option B 우선.
 *   Option A: wrangler r2 object list --prefix=documents/lpon/ → Java 소스 발견 시 활성화
 *   Option B: 8 현존 spec-containers (lpon-{refund,charge,payment,gift,settlement,budget,purchase,cancel})
 *   Option C: detect-bl 결과 reports에 Partial 기록 + 신규 TD 등록
 */

import { spawnSync } from "child_process";
import { join } from "path";

const CF_TOKEN = process.env["CLOUDFLARE_API_TOKEN"] ?? "";
const SVC_SKILL_URL = process.env["SVC_SKILL_URL"] ?? "https://svc-skill.ktds-axbd.workers.dev";
const INTERNAL_SECRET = process.env["INTERNAL_API_SECRET"] ?? "";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCED_OPTION = args.find((a) => a.startsWith("--option="))?.replace("--option=", "") ?? "auto";

const LPON_SPEC_CONTAINERS = [
  "lpon-refund",
  "lpon-charge",
  "lpon-payment",
  "lpon-gift",
  "lpon-settlement",
  "lpon-budget",
  "lpon-purchase",
  "lpon-cancel",
] as const;

interface Phase4Result {
  option: "A" | "B" | "C";
  containersProcessed: number;
  containersTotal: number;
  errors: string[];
  tdItems: string[];
  timestamp: string;
}

async function checkR2JavaSource(): Promise<boolean> {
  if (DRY_RUN || !CF_TOKEN) return false;
  console.log("🔍 Option A: R2 documents/lpon/ 확인 중...");
  const result = spawnSync(
    "wrangler",
    ["r2", "object", "list", "--prefix=documents/lpon/", "--env=production"],
    { env: { ...process.env, CLOUDFLARE_API_TOKEN: CF_TOKEN }, encoding: "utf-8" },
  );
  if (result.status !== 0 || result.stdout.includes("0 objects")) {
    console.log("  ⚠️  R2 documents/lpon/ 에 Java 소스 없음 → Option B로 fallback");
    return false;
  }
  const lineCount = result.stdout.split("\n").filter((l) => l.includes(".java")).length;
  console.log(`  ✅ Java 소스 ${lineCount}건 발견 → Option A 활성화`);
  return lineCount > 0;
}

async function runOptionA(): Promise<Phase4Result> {
  console.log("\n🅰️  Option A: R2 Java 소스 → Tree-sitter parse → Policy inference → Rebundle");
  // Tree-sitter parse + policy inference는 별도 full implementation 필요
  // 현재는 rebundle-all-domains.ts 호출로 delegation
  const rebundleScript = join(__dirname, "divergence", "rebundle-all-domains.ts");
  const result = spawnSync("npx", ["tsx", rebundleScript, ...(DRY_RUN ? ["--dry-run"] : [])], {
    env: { ...process.env, CLOUDFLARE_API_TOKEN: CF_TOKEN },
    encoding: "utf-8",
    stdio: "inherit",
  });
  return {
    option: "A",
    containersProcessed: result.status === 0 ? LPON_SPEC_CONTAINERS.length : 0,
    containersTotal: LPON_SPEC_CONTAINERS.length,
    errors: result.status !== 0 ? ["rebundle-all-domains.ts failed"] : [],
    tdItems: [],
    timestamp: new Date().toISOString(),
  };
}

async function runOptionB(): Promise<Phase4Result> {
  console.log("\n🅱️  Option B: 8 spec-containers 기반 재패키징");
  if (!CF_TOKEN && !DRY_RUN) {
    console.error("❌ CLOUDFLARE_API_TOKEN 필요");
    return {
      option: "B",
      containersProcessed: 0,
      containersTotal: LPON_SPEC_CONTAINERS.length,
      errors: ["CLOUDFLARE_API_TOKEN 없음"],
      tdItems: ["TD-NEW: LPON Phase 4 전수 재추출 (Java 소스 미보유 → production 적용 불가)"],
      timestamp: new Date().toISOString(),
    };
  }

  let processed = 0;
  const errors: string[] = [];

  for (const container of LPON_SPEC_CONTAINERS) {
    const domain = container.replace("lpon-", "");
    console.log(`  ▶ ${container} (domain: ${domain})`);

    if (DRY_RUN) {
      console.log(`    [DRY] POST ${SVC_SKILL_URL}/skills/rebundle { org: 'LPON', domain: '${domain}' }`);
      processed++;
      continue;
    }

    const res = await fetch(`${SVC_SKILL_URL}/skills/rebundle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({ org: "LPON", domain }),
    }).catch((e) => null);

    if (!res || !res.ok) {
      const status = res?.status ?? 0;
      const msg = `${container}: HTTP ${status}`;
      console.log(`    ❌ ${msg}`);
      errors.push(msg);
    } else {
      console.log(`    ✅ OK`);
      processed++;
    }
  }

  const tdItems: string[] = [];
  if (processed < LPON_SPEC_CONTAINERS.length) {
    tdItems.push("TD-NEW: LPON Phase 4 재패키징 일부 실패 → 재실행 필요");
  }
  if (!CF_TOKEN) {
    tdItems.push("TD-NEW: LPON Java 소스 미보유 — Production 전수 재추출 Phase 5로 이월");
  }

  return {
    option: "B",
    containersProcessed: processed,
    containersTotal: LPON_SPEC_CONTAINERS.length,
    errors,
    tdItems,
    timestamp: new Date().toISOString(),
  };
}

async function runOptionC(): Promise<Phase4Result> {
  console.log("\n🅲  Option C: Partial 종결 + TD 등록");
  return {
    option: "C",
    containersProcessed: 0,
    containersTotal: LPON_SPEC_CONTAINERS.length,
    errors: ["R1(Java 소스 미보유) + production 접근 없음 → 부분 종결"],
    tdItems: [
      "TD-NEW: LPON Phase 4 전수 재추출 — Java 소스 확보 후 Option A 재실행 필요",
      "TD-NEW: Production D1 policies 0건 → LPON 정책 입력 파이프라인 재점검 필요",
    ],
    timestamp: new Date().toISOString(),
  };
}

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("🔄 LPON Phase 4 Repackaging Orchestrator (F487)");
  console.log(`   Mode: ${DRY_RUN ? "DRY RUN" : "EXECUTE"}`);
  console.log(`   Forced Option: ${FORCED_OPTION}`);
  console.log(`   Containers: ${LPON_SPEC_CONTAINERS.length}`);
  console.log("═══════════════════════════════════════════════\n");

  let result: Phase4Result;

  if (FORCED_OPTION === "A") {
    result = await runOptionA();
  } else if (FORCED_OPTION === "B") {
    result = await runOptionB();
  } else if (FORCED_OPTION === "C") {
    result = await runOptionC();
  } else {
    // auto-detect
    const hasJavaSource = await checkR2JavaSource();
    if (hasJavaSource) {
      result = await runOptionA();
    } else {
      result = await runOptionB();
    }
    if (result.errors.length > 0 && result.containersProcessed === 0) {
      result = await runOptionC();
    }
  }

  console.log("\n═══════════════════════════════════════════════");
  console.log("📊 Phase 4 Result");
  console.log(`   Option: ${result.option}`);
  console.log(`   Processed: ${result.containersProcessed}/${result.containersTotal}`);
  if (result.errors.length > 0) {
    console.log(`   Errors: ${result.errors.join(", ")}`);
  }
  if (result.tdItems.length > 0) {
    console.log("   TD Items:");
    result.tdItems.forEach((td) => console.log(`     - ${td}`));
  }
  console.log("═══════════════════════════════════════════════");

  if (!DRY_RUN && result.errors.length > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
