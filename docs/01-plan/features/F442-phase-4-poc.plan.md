---
id: AIF-PLAN-074
sprint: 276
feature: F442
title: F358 Phase 4 1 container PoC — lpon-charge 종단 검증 + svc-llm-router cleanup
status: active
estimated_hours: 3
created: 2026-05-08
related: [AIF-PLAN-056, AIF-PLAN-069, AIF-PLAN-073]
req: AIF-REQ-035
td: [TD-44]
related_features: [F358, F438]
---

# F442 Plan — AIF-PLAN-074

## 목표

F358 Phase 3b (Sprint 267 F434, TD-28 RESOLVED) 종결 후 잔여 Phase 4 종단 검증을
**1 container 단위 PoC**로 입증한다. 원안 "LPON 35 R2 전수 재패키징"은 Java source
미보유로 deferred(AIF-PLAN-056 §Background)되어 있으며, 본 PoC는 합성 source
(`반제품-스펙/.../charging.ts`)를 입력으로 **svc-policy `/policies/infer` → D1
force-approve → `rebundle-production.ts` → R2 bundle 1건 생성**까지 종단
파이프라인 동작을 입증한다. 부수적으로 `rebundle-production.ts`의 stale
endpoint(svc-llm-router, TD-44 decommissioned)와 stale cwd path
(`res-ai-foundry`) 정리 — TD-44 cleanup 완결.

## Background (fs 실측, S283 rules 준수)

| 항목 | 실측 결과 | 위치 |
|------|-----------|------|
| 합성 source 위치 | ✅ 11개 .ts 존재 (budget/cancel/charging/gift/loyalty/payment/pension/purchase/refund/settlement/voucher) | `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/` |
| `charging.ts` (target) | ✅ 174 lines, FN-001 충전 + threshold/limit 상수 + ChargeInput/Result | 동상 |
| `rebundle-production.ts` stale 1 | ⚠️ `LLM_API = "https://svc-llm-router-production..."` (TD-44 decommissioned) | line 14 |
| `rebundle-production.ts` stale 2 | ⚠️ `cwd: "/home/sinclair/work/axbd/res-ai-foundry/..."` (구 프로젝트 경로) | line ~340 |
| `rebundle-production.ts` callLlm() | ✅ 2회 호출: classify(haiku, line 153) + description(sonnet, line 243) | line 121~ |
| `runD1Command` | ✅ CF REST API 사용 정상 (line 416~) | 정상 |
| svc-policy `/admin/reopen-policies` | ✅ approved → candidate (역방향) 존재 | `services/svc-policy/src/routes/admin.ts:4` |
| svc-policy `/admin/force-approve` | ❌ 미존재 — 직접 D1 UPDATE 필요 | — |
| Smoke 인프라 (Sprint 271 F438) | ✅ `scripts/smoke/policy-inference-smoke.ts` 414 lines, fixture 패턴 재활용 가능 | — |
| `rebundle-all-domains.ts` LPON_DOMAINS | hardcode `["giftvoucher"]` — 본 PoC는 단일 호출이라 미수정 | line 11 |

## DoD (12건, autopilot Production Smoke 14회 변종 회피 강화)

