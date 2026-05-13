---
id: AIF-RPRT-051
title: Staging env secret sync (`--include-staging`)
type: report
status: published
session: 303
date: 2026-05-13
author: Sinclair Seo
---

# Staging env secret sync ✅ DONE — F490 후속 + OpenRouter rotation 후속

## 개요

Sprint 344/345 + OpenRouter rotation은 default + production env만 처리. Staging env는 별도 분리됐고, 본 follow-up으로 일괄 sync.

**Scope**: 신규 정본(INTERNAL_API_SECRET S345 + OPENROUTER_API_KEY rotation 결과 + CF_AI_GW)을 7-worker × staging env에 적용.

## 결과 (성공)

| 항목 | 값 |
|------|----|
| 적용 ops | 45 (worker × secret × 3 env: default + production + staging) |
| 신규 staging ops | 15 (7-worker × 3 secret 분포에 따라) |
| HTTP 200 | 45/45 (모두 update — staging 포함 기존 존재) |
| HTTP 201 (Created) | 0 |
| 실 실패 | 0 |
| 7-worker staging `/health` | 7/7 HTTP 200 ✅ (10s propagation 후) |
| 소요 | ~3분 |

### 15 staging ops 분포

| Worker | INTERNAL_API_SECRET | OPENROUTER_API_KEY | CLOUDFLARE_AI_GATEWAY_URL |
|--------|:--:|:--:|:--:|
| svc-ingestion | 1 | — | — |
| svc-extraction | 1 | 1 | 1 |
| svc-policy | 1 | 1 | 1 |
| svc-ontology | 1 | 1 | 1 |
| svc-skill | 1 | 1 | 1 |
| svc-queue-router | 1 | — | — |
| svc-mcp-server | 1 | — | — |
| **합계** | **7** | **4** | **4** |
| **총** | | | **15** |

### Staging /health verify

```
svc-ingestion-staging /health = HTTP 200
svc-extraction-staging /health = HTTP 200
svc-policy-staging /health = HTTP 200
svc-ontology-staging /health = HTTP 200
svc-skill-staging /health = HTTP 200
svc-queue-router-staging /health = HTTP 200
svc-mcp-server-staging /health = HTTP 200
```

**의미**: staging worker boot 정상 — 신규 secret이 staging env에 정합 적용.

## 메타 학습

### 발견 1: Staging env Worker name 매핑 검증

CF API REST PUT 시 worker name = `svc-{X}-staging` 패턴. wrangler env `staging` 매핑이 정상 동작 (Sprint 341 학습한 mapping function 일반화).

### 발견 2: F490 운영 3-env 정합 완결

| Env | INTERNAL_API_SECRET | OPENROUTER_API_KEY |
|-----|:--:|:--:|
| default | ✅ S345 진짜 rotation | ✅ OpenRouter dashboard 신규 |
| production | ✅ S345 진짜 rotation | ✅ OpenRouter dashboard 신규 |
| **staging** | ✅ 본 sync | ✅ 본 sync |

F490 운영 작업 (sync + rotation + 3-env) 완전 정합. rules/development-workflow.md "Worker Secret Store env-scoped divergence" **7회차 적용** (S246→S260→S341→S342→S344→S345→**S303 staging**).

### 발견 3: v2 스크립트 idempotent 5회 연속 입증

스크립트 안정성: Sprint 341 (svc-ingestion 2 ops) → Sprint 342 (v2 패치) → Sprint 344 (28 ops) → Sprint 345 (INTERNAL_API_SECRET rotation 30 ops) → OpenRouter rotation (30 ops) → **본 staging sync (45 ops)**. 5회 누적 안정 동작.

## 산출물

- production secret store 45 ops PUT (CF API REST)
- 본 reports

## 차기 후속 (잔재)

- v2 스크립트 HTTP 201 success 1줄 fix (P3 TD)
- CLAUDE.md "Worker Secret Store §Rotation" verify 패턴 F514 이후 갱신
- svc-extraction/policy/ontology `.dev.vars` OPENROUTER 추가 검토 (local dev LLM 활성화)
- 53번째 신규 산업 (PB/TX/AD)
