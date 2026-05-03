#!/usr/bin/env bun
/**
 * augment-skill-data.ts — F417 Sprint 248
 *
 * LPON 42건 skill bundle을 R2에서 다운로드하여 LLM(Haiku)로 augment한다:
 *   1. exception clause 추론 → policies[].source.excerpt 교체
 *   2. 구체적 test scenarios 생성 → policies[].description 삽입
 * Augmented bundle을 R2 skill-packages/augmented/{id}.skill.json 경로에 저장한다.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=xxx INTERNAL_API_SECRET=xxx \
 *     bun run scripts/ai-ready/augment-skill-data.ts \
 *     --org LPON --ids-file /tmp/lpon-35-ids.txt
 *
 * Required env:
 *   CLOUDFLARE_API_TOKEN   — CF API token (r2 object 접근용)
 *   INTERNAL_API_SECRET    — svc-llm-router X-Internal-Secret 헤더
 *
 * Optional env:
 *   LLM_API                — LLM router URL (default: svc-llm-router-production)
 *   SVC_SKILL_DIR          — wrangler CWD (default: services/svc-skill)
 */

import { readFile, writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";

// ── CLI args ──────────────────────────────────────────────────────────

function arg(flag: string, def: string): string {
  const args = process.argv.slice(2);
  const i = args.indexOf(flag);
  return i !== -1 && (args[i + 1] ?? "") !== "" ? (args[i + 1] as string) : def;
}

const ORG = arg("--org", "LPON");
const IDS_FILE = arg("--ids-file", "/tmp/lpon-35-ids.txt");
const CONCURRENCY = parseInt(arg("--concurrency", "3"), 10);
const DRY_RUN = process.argv.includes("--dry-run");
const BUCKET = "ai-foundry-skill-packages";
const SVC_SKILL_DIR = process.env["SVC_SKILL_DIR"] ?? resolve(process.cwd(), "services/svc-skill");
const LLM_API = process.env["LLM_API"] ?? "https://svc-llm-router-production.ktds-axbd.workers.dev";
const CF_TOKEN = process.env["CLOUDFLARE_API_TOKEN"] ?? "";
const SECRET = process.env["INTERNAL_API_SECRET"] ?? "";

if (!CF_TOKEN) { console.error("❌ CLOUDFLARE_API_TOKEN required"); process.exit(1); }
if (!SECRET) { console.error("❌ INTERNAL_API_SECRET required"); process.exit(1); }

// ── Types ─────────────────────────────────────────────────────────────

interface PolicySource { excerpt?: string; documentId: string; pageRef?: string; }
interface Policy {
  code: string; title: string; description?: string;
  condition: string; criteria: string; outcome: string;
  source: PolicySource; trust: { level: string; score: number };
  tags: string[];
}
interface SkillPackage { skillId: string; policies: Policy[]; [k: string]: unknown; }

// ── R2 helpers (via wrangler CLI) ─────────────────────────────────────

function wrangler(args: string[]): { ok: boolean; out: string; err: string } {
  const result = spawnSync("npx", ["wrangler", ...args], {
    cwd: SVC_SKILL_DIR,
    env: { ...process.env, CLOUDFLARE_API_TOKEN: CF_TOKEN },
    encoding: "utf-8",
    timeout: 60000,
  });
  return {
    ok: result.status === 0,
    out: result.stdout ?? "",
    err: result.stderr ?? "",
  };
}

async function r2Get(key: string, outFile: string): Promise<boolean> {
  const result = wrangler(["r2", "object", "get", `${BUCKET}/${key}`, "--remote", "--file", outFile]);
  return result.ok;
}

async function r2Put(key: string, file: string): Promise<boolean> {
  const result = wrangler(["r2", "object", "put", `${BUCKET}/${key}`, "--remote", "--file", file, "--content-type", "application/json"]);
  return result.ok;
}

// ── D1 query helper ───────────────────────────────────────────────────

const DB_SKILL_ID = "96e6ac0c-eefa-45f5-9c07-4fd84a0f1df1";

interface D1Row { skill_id: string; r2_key: string; }

async function queryD1(sql: string): Promise<D1Row[]> {
  const cfAccountId = process.env["CLOUDFLARE_ACCOUNT_ID"] ?? "";
  if (!cfAccountId) {
    // Fallback: wrangler CLI
    const result = wrangler(["d1", "execute", "db-skill", "--remote", "--command", sql, "--json"]);
    if (!result.ok) throw new Error(`D1 query failed: ${result.err}`);
    const parsed = JSON.parse(result.out) as Array<{ results?: D1Row[] }>;
    return parsed[0]?.results ?? [];
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/d1/database/${DB_SKILL_ID}/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${CF_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql }),
    },
  );
  const json = await res.json() as { success: boolean; result?: Array<{ results?: D1Row[] }>; errors?: { message: string }[] };
  if (!json.success) throw new Error(`D1 REST failed: ${JSON.stringify(json.errors)}`);
  return json.result?.[0]?.results ?? [];
}

// ── LLM helpers ───────────────────────────────────────────────────────