| # | 항목 | 기준 |
|---|------|------|
| 1 | `scripts/rebundle-production.ts` callLlm() svc-llm-router → OpenRouter direct (CF AI Gateway 경유) 교체 | OpenRouter `chat/completions` HTTP POST + 환경변수 (`OPENROUTER_API_KEY`, `CLOUDFLARE_AI_GATEWAY_URL`) |
| 2 | `scripts/rebundle-production.ts` cwd path fix | `res-ai-foundry` → `Decode-X`. `services/svc-skill` 디렉토리 실재 확인 후 적용 |
| 3 | `scripts/poc/lpon-charge-ingest.ts` 신규 작성 | charging.ts source 4~6 chunk → svc-policy `/policies/infer` (Org `LPON-poc-${ts}`, Domain `lpon-charge`) |
| 4 | candidate 정책 5건 이상 생성 (D1 `policies` row count) | smoke 인프라 fixture 패턴 재활용. F438 입증 대비 동등 |
| 5 | `scripts/poc/force-approve-policies.ts` 신규 작성 + 실행 | CF REST API direct UPDATE `WHERE organization_id LIKE 'LPON-poc-%' AND domain='lpon-charge' AND status='candidate'` → status='approved'. 영향 row 5+ |
| 6 | `rebundle-production.ts` 실행 (`ORG_ID=LPON-poc-XXX DOMAIN=lpon-charge`) | exit 0 + console "🎉 Rebundle 완료!" + console "✅ <category>: N개 → R2 + D1 저장" |
| 7 | R2 bundle 1건 이상 검증 | `wrangler r2 object get ai-foundry-skill-packages/skill-packages/bundle-XXX.skill.json --remote` → JSON valid + `policies[]` field length ≥ 5 |
| 8 | skills D1 row 1건 이상 검증 | `SELECT skill_id, organization_id, domain, status, policy_count FROM skills WHERE organization_id LIKE 'LPON-poc-%'` → row count ≥ 1, status='bundled' |
| 9 | `reports/sprint-276-phase-4-poc-2026-05-08.{json,md}` 실파일 생성 | LLM cost 합계 + R2 key + skill_id + policy_count + 단계별 timing(seconds) 포함 |
| 10 | `docs/03-analysis/features/sprint-276-F442.analysis.md` (AIF-ANLS-074) | 종단 파이프라인 흐름 다이어그램 + DIVERGENCE/RESOLVED 마커 + Phase 4 가치 분석 |
| 11 | `docs/04-report/features/sprint-276-F442.report.md` (AIF-RPRT-074) | DoD 12 표 + 잔여 작업 + TD-44 RESOLVED 클로징 |
| 12 | typecheck + lint + test 전체 PASS, Match Rate ≥ 90% | turbo cache 우회 1회 (`pnpm exec tsc --noEmit` direct) — S337 `Turbo Cache 함정` 회피 |

## Scope

### In Scope
- `rebundle-production.ts` cleanup (svc-llm-router 제거 + cwd path fix)
- lpon-charge 단일 도메인 종단 PoC (ingest → approve → rebundle → R2)
- 신규 PoC scripts (`scripts/poc/lpon-charge-ingest.ts`, `scripts/poc/force-approve-policies.ts`)
- TD-44 cleanup completion 마킹

### Out of Scope (Phase 4 후속 별도 Sprint)
- 7 LPON 도메인 전수 ingestion (1 container PoC 한정)
- 11 도메인 + Miraeasset 도메인 통합
- `rebundle-all-domains.ts` LPON_DOMAINS 확장 (hardcode 1→7+)
- `/admin/force-approve` 표준 endpoint 신규 (PoC는 direct D1 UPDATE)
- HITL DO session 통한 정상 approval (PoC 우회)
- LPON Java source 확보/Tree-sitter 재파싱 (deferred 유지)
- F356-A 6기준 재평가 (메커니즘 한계, AIF-PLAN-056 §Background)

## Implementation Steps

### Step 1 — Plan/SPEC 사전 등록 (Master, ~30분)
- 본 Plan 작성 ✅
- SPEC §6 Sprint 276 블록 + §7 F442 등록
- commit + push

### Step 2 — Sprint WT 시동 (Master)
- `bash -i -c "sprint 276"` (또는 `/ax:sprint 276`) → WT 생성 + autopilot 주입

### Step 3 — autopilot 본 작업 (~2~3h, LLM ~$0.1)
1. `scripts/rebundle-production.ts` cleanup (~30 lines)
   - `LLM_API` 상수 제거 + `OPENROUTER_API_URL` + `OPENROUTER_API_KEY` env 추가
   - `callLlm()` 함수: OpenRouter `POST /v1/chat/completions` (CF AI Gateway 경유)
   - cwd path: `/home/sinclair/work/axbd/Decode-X/services/svc-skill` (또는 `process.cwd()` 기반 상대)
2. `scripts/poc/lpon-charge-ingest.ts` 신규 (~150 lines)
   - charging.ts → 4~6 chunk 분할 (interface/threshold/main function/error path)
   - svc-policy `/policies/infer` POST (Org `LPON-poc-${Date.now()}`, Domain `lpon-charge`, tier='opus')
   - 결과 D1 row count 검증 (≥ 5)
