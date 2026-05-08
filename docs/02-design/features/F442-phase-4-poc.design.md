---
id: AIF-DSGN-074
sprint: 276
feature: F442
title: F358 Phase 4 1 container PoC — lpon-charge 종단 검증 + svc-llm-router cleanup
status: active
created: 2026-05-08
related: [AIF-PLAN-074, AIF-ANLS-074]
---

# F442 Design — AIF-DSGN-074

## §1 목표

Phase 4 종단 파이프라인을 `lpon-charge` 단일 도메인으로 PoC 입증한다.

```
charging.ts (합성 source)
  → lpon-charge-ingest.ts → svc-policy /policies/infer → D1 candidates (≥5)
  → force-approve-policies.ts → D1 approved (≥5)
  → rebundle-production.ts (cleanup'd) → svc-skill API → R2 bundle + D1 skills row
```

부수적으로 `scripts/rebundle-production.ts`에서 TD-44 decommissioned `svc-llm-router`를
OpenRouter direct (CF AI Gateway 경유)로 교체하고, stale cwd path(`res-ai-foundry`)를
수정한다.

## §2 변경 파일 목록

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `scripts/rebundle-production.ts` | 수정 (~30 lines) | LLM_API 상수 제거 + callLlm() OpenRouter direct 교체 + cwd path 3곳 수정 |
| `scripts/poc/lpon-charge-ingest.ts` | 신규 (~120 lines) | charging.ts → D1 candidates 생성 |
| `scripts/poc/force-approve-policies.ts` | 신규 (~80 lines) | CF REST API → D1 candidates→approved |
| `reports/sprint-276-phase-4-poc-2026-05-08.json` | 신규 | E2E 실행 결과 증거 (JSON) |
| `reports/sprint-276-phase-4-poc-2026-05-08.md` | 신규 | E2E 실행 결과 증거 (MD) |
| `docs/03-analysis/features/sprint-276-F442.analysis.md` | 신규 | AIF-ANLS-074 |
| `docs/04-report/features/sprint-276-F442.report.md` | 신규 | AIF-RPRT-074 |

## §3 rebundle-production.ts 수정 설계

### Before (stale)
```typescript
const LLM_API = "https://svc-llm-router-production.ktds-axbd.workers.dev";

async function callLlm(tier: string, system: string, userContent: string, maxTokens = 4096): Promise<string> {
  const resp = await fetch(`${LLM_API}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Secret": SECRET },
    body: JSON.stringify({ tier, messages: [...], system, callerService: "svc-skill", ... }),
  });
  // ...
  return json.data?.content ?? "";
}
```

### After (OpenRouter direct via CF AI Gateway)
```typescript
// 환경변수 추가
const OPENROUTER_API_KEY = process.env["OPENROUTER_API_KEY"] ?? "";
const CF_AI_GATEWAY_URL = process.env["CLOUDFLARE_AI_GATEWAY_URL"] ?? "";

// tier → model 매핑
const TIER_MODELS: Record<string, string> = {
  "haiku": "anthropic/claude-haiku-4-5",
  "sonnet": "anthropic/claude-sonnet-4-6",
  "opus": "anthropic/claude-opus-4-7",
};

async function callLlm(tier: string, system: string, userContent: string, maxTokens = 4096): Promise<string> {
  const model = TIER_MODELS[tier] ?? TIER_MODELS["sonnet"]!;
  const url = CF_AI_GATEWAY_URL || "https://api.openrouter.ai/api/v1/chat/completions";
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      max_tokens: maxTokens,
      temperature: 0.1,
    }),
  });
  if (!resp.ok) throw new Error(`LLM error ${resp.status}: ${await resp.text()}`);
  const json = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}
```

### cwd path 수정 (3곳)
- `res-ai-foundry` → `Decode-X` (모두 동일 패턴)
- 실재 경로: `/home/sinclair/work/axbd/Decode-X/services/svc-skill`

## §4 lpon-charge-ingest.ts 설계 (~120 lines)

기존 fixture `scripts/smoke/fixtures/exception-chunks/lpon-charge.json`을 재활용한다.
이미 2개 chunk로 완성된 fixture가 존재하므로 로드하여 svc-policy에 전송한다.

```typescript
#!/usr/bin/env bun
/**
 * lpon-charge-ingest.ts — F442 Sprint 276 (AIF-PLAN-074)
 *
 * charging.ts 합성 source의 기존 fixture chunks를 svc-policy /policies/infer에
 * 전송하여 D1 candidate 정책을 생성한다.
 *
 * Usage:
 *   bun run scripts/poc/lpon-charge-ingest.ts --org LPON-poc-1234567890
 */

const BASE = "https://svc-policy-production.ktds-axbd.workers.dev";
const SECRET = "e2e-test-secret-2026";

// arg parse
// --org: organization ID (required)

