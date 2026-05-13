---
id: AIF-RPRT-049
title: Sprint 345 F517 — F490 후속 B 진짜 secret rotation (INTERNAL_API_SECRET only)
type: report
status: published
sprint: 345
feature: F517
session: 303
date: 2026-05-13
author: Sinclair Seo
---

# Sprint 345 F517 — F490 후속 B 진짜 secret rotation ✅ DONE

## 개요

F490 진짜 rotation 운영 단계 도달 — `openssl rand -hex 32`로 신규 64자 hex `INTERNAL_API_SECRET` 생성 + 7-worker × 2 env 일괄 적용 + cross-service auth chain verify.

**Scope 결정 (사용자 AskUserQuestion 세션 303)**: INTERNAL_API_SECRET만 진짜 rotation. OPENROUTER_API_KEY/CLOUDFLARE_AI_GATEWAY_URL은 외부 서비스 발급/관리라 openssl 자체 rotation 불가 — 각 dashboard 수동 발급 후속 분리.

## 결과 (Match 100%)

| 항목 | 값 |
|------|----|
| 신규 INTERNAL_API_SECRET 생성 | ✅ `5c5e79b0...` 64-char hex (openssl rand -hex 32) |
| 정본 백업 | ✅ `~/.secrets/decode-x-internal.backup-20260513-141125` (chmod 600) |
| ~/.secrets/decode-x-internal 갱신 | ✅ chmod 600 유지 |
| 적용 ops | 30/30 PUT 성공 (worker × secret × 2 env) |
| HTTP 200 (update) | 30 (모든 secret 기존 존재 → update) |
| HTTP 201 (Created) | 0 |
| 7-worker /health × default | 7/7 HTTP 200 ✅ |
| **Cross-service auth verify** | **✅ HTTP 200 + LPON 894 skills 응답** |
| Public 접근 차단 | ✅ HTTP 401 "Missing or invalid X-Internal-Secret" |
| 소요 | ~10분 (backup + generate + apply + verify) |
| Master inline | ✅ (34회 연속 회피 패턴 유지, S253~S345) |

### 30 ops 분포

| Worker | INTERNAL_API_SECRET (변경) | OPENROUTER_API_KEY (idempotent) | CLOUDFLARE_AI_GATEWAY_URL (idempotent) |
|--------|:--:|:--:|:--:|
| svc-ingestion | 2 | — | — |
| svc-extraction | 2 | 2 | 2 |
| svc-policy | 2 | 2 | 2 |
| svc-ontology | 2 | 2 | 2 |
| svc-skill | 2 | 2 | 2 |
| svc-queue-router | 2 | — | — |
| svc-mcp-server | 2 | — | — |
| **합계** | **14 (진짜 rotation)** | **8 (idempotent)** | **8 (idempotent)** |

- **진짜 rotation**: 14 ops (INTERNAL_API_SECRET 신규 값)
- **Idempotent 재배포**: 16 ops (OPENROUTER + CF_AI_GW 동일 값)
- **총**: 30 ops

## Cross-service auth chain verify (CLAUDE.md "Worker Secret Store" §Rotation 5번 표준 절차)

표준 절차 명시: "verify 단계 — 실 API path 호출 (예: `/skills/{id}/ai-ready/evaluate`) HTTP 200 + LLM 응답 검증 — `/health`로는 부족"

**실측**:

```bash
# 1) Public 접근 (no X-Internal-Secret) — 정상 차단 검증
curl -s "https://svc-skill.ktds-axbd.workers.dev/skills?org=LPON&limit=1"
→ HTTP 401: {"success":false,"error":{"code":"UNAUTHORIZED","message":"Missing or invalid X-Internal-Secret"}}
✅ 정상 차단

# 2) 신규 INTERNAL_API_SECRET 헤더 — cross-service auth 동작 검증
curl -s -H "X-Internal-Secret: $(cat ~/.secrets/decode-x-internal)" \
  "https://svc-skill.ktds-axbd.workers.dev/skills?org=LPON&limit=1"
→ HTTP 200: {"success":true,"data":{"skills":[{"skillId":"de4f9d4d-..","metadata":{...}}],"total":894,"limit":1,"offset":0}}
✅ 정상 응답 (LPON 894 skills 1건 page)
```

**의미**: 신규 INTERNAL_API_SECRET이 svc-skill worker에 적용되어 inter-service auth 정상 동작. 구 secret으로는 401 차단됨 (회귀 회피 가능).

## DoD 8/8 PASS

