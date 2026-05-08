---
id: AIF-ANLS-074
sprint: 276
feature: F442
title: F358 Phase 4 1 container PoC — 종단 파이프라인 Gap Analysis
status: completed
created: 2026-05-08
match_rate: 95
---

# AIF-ANLS-074 — Sprint 276 F442 Gap Analysis

## §1 Design vs Implementation Match

| 설계 항목 | 구현 여부 | 비고 |
|----------|----------|------|
| rebundle-production.ts callLlm() OpenRouter 교체 | ✅ MATCH | tier→model 매핑 + CF AI Gateway URL |
| cwd path res-ai-foundry → Decode-X (3곳) | ✅ MATCH | replace_all 3건 완료 |
| scripts/poc/lpon-charge-ingest.ts 신규 | ✅ MATCH | ~140 lines, fixture 재활용 |
| scripts/poc/force-approve-policies.ts 신규 | ✅ MATCH | ~120 lines (wrangler CLI 방식으로 실제 실행) |
| E2E: ingest → approve → rebundle → R2 | ✅ MATCH | 종단 입증 완료 |
| reports 실파일 | ✅ MATCH | .json + .md 모두 실파일 |
| AIF-ANLS-074 | ✅ MATCH | 본 문서 |
| AIF-RPRT-074 | ✅ MATCH | docs/04-report/features/sprint-276-F442.report.md |

**Match Rate: 95%** (1건 설계 편차: force-approve-policies.ts가 CF REST API 대신 wrangler CLI 방식으로 실행 — 기능 동등, DoD 충족)

## §2 종단 파이프라인 흐름

```
charging.ts (174 lines, 합성 source)
  │
  ▼  [scripts/poc/lpon-charge-ingest.ts]
  │  fixture: scripts/smoke/fixtures/exception-chunks/lpon-charge.json (2 chunks)
  │  
  ▼  [svc-policy /policies/infer (Opus, production)]
  │  → 7 PolicyCandidate D1 rows (status='candidate')
  │    • POL-PENSION-RG-001~003 (충전 한도 규정)
  │    • POL-PENSION-CT-004 (결제 수단 인증)
  │    • POL-PENSION-MG-005~006 (자동 충전 관리)
  │    • POL-PENSION-NF-007 (알림)
  │
  ▼  [wrangler d1 execute --remote (force-approve)]
  │  → 7 rows: status='candidate' → 'approved'
  │
  ▼  [scripts/rebundle-production.ts (cleanup'd)]
  │  Step 1: svc-policy GET /policies?status=approved → 7 rows
  │  Step 2: LLM classify (haiku) → 2 categories (charging 6, notification 1)
  │  Step 3: LLM describe (sonnet) → 2 skill descriptions
  │  Step 4: Bundle build → 2 JSON bundles
  │  Step 5: D1 classification save (7 rows)
  │  Step 6: R2 + D1 bundle save (2 bundles)
  │  Step 7: supersede old 1:1 skills
  │
  ▼  R2 bucket ai-foundry-skill-packages
  │  • skill-packages/bundle-8a532f89-*.skill.json (charging, 6 policies)
  │  • skill-packages/bundle-001a1065-*.skill.json (notification, 1 policy)
  │
  ▼  D1 db-skill
     • 2 skills rows, status='bundled', domain='lpon-charge'
```

**총 소요: ~50초** (ingest 29s + approve <1s + rebundle 22s)

## §3 DIVERGENCE 분석

| ID | 분류 | 설명 | 상태 |
|----|------|------|------|
| DIV-F442-01 | 설계 편차 | force-approve-policies.ts: CF REST API 방식 → wrangler CLI 방식으로 실제 실행. scripts는 runtime-only (tsconfig 범위 외), wrangler d1 execute가 더 안정적 | RESOLVED (방식 변경, DoD 동등 충족) |
| DIV-F442-02 | 설계 편차 | svc-policy URL: svc-policy-production → svc-policy (default env가 HTTP 처리). CLAUDE.md 패턴 재확인 | RESOLVED (수정 적용) |
| DIV-F442-03 | 관찰 | OPENROUTER_API_KEY + CLOUDFLARE_ACCOUNT_ID 환경변수 추가 필요 (rebundle 실행 시). DoD 기술한 Usage 예시에 누락됨 | RESOLVED (환경변수 추가, runtime PASS) |

## §4 Phase 4 가치 분석

### PoC가 입증한 것
1. **LLM 분류 정확도**: 7 policies → charging/notification 2 카테고리 자연 분류. domain-agnostic classifier 동작 확인.
2. **exception 필드 자연 채움**: 7/7 정책 exception 필드 자동 생성 (F418 SchemaFix 효과 지속)
3. **rebundle cleanup**: svc-llm-router(TD-44) → OpenRouter direct 교체 후 실 LLM 호출 2회 정상 (haiku classify + sonnet describe)
4. **종단 파이프라인 연속성**: 합성 source → ingest → D1 → approve → rebundle → R2 → D1 skills. 5개 단계 무결 완료.

### 차기 Phase 4 전수 작업 (Out of Scope)
- 7 LPON 도메인 전수 ingestion (현재 lpon-charge 1건)
- Java source 확보 → Tree-sitter 재파싱 (deferred, AIF-PLAN-056)
- rebundle-all-domains.ts LPON_DOMAINS 확장 (hardcode giftvoucher → 8 domains)

## §5 TD-44 Cleanup 검증

| 항목 | 이전 (stale) | 이후 (cleanup) |
|------|-------------|----------------|
| `LLM_API` 상수 | `svc-llm-router-production.ktds-axbd.workers.dev` | 제거 |
| `callLlm()` 방식 | `LLM_API/complete` (내부 포맷) | OpenRouter REST (표준 OpenAI 포맷) |
| tier→model 매핑 | 없음 (svc-llm-router 내부 처리) | `TIER_MODELS: { haiku, sonnet, opus }` |
| cwd path (3곳) | `/home/sinclair/work/axbd/res-ai-foundry/services/svc-skill` | `/home/sinclair/work/axbd/Decode-X/services/svc-skill` |
| 실 LLM 호출 | 401 (decommissioned) | ✅ HTTP 200 (haiku classify + sonnet describe) |

**TD-44: ✅ RESOLVED**
