---
code: AIF-DESIGN-228
title: Sprint 228 — G-1 Phase 3 Packaging + Submit + Evidence (F397~F400)
version: 1.0
status: Ready
category: Design
related:
  - docs/01-plan/features/phase-3-gap-remediation.plan.md
  - docs/03-analysis/AIF-ANLS-031_m2-tier-a-production-evidence.md
created: 2026-04-21
updated: 2026-04-21
author: Sinclair Seo
---

# Sprint 228 Design — G-1 Phase 3

## 전제

- **Phase 2 완료** (Sprint 225, PR #26 `710eaca`): converter.ts P1~P5 패치로 SC+TR 0.30→1.00 달성
- **baseline-2** (`reports/ai-ready-baseline-2-2026-04-21.json`): 7/7 PASS @ threshold 0.8, mean 0.916
- **Production infra**: svc-skill-production + Foundry-X API 모두 가동 중

## §1 F-item 상세

| F | 의존 | 예상 | 산출물 |
|---|------|:----:|--------|
| F397 | - | 1h | 7 skillId JSON 리포트 (`reports/packaging-2026-04-21.json`) |
| F398 | F397 | 1h | HTTP 응답 로그 + handoff_jobs D1 INSERT |
| F399 | F398 | 30min | `reports/handoff-jobs-d1-2026-04-21.json` |
| F400 | F397~F399 | 1h | `docs/03-analysis/AIF-ANLS-031_m2-tier-a-production-evidence.md` + SPEC.md 갱신 |

## §2 Production 엔드포인트

| 서비스 | URL | 인증 |
|--------|-----|------|
| svc-skill (production) | `https://svc-skill-production.ktds-axbd.workers.dev` | `X-Internal-Secret: e2e-test-secret-2026` |
| Foundry-X API | `https://foundry-x-api.ktds-axbd.workers.dev` | X-Internal-Secret (svc-skill 내부 전달) |
| Foundry-X D1 | `db-handoff` (Cloudflare D1, remote) | wrangler CLI |

## §3 F397 — Packaging 7 Containers

**입력**: `.decode-x/spec-containers/lpon-{budget,charge,gift,payment,purchase,refund,settlement}/`

**호출 방식**: `scripts/package-spec-containers.ts` (기존 스크립트 활용)

```bash
INTERNAL_API_SECRET=e2e-test-secret-2026 \
  tsx scripts/package-spec-containers.ts \
  --org lpon \
  --url https://svc-skill-production.ktds-axbd.workers.dev
```

**API**: `POST /skills/from-spec-container`
- Body: SpecContainerInput (JSON)
- Auth: `X-Internal-Secret` header
- Response 200: `{ success: true, data: { skillId, domain, policyCount, r2Key } }`

**산출물**: `reports/packaging-2026-04-21.json`

```json
{
  "generatedAt": "...",
  "productionUrl": "https://svc-skill-production.ktds-axbd.workers.dev",
  "summary": { "total": 7, "success": 7, "failed": 0 },
  "skills": [
    { "container": "lpon-budget", "skillId": "...", "policyCount": 5, "r2Key": "...", "status": "ok" }
  ]
}
```

## §4 F398 — POST /handoff/submit × 7

**F397에서 받은 7개 skillId 각각에 대해**:

```bash
curl -s -X POST https://svc-skill-production.ktds-axbd.workers.dev/handoff/submit \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: e2e-test-secret-2026" \
  -d '{"orgId": "lpon", "skillId": "<id>"}'
```

**기대 응답**:
- HTTP 200: `{ success: true, data: { jobId, status: "submitted", aiReadyScore } }` (GATE PASS)
- HTTP 409: `{ success: false, error: { code: "GATE_FAILED" } }` (AI-Ready < 0.8)

**baseline-2 mean 0.916 > threshold 0.8이므로 HTTP 200 기대**.

## §5 F399 — Foundry-X D1 조회

```bash
cd ~/work/Foundry-X  # 또는 ~/Foundry-X
npx wrangler d1 execute db-handoff \
  --env production \
  --remote \
  --command "SELECT id, skill_id, org_id, status, created_at FROM handoff_jobs WHERE skill_id IN (<7 skillIds>) ORDER BY created_at DESC"
```

**산출물**: `reports/handoff-jobs-d1-2026-04-21.json`

## §6 F400 — AIF-ANLS-031 증빙 리포트

`docs/03-analysis/AIF-ANLS-031_m2-tier-a-production-evidence.md` 신규 작성:

| 섹션 | 내용 |
|------|------|
| §1 목적 | M-2 TD-25 Production E2E 7/7 달성 증빙 (본부장 리뷰용) |
| §2 전제 조건 | Phase 2 converter.ts 패치 완료, baseline-2 7/7 PASS |
| §3 Packaging 결과 | 7 skillId + AI-Ready score + R2 key |
| §4 Handoff Submit 결과 | HTTP 응답 7건 + jobId |
| §5 Foundry-X D1 | handoff_jobs 7 rows |
| §6 Cross-check | skillId × jobId × D1 row 일관성 |
| §7 결론 | M-2 KPI 달성 여부 + TD-25 종결 |

## §7 SPEC.md 갱신 항목

1. §5 "Foundry-X Production E2E" `1/7` → `7/7`
2. §6 Phase 8 F397~F400 상태 `IN_PROGRESS` → `DONE`
3. AIF-PLAN-037 G-1 Phase 3 ✅ 마킹

## §8 Risk

| Risk | 대응 |
|------|------|
| HTTP 401 (INTERNAL_API_SECRET 불일치) | 실제 production secret 확인 후 재시도 |
| HTTP 409 GATE_FAILED (AI-Ready < 0.8) | converter.ts 패치가 production에 미배포된 경우 → `gh workflow run deploy-services.yml -F environment=production` |
| Foundry-X D1 접근 오류 | Foundry-X repo `wrangler d1 execute --remote` cross-repo 패턴 사용 (세션 218 F355a 선례) |
| spec_container_id 중복 | UNIQUE 제약 없음 — 신규 UUID 생성으로 충돌 없음 |
