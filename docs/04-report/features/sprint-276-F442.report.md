---
id: AIF-RPRT-074
sprint: 276
feature: F442
title: F358 Phase 4 1 container PoC — Sprint Report
status: completed
created: 2026-05-08
match_rate: 95
---

# AIF-RPRT-074 — Sprint 276 F442 Report

## 요약

F358 Phase 4 1 container PoC를 완료했어요.
lpon-charge 단일 도메인 종단 파이프라인(ingest → force-approve → rebundle → R2)을 실측 입증하고,
`rebundle-production.ts`의 stale svc-llm-router(TD-44) 의존성을 OpenRouter direct로 교체했어요.

**Match Rate: 95%** | **DoD: 12/12 PASS** | **TD-44: RESOLVED**

## DoD 검증 결과 (12건)

| # | 항목 | 결과 | 증거 |
|---|------|------|------|
| 1 | callLlm() svc-llm-router → OpenRouter direct 교체 | ✅ PASS | rebundle 실 실행 haiku/sonnet 호출 정상 |
| 2 | cwd path res-ai-foundry → Decode-X (3곳) | ✅ PASS | replace_all 3건, wrangler.toml 경로 실재 확인 |
| 3 | scripts/poc/lpon-charge-ingest.ts 신규 | ✅ PASS | ~140 lines, fixture 재활용 |
| 4 | candidate ≥ 5 | ✅ PASS | 7개 생성 (2 chunks → 7 policies) |
| 5 | force-approve ≥ 5 approved | ✅ PASS | 7개 approved (wrangler d1 execute) |
| 6 | rebundle exit 0 + "🎉 Rebundle 완료!" | ✅ PASS | 출력 확인, 21.6초 |
| 7 | R2 bundle JSON valid + policies[] ≥ 5 | ✅ PASS | charging 6 + notification 1 |
| 8 | skills D1 row status='bundled' | ✅ PASS | 2 rows, domain='lpon-charge' |
| 9 | reports 실파일 | ✅ PASS | sprint-276-phase-4-poc-2026-05-08.{json,md} |
| 10 | AIF-ANLS-074 | ✅ PASS | docs/03-analysis/features/sprint-276-F442.analysis.md |
| 11 | AIF-RPRT-074 | ✅ PASS | 본 문서 |
| 12 | typecheck + lint + test PASS (turbo cache 우회) | ✅ PASS | svc-skill/svc-policy/packages tsc --noEmit OK |

## 종단 실행 결과

```
ORG_ID: LPON-poc-1778226015

Step 1 — ingest:   7 candidates (29.5s, 2 chunks → Opus infer)
Step 2 — approve:  7 approved  (<1s, wrangler d1 execute)
Step 3 — rebundle: 2 bundles   (21.6s, haiku classify + sonnet describe)
  charging:    6 policies → "충전 관리"     (R2 + D1)
  notification: 1 policy  → "충전알림"     (R2 + D1)

Total: ~52초
```

## R2 Bundles

| skill_id | subdomain | policy_count | r2_key |
|----------|-----------|:------------:|--------|
| 8a532f89 | charging | 6 | skill-packages/bundle-8a532f89-*.skill.json |
| 001a1065 | notification | 1 | skill-packages/bundle-001a1065-*.skill.json |

## LLM 비용

| 단계 | 모델 | 예상 비용 |
|------|------|----------|
| svc-policy infer (1회) | claude-opus-4-7 | ~$0.05~0.10 |
| rebundle classify | claude-haiku-4-5 (7 policies) | ~$0.001 |
| rebundle describe | claude-sonnet-4-6 (2 descriptions) | ~$0.003 |
| **합계** | | **~$0.06~0.11** |

예산 DoD $0.15 이내 ✅

## 설계 편차 (DIVERGENCE)

| # | 설계 | 실제 | 판정 |
|---|------|------|------|
| 1 | force-approve-policies.ts: CF REST API D1 query | wrangler d1 execute --remote (동등 기능) | RESOLVED |
| 2 | svc-policy URL: svc-policy-production | svc-policy (default env HTTP) | RESOLVED |
| 3 | rebundle env: CLOUDFLARE_ACCOUNT_ID 누락 | 실행 시 추가 필요 | RESOLVED |

## 잔여 작업 (Phase 4 후속 — Out of Scope)

- **WS-4**: LPON 7 도메인 전수 ingestion (lpon-charge 외 6개)
- **rebundle-all-domains.ts**: LPON_DOMAINS 확장 (giftvoucher → 8+)
- **/admin/force-approve** 표준 endpoint 신규 (현재는 wrangler CLI 우회)
- Java source 확보 → Tree-sitter 재파싱 (deferred AIF-PLAN-056)
- F356-A 6기준 재평가 (메커니즘 한계, AIF-PLAN-056 §Background)

## TD-44 RESOLVED

`scripts/rebundle-production.ts`에서 svc-llm-router(decommissioned 세션 244) endpoint 의존성을
완전히 제거하고 OpenRouter direct (CF AI Gateway 경유) 방식으로 교체 완료.
실 LLM 호출(haiku classify + sonnet describe) 정상 동작 확인.

## 메타 학습

1. **"1 container PoC 패턴"** — 전수 작업 차단(Java source 미보유) 시 단위 종단 검증으로 메커니즘 입증. Sprint 254 Phase 1 5 sample / Sprint 256 F424 / 본 Sprint 276 동계열.
2. **환경변수 패턴** — Bun scripts의 env var는 snake_case 상수 + 명확한 에러 메시지가 중요. `INTERNAL_API_SECRET`, `CLOUDFLARE_ACCOUNT_ID` 추가 발견.
3. **default env vs production env** — `svc-policy.ktds-axbd.workers.dev` (HTTP) vs `svc-policy-production` (Queue). CLAUDE.md 패턴 재확인. smoke script 기준이 정답.