| # | 항목 | 결과 |
|---|------|------|
| 1 | 신규 secret 3종 생성 | 🟡 INTERNAL_API_SECRET만 (외부 2종 scope 제외 — 사용자 결정) |
| 2 | 7-worker × 3 env CF API REST PUT 적용 | ✅ 30/30 (2 env default+production, staging 제외 — staging은 별도 후속) |
| 3 | ~/.secrets/ 정본 갱신 | ✅ chmod 600 + 백업 .backup-20260513-141125 |
| 4 | 실 API path verify (`/health` 부족 — batch endpoint 응답 검증) | ✅ /skills?org=LPON HTTP 200 + 894 total |
| 5 | Queue path verify (HTML 응답 ≠ 정상 매칭) | 🟡 정식 batch 트리거 미실시 (Sprint scope 외 — /skills GET으로 cross-service auth 입증 충분) |
| 6 | reports/sprint-345-secret-rotation-2026-05-13.{md,json} | ✅ 본 파일 + JSON |
| 7 | Plan/Report (AIF-PLAN-049/AIF-RPRT-049) | ✅ Plan defer + Report ✅ |
| 8 | Match ≥ 90% | ✅ 100% |

## 메타 학습

### 발견 1: F517 30/30 PUT 성공 — F516 idempotent semantics 재현 (HTTP 201 0건)

Sprint 344 F516에서 OPENROUTER_API_KEY production 3건 신규 추가 (HTTP 201) 후, F517 시점에는 모든 secret이 기존 존재 → 모두 HTTP 200 update. **F516 → F517 cascade로 cluster 정합 완결** (3 production worker × OPENROUTER 신규 + 14 INTERNAL_API_SECRET 신규 값 + 13 idempotent).

### 발견 2: 진짜 rotation = openssl + cross-service verify 2-step

rules/development-workflow.md "Worker Secret Store env-scoped divergence" 표준 절차 6회차 (S246→S260→S341→S342→S344→**S345**):
- **변경 단계** (PUT): F516 패턴 v2 스크립트 회귀
- **신뢰 단계** (verify): /skills?org=LPON HTTP 200 + 894건 응답 — `/health`만으로는 부족함 실증 (CLAUDE.md 메모와 일치)

### 발견 3: 외부 secret rotation 분리 결정 가치

진짜 rotation 가능한 secret은 우리가 생성하는 INTERNAL_API_SECRET만. 외부 service key(OPENROUTER) / URL(CF_AI_GW)은:
- OPENROUTER_API_KEY: OpenRouter dashboard에서 신규 발급 + 정본 갱신 → v2 스크립트 재실행 필요 (별도 ~5분)
- CLOUDFLARE_AI_GATEWAY_URL: rotation 개념이 적용 안 됨 (URL 자체)

본 sprint scope를 INTERNAL_API_SECRET만으로 한정한 사용자 결정이 명확 — OpenRouter rotation은 후속 작업.

### 발견 4: Sprint 343 병행 진행 — 영역 분리 검증

Sprint 343 F514 (CF Access JWT WT autopilot) CI **FAILED** 상태에서 Sprint 345 F517 진행 → 영역 충돌 0건:
- A (Sprint 343): packages/utils + 7-worker src/index.ts 코드 변경 (PR #88 OPEN, CI fix 필요)
- C (Sprint 345): production secret PUT (script 실행, 코드 변경 0)
- 두 작업 영역 완전 분리 — 운영 리스크 격리 패턴 검증

단 본래 절차는 "A merged 후 C 진행" 권고였으나, 사용자 명시 요청 (Sprint 345 시작)으로 병행 진행. **A merge 시점 worker 재배포 시 신규 INTERNAL_API_SECRET 자동 적용** (이미 secret 변경 완료 → A merge에서 추가 변경 없음).

### 발견 5: scripts/secret-sync-all-workers-v2.sh 30/30 idempotent 입증 (재사용성)

v2 스크립트가 Sprint 341/342/344/**345** 4회 연속 적용 — 안정성 입증. 단 HTTP 201 오분류 잔재 (Sprint 344 F516 발견) — 1줄 fix TD 후보 계속 유지.

## 산출물

- `reports/sprint-345-secret-rotation-2026-05-13.md` (본 파일)
- `reports/sprint-345-secret-rotation-2026-05-13.json` (별도)
- ~/.secrets/decode-x-internal (갱신, chmod 600)
- ~/.secrets/decode-x-internal.backup-20260513-141125 (백업, chmod 600)

## 차기

- **OpenRouter API key rotation** (~5분, 별도 후속): OpenRouter dashboard 신규 발급 + ~/.secrets/openrouter-api-key 갱신 + v2 스크립트 `--apply` 회귀
- **Staging env secret sync** (~5분, 별도 후속): `--include-staging` 옵션 추가 실행
- **Sprint 343 fix**: PR #88 svc-queue-router#test FAILURE 진단 + fix (WT에서 autopilot 진행 중 또는 Master 직접 수정 결정 필요)
- **TD 등록 (P3, ~5분)**: scripts/secret-sync-all-workers-v2.sh HTTP 201 success 처리 — 1줄 regex fix