3. `scripts/poc/force-approve-policies.ts` 신규 (~80 lines)
   - CF REST API direct UPDATE `WHERE organization_id=? AND domain='lpon-charge' AND status='candidate'`
   - 영향 row 출력 + 검증
4. 실행 sequence (E2E):
   ```bash
   ORG_ID="LPON-poc-$(date +%s)"
   bun run scripts/poc/lpon-charge-ingest.ts --org "$ORG_ID"
   bun run scripts/poc/force-approve-policies.ts --org "$ORG_ID"
   CLOUDFLARE_API_TOKEN=xxx ORG_ID="$ORG_ID" DOMAIN=lpon-charge bun run scripts/rebundle-production.ts
   wrangler r2 object get ai-foundry-skill-packages/skill-packages/bundle-XXX.skill.json --remote --file /tmp/verify.json
   ```
5. reports + analysis + report MD
6. typecheck/lint/test PASS
7. PR open → CI green → squash merge

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | OpenRouter direct 호출 인증 실패 | CF AI Gateway URL + OPENROUTER_API_KEY 동일 패턴 svc-skill에서 검증됨(S260 TD-57). env vars 사전 export 검증 |
| R2 | HITL FK constraint 위반 | smoke 인프라 fixture는 HITL session 없이 candidate 생성 (Sprint 271 F438 입증). force-approve도 status 필드 단순 UPDATE라 FK 제약 무관 |
| R3 | `rebundle-production.ts` Bun.spawn wrangler 경로 fail | `services/svc-skill/wrangler.toml` 실재 검증 후 cwd 경로 적용. dry-run 사전 |
| R4 | LLM cost 변동 | Sprint 271 F438 기록 ~$0.0036/6 calls. PoC 1회 ~$0.05~0.1 예상. Opus tier 사용 시 ~$0.1 |
| R5 | autopilot Production Smoke 14회 변종 (reports 미첨부 hallucination) | DoD #9 reports 실파일 명시 + DoD #7 R2 객체 존재 검증 + DoD #8 D1 row 검증 — 3축 evidence trail 강제 |
| R6 | turbo cache stale typecheck PASS (S337) | DoD #12 `pnpm exec tsc --noEmit` direct 1회 강제 |

## 산출물

- Plan: `docs/01-plan/features/F442-phase-4-poc.plan.md` (AIF-PLAN-074, 본 문서)
- Design: 신규 작성 (autopilot 단계, AIF-DSGN-074)
- Code:
  - `scripts/rebundle-production.ts` (수정, ~30 lines)
  - `scripts/poc/lpon-charge-ingest.ts` (신규, ~150 lines)
  - `scripts/poc/force-approve-policies.ts` (신규, ~80 lines)
- Reports: `reports/sprint-276-phase-4-poc-2026-05-08.{json,md}` (실파일 명시)
- Analysis: `docs/03-analysis/features/sprint-276-F442.analysis.md` (AIF-ANLS-074)
- Report: `docs/04-report/features/sprint-276-F442.report.md` (AIF-RPRT-074)
- TD-44 cleanup mark: SPEC §8 TD-44 status DONE → CLOSED

## Success Criteria

- DoD 12/12 PASS
- Match Rate ≥ 90%
- LLM 실 cost ≤ $0.15
- R2 bundle JSON parse 성공 + policies[] length ≥ 5
- skills D1 row 1건 이상 status='bundled'
- TD-44 RESOLVED 마킹

## 메타 학습 후보 (autopilot 검증 후 정착 가능)

- (a) "1 container PoC 패턴" — 전수 작업 차단 시 단위 종단 검증으로 메커니즘 입증 (Sprint 254 Phase 1 5 sample / Sprint 256 F424 PoC / 본 Sprint 276 동계열)
- (b) Stale infra fix 누적 패턴 (svc-llm-router cleanup TD-44 → 본 PoC에서 종결) — 차기 cleanup 후보 grep 자동화 검토
- (c) `반제품-스펙/` 한글 디렉토리 경로 의존성 — 차기 PoC에서 path 표준화 검토