// 1. 기존 fixture 로드 (scripts/smoke/fixtures/exception-chunks/lpon-charge.json)
// 2. svc-policy POST /policies/infer
//    body: { organizationId, domain: "lpon-charge", chunks, tier: "opus" }
// 3. D1 candidate count 조회 (GET /policies?organizationId=&status=candidate)
//    count >= 5 검증
// 4. 결과 출력 (JSON)
```

**핵심 설계 결정**: fixture 재활용 (신규 chunking 불필요 — 이미 Sprint 271 F438에서 검증됨)

## §5 force-approve-policies.ts 설계 (~80 lines)

```typescript
#!/usr/bin/env bun
/**
 * force-approve-policies.ts — F442 Sprint 276
 *
 * CF REST API를 사용해 D1 db-policy에서 특정 org/domain의
 * candidate 정책을 approved로 직접 UPDATE한다.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=xxx bun run scripts/poc/force-approve-policies.ts --org LPON-poc-1234567890
 */

// CF REST API: POST /accounts/{account_id}/d1/database/{db_id}/query
// SQL: UPDATE policies SET status='approved', reviewed_at=datetime('now')
//      WHERE organization_id=? AND domain='lpon-charge' AND status='candidate'
// 영향 row 수 출력 (expect ≥ 5)
```

**핵심 설계 결정**: Plan §Background에서 확인된 대로 `/admin/force-approve` endpoint 미존재.
CF REST API direct UPDATE가 유일한 PoC 경로. (FK 제약 없음 — status 필드 단순 UPDATE)

CF API 필요 파라미터:
- `CLOUDFLARE_API_TOKEN`: env var
- account_id: `b6c06059b413892a92f150e5ca496236` (MEMORY.md 정착 값)
- db_id: `db-policy` → wrangler.toml에서 조회 필요

## §6 E2E 실행 순서

```bash
ORG_ID="LPON-poc-$(date +%s)"

# Step 1: ingest
bun run scripts/poc/lpon-charge-ingest.ts --org "$ORG_ID"

# Step 2: force-approve
CLOUDFLARE_API_TOKEN="$CF_TOKEN" bun run scripts/poc/force-approve-policies.ts --org "$ORG_ID"

# Step 3: rebundle (OpenRouter key + CF AI Gateway URL + CF API token 필요)
OPENROUTER_API_KEY="$OR_KEY" \
CLOUDFLARE_AI_GATEWAY_URL="https://gateway.ai.cloudflare.com/v1/b6c06059b413892a92f150e5ca496236/axbd-team/openrouter/v1/chat/completions" \
CLOUDFLARE_API_TOKEN="$CF_TOKEN" \
ORG_ID="$ORG_ID" \
DOMAIN="lpon-charge" \
  bun run scripts/rebundle-production.ts

# Step 4: R2 verify (bundle key from rebundle output)
wrangler r2 object get ai-foundry-skill-packages/skill-packages/bundle-XXX.skill.json \
  --remote --file /tmp/verify.json
cat /tmp/verify.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('policies',[])), 'policies')"
```

## §7 DoD 매핑

| DoD # | 설계 대응 | 파일 |
|-------|----------|------|
| 1 | callLlm() OpenRouter direct 교체 | `scripts/rebundle-production.ts` |
| 2 | cwd path `res-ai-foundry` → `Decode-X` | `scripts/rebundle-production.ts` |
| 3 | lpon-charge-ingest.ts 신규 | `scripts/poc/lpon-charge-ingest.ts` |
| 4 | candidate ≥ 5 | ingest script D1 count check |
| 5 | force-approve-policies.ts 신규 + 실행 | `scripts/poc/force-approve-policies.ts` |
| 6 | rebundle-production.ts exit 0 + "🎉 Rebundle 완료!" | rebundle 실행 |
| 7 | R2 bundle JSON valid + policies[] ≥ 5 | wrangler r2 get + parse |
| 8 | skills D1 row status='bundled' | D1 SELECT |
| 9 | reports 실파일 | `reports/sprint-276-phase-4-poc-2026-05-08.{json,md}` |
| 10 | AIF-ANLS-074 | `docs/03-analysis/features/sprint-276-F442.analysis.md` |
| 11 | AIF-RPRT-074 | `docs/04-report/features/sprint-276-F442.report.md` |
| 12 | typecheck + lint + test PASS (turbo cache 우회) | `pnpm exec tsc --noEmit` |

## §8 환경변수 요약

| 변수 | 용도 | 출처 |
|------|------|------|
| `CLOUDFLARE_API_TOKEN` | CF REST API + wrangler r2 | `~/.secrets/decode-x-internal` |
| `OPENROUTER_API_KEY` | LLM 호출 | `~/.secrets/openrouter-api-key` |
| `CLOUDFLARE_AI_GATEWAY_URL` | CF AI Gateway URL (chat/completions full path) | MEMORY.md 정착 값 |
| `ORG_ID` | rebundle 대상 org | PoC 시 `LPON-poc-$(date +%s)` |
| `DOMAIN` | rebundle 대상 domain | `lpon-charge` |