async function callLlm(userContent: string, maxTokens = 512): Promise<string> {
  const resp = await fetch(`${LLM_API}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Secret": SECRET },
    body: JSON.stringify({
      tier: "haiku",
      messages: [{ role: "user", content: userContent }],
      callerService: "augment-skill-data",
      maxTokens,
      temperature: 0.1,
    }),
  });
  if (!resp.ok) throw new Error(`LLM error ${resp.status}: ${await resp.text()}`);
  const json = await resp.json() as { success: boolean; data?: { content?: string }; error?: { message?: string } };
  if (!json.success) throw new Error(json.error?.message ?? "LLM failed");
  return (json.data?.content ?? "").trim();
}

function buildExceptionPrompt(p: Policy): string {
  return `다음 퇴직연금/온누리상품권 업무 policy rule에서 exception(Else) 조건을 추론하라.
예외 조건이란 위 policy가 적용되지 않거나 거부되는 상황이다.

Policy:
- Code: ${p.code}
- Title: ${p.title}
- Condition (When): ${p.condition}
- Criteria (If): ${p.criteria}
- Outcome (Then): ${p.outcome}

출력 형식: 한 문장 한국어. 예시: "예외: 신청 금액이 0원 이하이거나 필수 증빙서류 미제출 시 처리 거부."
예외가 명확하지 않으면: "예외: 해당 없음 (조건 충족 시 항상 처리)."
출력: 예외 문장만, 다른 텍스트 없이.`;
}

function buildTestPrompt(p: Policy, exception: string): string {
  return `다음 업무 policy rule에 대한 테스트 시나리오 3개를 YAML로 생성하라.

Policy:
- Code: ${p.code}
- Title: ${p.title}
- Condition (When): ${p.condition}
- Criteria (If): ${p.criteria}
- Outcome (Then): ${p.outcome}
- Exception (Else): ${exception}

규칙:
1. happy_path: 정상 처리 (구체적 입력값과 예상 결과)
2. edge_case: 경계값 또는 최소/최대 조건
3. error_case: 예외 조건 발동 (error_code 포함)
4. given 필드: 구체적 변수명과 값 사용 (숫자/문자열/날짜 우선, boolean 최소화)

출력 형식 (이 줄부터 시작, 헤더 텍스트 없이):
---TEST_SCENARIOS---
- id: happy_path
  given:
    변수명: 구체적값
  when:
    action: 처리액션명
  then:
    outcome: 결과
    result_code: SUCCESS_CODE
- id: edge_case
  given:
    변수명: 경계값
  when:
    action: 처리액션명
  then:
    outcome: 결과
    result_code: CODE
- id: error_case
  given:
    변수명: 오류유발값
  when:
    action: 처리액션명
  then:
    outcome: rejected
    error_code: ERR_CODE`;
}

// ── Core augmentation ─────────────────────────────────────────────────

interface AugmentResult {
  skillId: string;
  r2Key: string;
  augmentedKey: string;
  policyCount: number;
  exceptionAdded: number;
  scenariosAdded: number;
  costUsd: number;
  durationMs: number;
  error?: string;
}

async function augmentSkill(skillId: string, r2Key: string): Promise<AugmentResult> {
  const t0 = Date.now();
  const tmpIn = `/tmp/augment-in-${skillId}.json`;
  const tmpOut = `/tmp/augment-out-${skillId}.json`;

  try {
    // Step 1: Download from R2
    const ok = await r2Get(r2Key, tmpIn);
    if (!ok) throw new Error(`R2 get failed for ${r2Key}`);

    const raw = await readFile(tmpIn, "utf-8");
    const pkg = JSON.parse(raw) as SkillPackage;

    if (!Array.isArray(pkg.policies) || pkg.policies.length === 0) {
      throw new Error("No policies in bundle");
    }

    // Step 2: Augment each policy (exception + test scenarios)
    let totalCost = 0;
    let exceptionAdded = 0;
    let scenariosAdded = 0;

    const augmentedPolicies = await Promise.all(
      pkg.policies.map(async (p) => {
        try {
          // Prompt A: exception clause
          const exceptionClause = await callLlm(buildExceptionPrompt(p), 100);
          // Prompt B: test scenarios
          const scenariosYaml = await callLlm(buildTestPrompt(p, exceptionClause), 400);

          // Cost estimate: ~$0.0008 per Haiku call × 2
          totalCost += 0.0016;

          const hasScenarios = scenariosYaml.includes("---TEST_SCENARIOS---");

          if (hasScenarios) scenariosAdded++;
          if (exceptionClause.startsWith("예외")) exceptionAdded++;

          return {
            ...p,
            source: {
              ...p.source,
              excerpt: exceptionClause || p.source.excerpt,
            },
            description: hasScenarios
              ? scenariosYaml
              : (p.description ?? ""),
          } as Policy;
        } catch {
          return p;
        }
      }),
    );

    // Step 3: Write augmented bundle
    const augmentedPkg: SkillPackage = { ...pkg, policies: augmentedPolicies };
    const augmentedKey = `skill-packages/augmented/${skillId}.skill.json`;

    if (!DRY_RUN) {
      await writeFile(tmpOut, JSON.stringify(augmentedPkg, null, 2), "utf-8");
      const putOk = await r2Put(augmentedKey, tmpOut);
      if (!putOk) throw new Error(`R2 put failed for ${augmentedKey}`);
    }

    return {
      skillId,
      r2Key,
      augmentedKey,
      policyCount: pkg.policies.length,
      exceptionAdded,
      scenariosAdded,
      costUsd: totalCost,
      durationMs: Date.now() - t0,
    };
  } finally {
    for (const f of [tmpIn, tmpOut]) {
      if (existsSync(f)) await unlink(f).catch(() => {});
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== F417 Skill Data Augmentation ===`);
  console.log(`  org=${ORG}  ids=${IDS_FILE}  concurrency=${CONCURRENCY}  dry-run=${DRY_RUN}\n`);

  // Load skill IDs from file
  const ids = (await readFile(IDS_FILE, "utf-8")).trim().split("\n").filter(Boolean);
  console.log(`📋 스킬 IDs: ${ids.length}건`);

  // Fetch r2_keys from D1
  console.log(`🔍 D1에서 r2_key 조회 중...`);
  const idList = ids.map((id) => `'${id}'`).join(",");
  const rows = await queryD1(
    `SELECT skill_id, r2_key FROM skills WHERE skill_id IN (${idList}) AND organization_id = '${ORG}'`,
  );

  const r2KeyMap = new Map(rows.map((r) => [r.skill_id, r.r2_key]));
  const missingIds = ids.filter((id) => !r2KeyMap.has(id));

  if (missingIds.length > 0) {
    console.log(`  ⚠️ D1 r2_key 미발견: ${missingIds.length}건 (${missingIds.slice(0, 3).map(id => id.slice(0, 8)).join(", ")}...)`);
  }
  console.log(`  ✅ r2_key 발견: ${r2KeyMap.size}건\n`);

  // Augment in parallel batches
  const results: AugmentResult[] = [];
  const queue = [...r2KeyMap.entries()];
  let inFlight = 0;
  let done = 0;
  const startedAt = Date.now();

  await new Promise<void>((resolveAll) => {
    function dispatch() {
      while (inFlight < CONCURRENCY && queue.length > 0) {
        const entry = queue.shift()!;
        const [skillId, r2Key] = entry;
        inFlight++;
        augmentSkill(skillId, r2Key).then((result) => {
          inFlight--;
          done++;
          results.push(result);
          const status = result.error ? "❌" : "✅";
          const dur = (result.durationMs / 1000).toFixed(1);
          console.log(
            `[${done}/${r2KeyMap.size}] ${status} ${skillId.slice(0, 8)} ` +
            `policies=${result.policyCount} exc=${result.exceptionAdded} tests=${result.scenariosAdded} ` +
            `$${result.costUsd.toFixed(4)} ${dur}s` +
            (result.error ? ` err=${result.error.slice(0, 60)}` : ""),
          );
          if (queue.length === 0 && inFlight === 0) resolveAll();
          else dispatch();
        });
      }
    }
    dispatch();
  });

  const totalDur = (Date.now() - startedAt) / 1000;
  const ok = results.filter((r) => !r.error);
  const failed = results.filter((r) => !!r.error);
  const totalCost = results.reduce((s, r) => s + r.costUsd, 0);

  console.log(`\n=== 결과 ===`);
  console.log(`  성공/실패: ${ok.length}/${results.length} (실패 ${failed.length})`);
  console.log(`  총 비용: $${totalCost.toFixed(3)}  소요: ${totalDur.toFixed(0)}s`);
  console.log(`  exception 추가: ${ok.reduce((s, r) => s + r.exceptionAdded, 0)}개`);
  console.log(`  test scenarios 추가: ${ok.reduce((s, r) => s + r.scenariosAdded, 0)}개`);

  // Write augmented IDs file for eval loop
  const augmentedIds = ok.map((r) => r.skillId);
  const idsOutFile = `/tmp/lpon-augmented-ids.txt`;
  await writeFile(idsOutFile, augmentedIds.join("\n") + "\n");
  console.log(`\n📄 Augmented IDs → ${idsOutFile} (${augmentedIds.length}건)`);

  // Write summary report
  const today = new Date().toISOString().slice(0, 10);
  const reportDir = resolve(process.cwd(), "reports");
  if (!existsSync(reportDir)) await mkdir(reportDir, { recursive: true });
  const reportPath = resolve(reportDir, `augmentation-${ORG}-${today}.json`);
  await writeFile(
    reportPath,
    JSON.stringify({
      executedAt: new Date().toISOString(),
      organization: ORG,
      dryRun: DRY_RUN,
      totalSkills: r2KeyMap.size,
      succeeded: ok.length,
      failed: failed.length,
      totalCostUsd: totalCost,
      durationSeconds: totalDur,
      results,
    }, null, 2),
  );
  console.log(`📄 보고서: ${reportPath}`);
  console.log(`\n다음 단계: bun run scripts/ai-ready/augment-eval-loop.ts --org ${ORG}`);
  console.log(`🏁 완료\n`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
