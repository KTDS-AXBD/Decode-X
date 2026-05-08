#!/usr/bin/env bun
/**
 * force-approve-policies.ts — F442 Sprint 276 (AIF-PLAN-074)
 *
 * CF REST API를 사용해 D1 db-policy에서 특정 org의 candidate 정책을
 * approved 상태로 직접 UPDATE한다.
 *
 * /admin/force-approve endpoint 미존재 → CF REST API direct D1 query 사용.
 * FK 제약 없음 — status 필드 단순 UPDATE.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ACCOUNT_ID=xxx \
 *     bun run scripts/poc/force-approve-policies.ts --org LPON-poc-1234567890
 *
 * 참고: CLOUDFLARE_API_TOKEN은 CF OAuth token (wrangler config) 또는 API token 모두 가능.
 * CLOUDFLARE_ACCOUNT_ID: b6c06059b413892a92f150e5ca496236 (AX컨설팅팀)
 */

const CF_TOKEN = process.env["CLOUDFLARE_API_TOKEN"] ?? "";
const ACCOUNT_ID = process.env["CLOUDFLARE_ACCOUNT_ID"] ?? "b6c06059b413892a92f150e5ca496236";
const DB_ID = "48c22ca4-a7f8-4f3d-ae1b-e5dee4e8712a"; // db-policy production

if (!CF_TOKEN) {
  console.error("❌ CLOUDFLARE_API_TOKEN 환경변수 필요");
  process.exit(1);
}

function arg(flag: string, def: string): string {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? (process.argv[idx + 1] ?? def) : def;
}

interface D1QueryResponse {
  result?: Array<{
    results?: Array<Record<string, unknown>>;
    meta?: { changes?: number; rows_read?: number; rows_written?: number };
    success?: boolean;
  }>;
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
}

async function runD1Query(sql: string, params: unknown[] = []): Promise<D1QueryResponse> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${CF_TOKEN}`,
    },
    body: JSON.stringify({ sql, params }),
  });
  if (!res.ok) {
    throw new Error(`CF REST API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<D1QueryResponse>;
}

async function main(): Promise<void> {
  const orgId = arg("--org", "");

  if (!orgId) {
    console.error("❌ --org 인수 필요 (예: --org LPON-poc-1234567890)");
    process.exit(1);
  }

  console.log(`🔧 force-approve — org: ${orgId}`);
  console.log(`   account: ${ACCOUNT_ID}`);
  console.log(`   db-policy: ${DB_ID}`);

  // 1. Count current candidates
  const countRes = await runD1Query(
    "SELECT COUNT(*) as cnt FROM policies WHERE organization_id = ? AND status = 'candidate'",
    [orgId],
  );

  if (countRes.errors?.length) {
    throw new Error(`D1 error: ${JSON.stringify(countRes.errors)}`);
  }

  const candidateCount = (countRes.result?.[0]?.results?.[0] as { cnt?: number } | undefined)?.cnt ?? 0;
  console.log(`📊 Current candidates: ${candidateCount}`);

  if (candidateCount === 0) {
    console.error(`❌ No candidates found for org=${orgId}`);
    process.exit(1);
  }

  // 2. UPDATE to approved
  const updateRes = await runD1Query(
    "UPDATE policies SET status = 'approved' WHERE organization_id = ? AND status = 'candidate'",
    [orgId],
  );

  if (updateRes.errors?.length) {
    throw new Error(`D1 update error: ${JSON.stringify(updateRes.errors)}`);
  }

  const changes = updateRes.result?.[0]?.meta?.changes ?? 0;
  console.log(`✅ Updated ${changes} rows → status='approved'`);

  if (changes < 5) {
    console.error(`❌ DoD #5 FAIL: approved ${changes} < 5`);
    process.exit(1);
  }
  console.log(`✅ DoD #5 PASS: approved ≥ 5 (changes=${changes})`);

  // 3. Verify approved count
  const verifyRes = await runD1Query(
    "SELECT policy_id, policy_code, title, status FROM policies WHERE organization_id = ? AND status = 'approved'",
    [orgId],
  );
  const approved = verifyRes.result?.[0]?.results ?? [];
  console.log(`\n📋 Approved policies (${approved.length}):`);
  for (const p of approved) {
    const row = p as { policy_code?: string; title?: string };
    console.log(`   • ${row.policy_code ?? "?"} — ${(row.title ?? "").slice(0, 60)}`);
  }

  const result = { orgId, candidateCount, approvedCount: changes, verifiedApproved: approved.length };
  console.log("\n📋 Result JSON:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e: unknown) => {
  console.error("❌ Fatal:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
