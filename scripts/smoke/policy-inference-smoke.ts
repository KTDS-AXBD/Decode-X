#!/usr/bin/env bun
/**
 * policy-inference-smoke.ts — F438 Sprint 271 (AIF-PLAN-069)
 *
 * F418 PolicyCandidateSchema `exception` 필드 정식 추가의
 * 신규 inference 효과를 통계적 유의성 있는 표본(n>=10)으로 정량 검증한다.
 *
 * 세션 265 Smoke n=1 정성 입증(5/8=62.5%)을 production scale로 확장한다.
 *
 * Usage:
 *   SVC_POLICY_URL=https://svc-policy.ktds-axbd.workers.dev \
 *   INTERNAL_API_SECRET=$(cat ~/.secrets/decode-x-internal) \
 *   bun run scripts/smoke/policy-inference-smoke.ts \
 *     --n 10 --org-prefix org-smoke-f438 --report reports/sprint-271-f418-smoke-n10.json
 *
 * Required env: SVC_POLICY_URL, INTERNAL_API_SECRET
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

interface FixtureFile {
  domain: string;
  label: string;
  description: string;
  chunks: string[];
}

interface PolicyResultRow {
  policy_id: string;
  organization_id: string;
  policy_code: string;
  title: string;
  exception: string | null;
}

interface InferRunResult {
  seq: number;
  fixture: string;
  organizationId: string;
  extractionId: string;
  candidatesReturned: number;
  storedPolicies: PolicyResultRow[];
  exceptionFilledMain: number;
  exceptionFilledTotal: number;
  exTypePolicyCount: number;
  durationMs: number;
  httpStatus: number;
  error: string | null;
}

interface SmokeReport {
  meta: {
    feature: string;
    plan: string;
    n: number;
    orgPrefix: string;
    svcPolicyUrl: string;
    startedAt: string;
    finishedAt: string;
    totalDurationSec: number;
  };
  fixtures: Array<{ domain: string; label: string; chunkCount: number }>;
  runs: InferRunResult[];
  stats: {
    successfulRuns: number;
    failedRuns: number;
    totalCandidates: number;
    overallExceptionFillRate: number;
    overallExceptionFillRateStdDev: number;
    mainPolicyExceptionFillRate: number;
    exTypePolicyRatio: number;
    perRunFillRates: number[];
  };
  cleanupSql: string;
  productionImpactCheck: {
    healthBeforeRun: { status: number; body: string };
    healthAfterRun: { status: number; body: string };
  };
}

// ── CLI args ──────────────────────────────────────────────────────────

function arg(name: string, def: string): string {
  const args = process.argv.slice(2);
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] !== undefined ? (args[i + 1] as string) : def;
}

function flag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

// ── Fixture loader ────────────────────────────────────────────────────

const FIXTURE_DIR = "scripts/smoke/fixtures/exception-chunks";

async function loadFixtures(): Promise<FixtureFile[]> {
  const files = (await readdir(FIXTURE_DIR)).filter((f) => f.endsWith(".json")).sort();
  const fixtures: FixtureFile[] = [];
  for (const f of files) {
    const raw = await readFile(join(FIXTURE_DIR, f), "utf-8");
    const json = JSON.parse(raw) as FixtureFile;
    fixtures.push(json);
  }
  return fixtures;
}

// ── HTTP helpers ──────────────────────────────────────────────────────

async function httpGet(url: string, headers: Record<string, string>): Promise<{ status: number; body: string; json?: unknown }> {
  try {
    const res = await fetch(url, { method: "GET", headers });
    const body = await res.text();
    let json: unknown = undefined;
    try {
      json = JSON.parse(body);
    } catch {
      // not JSON
    }
    return { status: res.status, body, json };
  } catch (e) {
    return { status: 0, body: String(e) };
  }
}

async function httpPost(url: string, headers: Record<string, string>, body: unknown): Promise<{ status: number; body: string; json?: unknown }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown = undefined;
    try {
      json = JSON.parse(text);
    } catch {
      // not JSON
    }
    return { status: res.status, body: text, json };
  } catch (e) {
    return { status: 0, body: String(e) };
  }
}

// ── Inference runner ──────────────────────────────────────────────────

async function runOneInference(opts: {
  base: string;
  secret: string;
  fixture: FixtureFile;
  seq: number;
  orgPrefix: string;
}): Promise<InferRunResult> {
  const { base, secret, fixture, seq, orgPrefix } = opts;
  const orgId = `${orgPrefix}-${String(seq).padStart(3, "0")}`;
  const extractionId = crypto.randomUUID();
  const documentId = crypto.randomUUID();
  const sourceDocumentId = crypto.randomUUID();

  const t0 = Date.now();
  const inferRes = await httpPost(
    `${base}/policies/infer`,
    { "X-Internal-Secret": secret },
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
    return {
      seq,
      fixture: fixture.domain,
      organizationId: orgId,
      extractionId,
      candidatesReturned: 0,
      storedPolicies: [],
      exceptionFilledMain: 0,
      exceptionFilledTotal: 0,
      exTypePolicyCount: 0,
      durationMs,
      httpStatus: inferRes.status,
      error: inferRes.body.slice(0, 200),
    };
  }

  const inferJson = inferRes.json as
    | {
        success?: boolean;
        data?: { policies?: Array<{ policyId?: string; policyCode?: string; title?: string }> };
      }
    | undefined;
  const candidatesReturned = inferJson?.data?.policies?.length ?? 0;

  // Fetch back stored policies to read exception field
  // GET /policies?extractionId=... with X-Organization-Id header
  const listRes = await httpGet(
    `${base}/policies?extractionId=${encodeURIComponent(extractionId)}&limit=100`,
    { "X-Internal-Secret": secret, "X-Organization-Id": orgId },
  );

  let storedPolicies: PolicyResultRow[] = [];
  if (listRes.status === 200 && listRes.json) {
    const listJson = listRes.json as {
      success?: boolean;
      data?: {
        policies?: Array<{
          policyId?: string;
          organizationId?: string;
          policyCode?: string;
          title?: string;
          exception?: string | null;
        }>;
      };
    };
    storedPolicies = (listJson.data?.policies ?? []).map((p) => ({
      policy_id: p.policyId ?? "",
      organization_id: p.organizationId ?? orgId,
      policy_code: p.policyCode ?? "",
      title: p.title ?? "",
      exception: p.exception ?? null,
    }));
  }

  // Classify policies: main vs EX-prefix
  const exTypePolicies = storedPolicies.filter((p) => /-EX-/i.test(p.policy_code));
  const mainPolicies = storedPolicies.filter((p) => !/-EX-/i.test(p.policy_code));

  const exceptionFilledMain = mainPolicies.filter((p) => p.exception !== null && p.exception.trim() !== "").length;
  const exceptionFilledTotal = storedPolicies.filter((p) => p.exception !== null && p.exception.trim() !== "").length;

  return {
    seq,
    fixture: fixture.domain,
    organizationId: orgId,
    extractionId,
    candidatesReturned,
    storedPolicies,
    exceptionFilledMain,
    exceptionFilledTotal,
    exTypePolicyCount: exTypePolicies.length,
    durationMs,
    httpStatus: inferRes.status,
    error: null,
  };
}

// ── Stats ─────────────────────────────────────────────────────────────

function computeStats(runs: InferRunResult[]): SmokeReport["stats"] {
  const ok = runs.filter((r) => r.error === null && r.storedPolicies.length > 0);
  const totalCandidates = ok.reduce((s, r) => s + r.storedPolicies.length, 0);
  const totalExceptionFilledTotal = ok.reduce((s, r) => s + r.exceptionFilledTotal, 0);
  const totalMainPolicies = ok.reduce((s, r) => s + (r.storedPolicies.length - r.exTypePolicyCount), 0);
  const totalExceptionFilledMain = ok.reduce((s, r) => s + r.exceptionFilledMain, 0);
  const totalExTypePolicies = ok.reduce((s, r) => s + r.exTypePolicyCount, 0);

  const perRunFillRates = ok.map((r) =>
    r.storedPolicies.length > 0 ? r.exceptionFilledTotal / r.storedPolicies.length : 0,
  );
  const overallExceptionFillRate = totalCandidates > 0 ? totalExceptionFilledTotal / totalCandidates : 0;
  const meanFill =
    perRunFillRates.length > 0 ? perRunFillRates.reduce((s, x) => s + x, 0) / perRunFillRates.length : 0;
  const variance =
    perRunFillRates.length > 0
      ? perRunFillRates.reduce((s, x) => s + (x - meanFill) ** 2, 0) / perRunFillRates.length
      : 0;
  const stdDev = Math.sqrt(variance);

  return {
    successfulRuns: ok.length,
    failedRuns: runs.length - ok.length,
    totalCandidates,
    overallExceptionFillRate,
    overallExceptionFillRateStdDev: stdDev,
    mainPolicyExceptionFillRate: totalMainPolicies > 0 ? totalExceptionFilledMain / totalMainPolicies : 0,
    exTypePolicyRatio: totalCandidates > 0 ? totalExTypePolicies / totalCandidates : 0,
    perRunFillRates,
  };
}

// ── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const n = parseInt(arg("--n", "10"), 10);
  const orgPrefix = arg("--org-prefix", "org-smoke-f438");
  const singleDomain = arg("--single-domain", "");
  const reportPath = arg("--report", `reports/sprint-271-f418-smoke-n${String(n)}.json`);
  const dryRun = flag("--dry-run");

  const base = process.env["SVC_POLICY_URL"] ?? "https://svc-policy.ktds-axbd.workers.dev";
  const secret = process.env["INTERNAL_API_SECRET"];
  if (!secret) throw new Error("INTERNAL_API_SECRET required");

  const allFixtures = await loadFixtures();
  if (allFixtures.length === 0) throw new Error(`No fixtures found in ${FIXTURE_DIR}`);

  const fixtures = singleDomain
    ? allFixtures.filter((f) => f.domain === singleDomain)
    : allFixtures;
  if (fixtures.length === 0) {
    throw new Error(
      `--single-domain="${singleDomain}" 매칭 fixture 없음. 사용 가능: ${allFixtures.map((f) => f.domain).join(", ")}`,
    );
  }

  const modeLabel = singleDomain ? `single-domain=${singleDomain} × N=${String(n)}` : `multi-domain rotate, N=${String(n)}`;
  console.log("=== F438 Smoke — F418 신규 inference exception 자연 채움 검증 ===\n");
  console.log(`  mode=${modeLabel}  orgPrefix=${orgPrefix}  base=${base}`);
  console.log(`  fixtures: ${fixtures.map((f) => f.domain).join(", ")}\n`);

  if (dryRun) {
    console.log("[--dry-run] 실행 안 함. 계획만 출력:");
    for (let i = 0; i < n; i++) {
      const fixture = fixtures[i % fixtures.length];
      if (!fixture) continue;
      console.log(`  run #${String(i + 1).padStart(3, "0")} → fixture=${fixture.domain}, orgId=${orgPrefix}-${String(i + 1).padStart(3, "0")}`);
    }
    return;
  }

  // Health before
  const healthBefore = await httpGet(`${base}/health`, {});
  console.log(`[health.before] HTTP ${String(healthBefore.status)} body=${healthBefore.body.slice(0, 100)}`);
  if (healthBefore.status !== 200) {
    console.error("❌ svc-policy /health not 200 — abort");
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const runs: InferRunResult[] = [];

  // Sequential execution to avoid rate limit / Opus burst risk
  for (let i = 0; i < n; i++) {
    const fixture = fixtures[i % fixtures.length];
    if (!fixture) throw new Error("fixture undefined");
    const seq = i + 1;
    process.stdout.write(`[${String(seq).padStart(2, "0")}/${String(n)}] fixture=${fixture.domain.padEnd(20, " ")} ... `);
    const r = await runOneInference({ base, secret, fixture, seq, orgPrefix });
    runs.push(r);
    if (r.error) {
      console.log(`❌ HTTP=${String(r.httpStatus)} err=${r.error?.slice(0, 80) ?? "n/a"} ${(r.durationMs / 1000).toFixed(1)}s`);
    } else {
      const fillPct = r.storedPolicies.length > 0 ? ((r.exceptionFilledTotal / r.storedPolicies.length) * 100).toFixed(1) : "0.0";
      console.log(
        `✅ candidates=${String(r.candidatesReturned)} stored=${String(r.storedPolicies.length)} fill=${String(r.exceptionFilledTotal)}/${String(r.storedPolicies.length)} (${fillPct}%) exType=${String(r.exTypePolicyCount)} ${(r.durationMs / 1000).toFixed(1)}s`,
      );
    }
  }

  const finishedAt = new Date().toISOString();
  const totalDurationSec = (Date.now() - startMs) / 1000;

  // Health after
  const healthAfter = await httpGet(`${base}/health`, {});
  console.log(`\n[health.after] HTTP ${String(healthAfter.status)} body=${healthAfter.body.slice(0, 100)}`);

  const stats = computeStats(runs);

  console.log("\n=== Stats ===");
  console.log(`  successfulRuns        = ${String(stats.successfulRuns)}/${String(runs.length)}`);
  console.log(`  totalCandidates       = ${String(stats.totalCandidates)}`);
  console.log(`  overall fill rate     = ${(stats.overallExceptionFillRate * 100).toFixed(1)}% (n=${String(stats.totalCandidates)} candidates)`);
  console.log(`  fill rate std dev     = ${(stats.overallExceptionFillRateStdDev * 100).toFixed(1)}%pp (per-run, n=${String(stats.successfulRuns)})`);
  console.log(`  main policy fill rate = ${(stats.mainPolicyExceptionFillRate * 100).toFixed(1)}%`);
  console.log(`  EX-type policy ratio  = ${(stats.exTypePolicyRatio * 100).toFixed(1)}%`);

  // DoD #5 check
  const dodPass = stats.overallExceptionFillRate >= 0.5 && stats.overallExceptionFillRateStdDev <= 0.15;
  console.log(`\n  DoD #5 (avg>=50%, stdDev<=15%pp): ${dodPass ? "✅ PASS" : "❌ FAIL"}`);

  // Cleanup SQL emit (DELETE 엔드포인트 없음 — wrangler 권한 가진 환경에서 별도 실행)
  const orgIds = runs.map((r) => `'${r.organizationId}'`).join(", ");
  const cleanupSql = `-- F438 Smoke cleanup (run from a CF API token환경 with wrangler):
-- cd services/svc-policy && npx wrangler d1 execute db-policy --remote --command "<SQL below>"
DELETE FROM hitl_sessions WHERE policy_id IN (SELECT policy_id FROM policies WHERE organization_id IN (${orgIds}));
DELETE FROM policies WHERE organization_id IN (${orgIds});
-- Verify:
SELECT COUNT(*) FROM policies WHERE organization_id IN (${orgIds});  -- expect 0
`;

  // Write report
  const report: SmokeReport = {
    meta: {
      feature: "F438",
      plan: "AIF-PLAN-069",
      n,
      orgPrefix,
      svcPolicyUrl: base,
      startedAt,
      finishedAt,
      totalDurationSec,
    },
    fixtures: fixtures.map((f) => ({ domain: f.domain, label: f.label, chunkCount: f.chunks.length })),
    runs,
    stats,
    cleanupSql,
    productionImpactCheck: {
      healthBeforeRun: { status: healthBefore.status, body: healthBefore.body.slice(0, 200) },
      healthAfterRun: { status: healthAfter.status, body: healthAfter.body.slice(0, 200) },
    },
  };

  const reportDir = dirname(reportPath);
  if (!existsSync(reportDir)) await mkdir(reportDir, { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n[report] wrote ${reportPath}`);

  const cleanupPath = `${reportPath.replace(/\.json$/, "")}-cleanup.sql`;
  await writeFile(cleanupPath, cleanupSql);
  console.log(`[cleanup-sql] wrote ${cleanupPath}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
