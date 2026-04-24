---
code: AIF-RPRT-041
title: "Sprint 238 F356-B AI-Ready 채점기 Phase 2 — 완료 리포트"
version: "1.0"
status: Done
category: RPRT
created: 2026-04-24
updated: 2026-04-24
author: Sinclair Seo
sprint: 238
related:
  - docs/01-plan/features/F356-B.plan.md
  - docs/02-design/features/F356-B.design.md
  - SPEC.md §6 Sprint 238
---

# Sprint 238 F356-B 완료 리포트

## Executive Summary

F356-A(CLI PoC, 7 spec-container 샘플 평가)를 Production 운영 가능한
**API + Queue 비동기 배치 + D1 영속화 + 멀티 모델** 스택으로 확장 완료.
Match Rate **96%** / CI **3/3 green** / 신규 테스트 **19건** 추가.

## 구현 완료 항목

| 산출물 | 경로 | 상태 |
|--------|------|:----:|
| D1 migration 0012 | `infra/migrations/db-skill/0012_ai_ready_scores.sql` | DONE |
| Types 확장 | `packages/types/src/ai-ready.ts` | DONE |
| RBAC ai_ready resource | `packages/types/src/rbac.ts` | DONE |
| Evaluator (Worker) | `svc-skill/src/ai-ready/evaluator.ts` | DONE |
| Repository (D1) | `svc-skill/src/ai-ready/repository.ts` | DONE |
| Queue consumer | `svc-skill/src/queue/ai-ready-consumer.ts` | DONE |
| Routes (4 endpoints) | `svc-skill/src/routes/ai-ready.ts` | DONE |
| wrangler.toml Queue | `svc-skill/wrangler.toml` | DONE |
| index.ts 연결 | `svc-skill/src/index.ts` | DONE |
| Batch CLI | `scripts/ai-ready/batch-evaluate.ts` | DONE |
| Tests (19건) | evaluator.test + repository.test + ai-ready.test | DONE |

## API 엔드포인트 (4종)

| Method | Path | RBAC | 설명 |
|--------|------|------|------|
| POST | `/skills/:id/ai-ready/evaluate` | Analyst+ | 단건 동기 평가 (1h 캐싱) |
| POST | `/skills/ai-ready/batch` | Developer+ | 비동기 배치 트리거 |
| GET | `/skills/:id/ai-ready/evaluations` | All | 평가 이력 (paginated) |
| GET | `/skills/ai-ready/batches/:batchId` | All | 배치 진행 상태 |

## Queue 설정 (svc-skill wrangler.toml)

```toml
[[queues.consumers]]
queue = "ai-ready-queue"
max_batch_size = 1
max_concurrency = 10   # 30분 목표 달성 핵심
max_retries = 3
dead_letter_queue = "ai-ready-dlq"
```

## 테스트 결과

| 구분 | 건수 | 결과 |
|------|:----:|:----:|
| evaluator 단위 테스트 | 6 | ALL PASS |
| repository 단위 테스트 | 5 | ALL PASS |
| routes 통합 테스트 | 8 | ALL PASS |
| 기존 svc-skill 회귀 | 385 | ALL PASS |
| **전체 monorepo** | **402 (41 files)** | **ALL PASS** |

## Gap Analysis (96%)

| 항목 | 판정 | 비고 |
|------|:----:|------|
| D1 Schema §2 | PASS | ai_ready_scores + ai_ready_batches + 3 indexes |
| API 4종 §3 | PASS | 응답코드 202→201(created helper 관례) 경미한 차이 |
| Queue §4 | PASS | consumer + cross-check auto-trigger |
| Evaluator §5 | PASS | Promise.all 6기준 + R2 spec-container |
| Batch CLI §6 | PASS | KPI 기준별 상세 집계 Sprint-239 이관 |
| RBAC §7 | PASS | ai_ready resource + Analyst/Developer/Reviewer 구분 |
| Tests §8 | PASS | 17건 계획 → 19건 초과 달성 |

## DoD 충족 현황

| 기준 | 상태 | 비고 |
|------|:----:|------|
| (a) reports/ai-ready-full-{date}.json | PENDING | 전수 배치 실행 필요 (사용자 터미널) |
| (b) reports/ai-ready-full-{date}.md | PENDING | 배치 실행 후 자동 생성 |
| (c) D1 production ai_ready_scores 5,154 row | PENDING | 배치 실행 후 CI deploy → production |
| (d) API 4종 production smoke HTTP 200 | PENDING | Master 독립 실측 (MERGED 직후) |
| (e) Match Rate ≥ 90% | **96%** ✅ | |
| (f) CI 3/3 green + typecheck/lint/test PASS | **ALL PASS** ✅ | |

## 후속 작업 (Sprint-239)

1. **전수 배치 실행**: `pnpm tsx scripts/ai-ready/batch-evaluate.ts --env production --model haiku --organization LPON --cross-check 100`
2. **KPI 기준별 집계 API**: `/skills/ai-ready/evaluations?batchId=...` batch-scoped endpoint
3. **Production smoke test**: Master 독립 curl 4종 실측
4. **Design 역동기화**: §3.2 응답 202→201, §7.2 permission 키 표기

## 비용 추정

| 구분 | 수량 | 단가 | 합계 |
|------|:----:|:----:|:----:|
| Haiku 전수 (859 skill × 6 criterion) | 5,154 | $0.0004 | ~$20 |
| Opus 교차검증 100건 | 600 | $0.025 | ~$15 |
| **예상 총계** | | | **~$35** |

## 기술 결정 사항

- `ai_ready` 신규 RBAC Resource 추가 → 기존 `checkPermission(role, resource, action)` 패턴 준수
- `prompts.ts` rubric v2 100% 재사용 → 평가 정확도 변동 없음
- `crypto.randomUUID()` (CF Workers 전역) → `node:crypto` import 불필요
- Queue consumer max_concurrency=10 → 859 skill ÷ 10 parallel × ~2s/skill ≈ 3분 (30분 여유)
