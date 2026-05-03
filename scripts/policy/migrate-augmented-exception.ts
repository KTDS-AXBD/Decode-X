#!/usr/bin/env bun
/**
 * migrate-augmented-exception.ts — F418 Sprint 249 / TD-58
 *
 * F417 (Sprint 248) augment-skill-data.ts가 LLM Haiku로 추론한 exception clause를
 * `policies[].source.excerpt` 필드에 잘못 넣었음. F418 fix로 spec-content-adapter는
 * `p.exception` 필드만 보므로 기존 augmented bundle은 효과 미발현.
 *
 * 본 스크립트는 R2 `skill-packages/augmented/{id}.skill.json` 43건을 순회하며
 * `policy.source.excerpt` (F417 augmented exception clause)를 → `policy.exception` 필드로
 * 복사한다. source.excerpt도 그대로 유지(원본 보존 차원).
 *
 * 0 LLM 비용, ~5min 실행.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=xxx \
 *     bun run scripts/policy/migrate-augmented-exception.ts \
 *     --org LPON --ids-file /tmp/lpon-35-ids.txt
 *
 *   OR --org lpon --ids-file /tmp/lpon-8-ids.txt
 *
 * Required env:
 *   CLOUDFLARE_API_TOKEN — CF API token (R2 read/write)
 *
 * CF Account ID + R2 bucket are hardcoded (Decode-X production).
 */

import { readFile } from "fs/promises";

// ── CLI args ──────────────────────────────────────────────────────────

function arg(flag: string, def: string): string {
  const args = process.argv.slice(2);
  const i = args.indexOf(flag);
  return i !== -1 && (args[i + 1] ?? "") !== "" ? (args[i + 1] as string) : def;
}

const ORG = arg("--org", "LPON");
const IDS_FILE = arg("--ids-file", "/tmp/lpon-35-ids.txt");
const DRY_RUN = process.argv.includes("--dry-run");
const BUCKET = "ai-foundry-skill-packages";
const CF_ACCOUNT_ID = "b6c06059b413892a92f150e5ca496236";
const CF_TOKEN = process.env["CLOUDFLARE_API_TOKEN"] ?? "";

if (!CF_TOKEN) {
  console.error("❌ CLOUDFLARE_API_TOKEN required");
  process.exit(1);
}

// ── Types ─────────────────────────────────────────────────────────────

interface PolicySource {
  documentId: string;
  pageRef?: string;
  excerpt?: string;
}

interface Policy {
  code: string;
  title: string;
  description?: string;
  condition: string;
  criteria: string;
  outcome: string;
  exception?: string; // TD-58 / F418
  source: PolicySource;
  trust: { level: string; score: number };
  tags: string[];
}

interface SkillPackage {
  $schema?: string;
  skillId: string;
  metadata: { domain: string; subdomain?: string; [k: string]: unknown };
  policies: Policy[];
  [k: string]: unknown;
}

// ── R2 helpers (CF REST API) ──────────────────────────────────────────

const R2_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${BUCKET}`;

async function r2Get(key: string): Promise<SkillPackage | null> {
  // Use S3-compatible endpoint via CF API token (use direct R2 binding via worker is alt)
  // Falling back to wrangler r2 object get since CF REST for R2 requires S3 sign
  const { spawnSync } = await import("child_process");
  const tmpFile = `/tmp/r2-${key.replace(/[^a-z0-9]/gi, "_")}.json`;
  const res = spawnSync(
    "npx",
    [
      "-y",
      "wrangler",
      "r2",
      "object",
      "get",
      `${BUCKET}/${key}`,
      "--file",
      tmpFile,
      "--remote",
    ],
    { stdio: "pipe", env: { ...process.env, CLOUDFLARE_API_TOKEN: CF_TOKEN }, cwd: "services/svc-skill" },
  );
  if (res.status !== 0) {
    console.warn(`  R2 GET fail: ${key} — ${res.stderr.toString().slice(0, 120)}`);
    return null;
  }
  try {
    const text = await readFile(tmpFile, "utf-8");
    return JSON.parse(text) as SkillPackage;
  } catch (e) {
    console.warn(`  parse fail: ${key} — ${String(e).slice(0, 120)}`);
    return null;
  }
}

async function r2Put(key: string, pkg: SkillPackage): Promise<boolean> {
  const { spawnSync } = await import("child_process");
  const { writeFile } = await import("fs/promises");
  const tmpFile = `/tmp/r2-put-${key.replace(/[^a-z0-9]/gi, "_")}.json`;
  await writeFile(tmpFile, JSON.stringify(pkg, null, 2));
  const res = spawnSync(
    "npx",
    [
      "-y",
      "wrangler",
      "r2",
      "object",
      "put",
      `${BUCKET}/${key}`,
      "--file",
      tmpFile,
      "--remote",
    ],
    { stdio: "pipe", env: { ...process.env, CLOUDFLARE_API_TOKEN: CF_TOKEN }, cwd: "services/svc-skill" },
  );
  if (res.status !== 0) {
    console.warn(`  R2 PUT fail: ${key} — ${res.stderr.toString().slice(0, 120)}`);
    return false;
  }
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`🔧 F418 / TD-58 — F417 augmented bundle exception 필드 이전`);
  console.log(`   Org: ${ORG} | IDs file: ${IDS_FILE} | DRY_RUN: ${DRY_RUN}`);

  const idsRaw = await readFile(IDS_FILE, "utf-8");
  const ids = idsRaw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  console.log(`   ${ids.length} skills 대상`);

  const stats = {
    total: ids.length,
    bundleHit: 0,
    bundleMiss: 0,
    policiesTotal: 0,
    exceptionsMigrated: 0,
    alreadyMigrated: 0,
    putSuccess: 0,
    putFail: 0,
  };

  for (const id of ids) {
    const key = `skill-packages/augmented/${id}.skill.json`;
    const pkg = await r2Get(key);
    if (!pkg) {
      stats.bundleMiss++;
      continue;
    }
    stats.bundleHit++;

    let modifiedPolicies = 0;
    for (const p of pkg.policies) {
      stats.policiesTotal++;
      // Skip if already migrated (has exception)
      if (p.exception != null && p.exception !== "") {
        stats.alreadyMigrated++;
        continue;
      }
      const excerpt = p.source?.excerpt ?? "";
      // F417 augmented bundle: source.excerpt에 exception clause가 LLM 추론 결과로 들어감
      // (원본 R2 bundle의 source.excerpt는 발췌문이지만, F417이 이를 덮어씀)
      // 따라서 augmented bundle의 source.excerpt = exception clause로 간주
      if (excerpt.length > 0) {
        p.exception = excerpt;
        modifiedPolicies++;
        stats.exceptionsMigrated++;
      }
    }

    console.log(
      `  [${id.slice(0, 8)}] policies=${pkg.policies.length} migrated=${modifiedPolicies}`,
    );

    if (!DRY_RUN && modifiedPolicies > 0) {
      const ok = await r2Put(key, pkg);
      if (ok) {
        stats.putSuccess++;
      } else {
        stats.putFail++;
      }
    }
  }

  console.log("\n═══ 결과 ═══");
  console.log(JSON.stringify(stats, null, 2));
  if (stats.putFail > 0) {
    console.error(`❌ ${stats.putFail} R2 PUT 실패`);
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  console.error("❌ Fatal:", e);
  process.exit(1);
});
