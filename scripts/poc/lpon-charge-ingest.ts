#!/usr/bin/env bun
/**
 * lpon-charge-ingest.ts — F442 Sprint 276 (AIF-PLAN-074)
 *
 * charging.ts 합성 source의 fixture chunks를 svc-policy /policies/infer에
 * 전송하여 D1 candidate 정책을 생성한다.
 * 기존 Sprint 271 F438 fixture (scripts/smoke/fixtures/exception-chunks/lpon-charge.json)를 재활용.
 *
 * Usage:
 *   bun run scripts/poc/lpon-charge-ingest.ts --org LPON-poc-1234567890
 *   bun run scripts/poc/lpon-charge-ingest.ts  # 자동 org ID 생성
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

const BASE = process.env["SVC_POLICY_URL"] ?? "https://svc-policy.ktds-axbd.workers.dev";
const SECRET = process.env["INTERNAL_API_SECRET"] ?? "";
if (!SECRET) {
  console.error("❌ INTERNAL_API_SECRET 환경변수 필요 (cat ~/.secrets/decode-x-internal)");
  process.exit(1);
}

function arg(flag: string, def: string): string {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? (process.argv[idx + 1] ?? def) : def;
}

interface FixtureFile {
  domain: string;
  label: string;
  description: string;
  chunks: string[];
}

async function httpPost(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<{ status: number; json: unknown; body: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, body: text, json };
  } catch (e) {
    return { status: 0, body: String(e), json: null };
  }
}

async function httpGet(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; json: unknown }> {
  try {
    const res = await fetch(url, { headers });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, json };
  } catch (e) {
    return { status: 0, json: null };
  }
}

async function main(): Promise<void> {
  const orgId = arg("--org", `LPON-poc-${Date.now()}`);
  console.log(`🚀 lpon-charge-ingest — org: ${orgId}`);

  // 1. Load fixture
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const fixtureDir = join(scriptDir, "../smoke/fixtures/exception-chunks");
  const fixturePath = join(fixtureDir, "lpon-charge.json");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf-8")) as FixtureFile;
  console.log(`📄 Fixture: ${fixture.domain} (${fixture.chunks.length} chunks) — ${fixture.label}`);

  const extractionId = randomUUID();
  const documentId = randomUUID();
  const sourceDocumentId = randomUUID();

  // 2. Call svc-policy /policies/infer
  console.log(`📡 POST ${BASE}/policies/infer ...`);
  const t0 = Date.now();
  const inferRes = await httpPost(
    `${BASE}/policies/infer`,
    { "X-Internal-Secret": SECRET },
    {
      extractionId,
      documentId,
      organizationId: orgId,
      chunks: fixture.chunks,
      sourceDocumentId,
    },
  );
  const durationMs = Date.now() - t0;

  if (inferRes.status >= 400 || inferRes.status === 0) {
    console.error(`❌ infer failed: HTTP ${inferRes.status}`);
    console.error(inferRes.body.slice(0, 500));
    process.exit(1);
  }

  const inferJson = inferRes.json as {
    success?: boolean;
    data?: { policies?: Array<{ policyId?: string; policyCode?: string; title?: string }> };
  } | null;

  const returned = inferJson?.data?.policies?.length ?? 0;
  console.log(`✅ infer OK — ${returned} candidates returned (${durationMs}ms)`);

  // 3. Verify D1 stored count
  const listRes = await httpGet(
    `${BASE}/policies?extractionId=${encodeURIComponent(extractionId)}&limit=100`,
    { "X-Internal-Secret": SECRET, "X-Organization-Id": orgId },
  );

  const listJson = listRes.json as {
    data?: { policies?: Array<{ policyId?: string; policyCode?: string; title?: string }> };
  } | null;
  const stored = listJson?.data?.policies ?? [];
  const storedCount = stored.length;

  console.log(`📊 D1 stored: ${storedCount} policies`);
  if (storedCount < 5) {
    console.error(`❌ DoD #4 FAIL: stored ${storedCount} < 5`);
    process.exit(1);
  }
  console.log(`✅ DoD #4 PASS: candidate ≥ 5 (stored=${storedCount})`);

  // Print stored policy codes
  for (const p of stored) {
    console.log(`   • ${p.policyCode ?? "?"} — ${(p.title ?? "").slice(0, 60)}`);
  }

  // Output result JSON to stdout for piping
  const result = {
    orgId,
    extractionId,
    documentId,
    sourceDocumentId,
    domain: fixture.domain,
    candidatesReturned: returned,
    storedCount,
    durationMs,
    policies: stored,
  };
  console.log("\n📋 Result JSON:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e: unknown) => {
  console.error("❌ Fatal:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
