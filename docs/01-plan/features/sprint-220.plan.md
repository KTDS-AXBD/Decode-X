---
id: PLAN-220
title: Sprint 220 — CI D1 Migration Workflow 자동화 (F366)
sprint: 220
f_items: [F366]
status: planned
created: 2026-04-21
---

# Sprint 220 Plan — F366 CI D1 Migration Workflow

## Goal

TD-35(Staging 방치) + TD-38(production 수동 적용 반복) 해소.
`wrangler d1 migrations apply` 기반으로 5개 D1 DB migration을 CI/CD에서 자동 적용한다.

## Scope

| 항목 | 내용 |
|------|------|
| F366 | CI D1 migration workflow 자동화 |
| TD-35 | Staging 환경 방치 (db-skill-staging skills 테이블 없음) |
| TD-38 | production migration 수동 적용 반복 |

## Out of Scope

- F356-B (AI-Ready 전수 배치) → Sprint 221+
- F357 (AgentResume 실구현) → Sprint 221+

## Deliverables

1. `wrangler.toml` migrations_dir 설정 (5 서비스)
2. `scripts/db-init-staging.sh` — staging 전체 초기화
3. `scripts/check-migration-drift.sh` — drift 감지
4. `deploy-services.yml` — migrate-d1 job 추가
5. `ci.yml` — PR migration drift check

## Success Criteria

- [ ] staging svc-skill `/skills/from-spec-container` 200 응답
- [ ] db-skill-staging `skills` 테이블 존재
- [ ] PR CI에서 migration drift 감지 가능
- [ ] main push 시 staging migration 자동 적용

## Risk

- wrangler `migrations_dir` 경로: service dir 기준 상대경로 `../../infra/migrations/db-xxx`
- svc-skill local migrations (`services/svc-skill/migrations/`) 충돌 → infra/db-skill/로 통합
