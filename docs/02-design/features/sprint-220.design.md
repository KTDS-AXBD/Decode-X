---
id: DESIGN-220
title: Sprint 220 Design — CI D1 Migration Workflow (F366)
sprint: 220
f_items: [F366]
status: approved
created: 2026-04-21
---

# Sprint 220 Design — F366 CI D1 Migration Workflow

## §1 Problem Statement

현재 migration 적용 방식:
- `wrangler d1 execute --file=...` 수동 실행 (CI 없음)
- `d1_migrations` 테이블 미기록 → drift 감지 불가
- TD-35: db-skill-staging skills 테이블 없음 (0001_init.sql 미적용)
- TD-38: 0006 production만 누락 (선택적 수동 적용 실수)

## §2 Solution Architecture

```
PR push → [ci.yml] migration drift check (파일 순번 검증)
main push → [deploy-services.yml] migrate-staging job → staging D1 자동 적용
release tag → [deploy-services.yml] migrate-production job (manual approval)
```

## §3 Migration System Design

### wrangler d1 migrations apply 활성화

각 서비스 wrangler.toml의 `[[d1_databases]]`에 `migrations_dir` 추가:

| 서비스 | migrations_dir |
|--------|---------------|
| svc-ingestion | `../../infra/migrations/db-ingestion` |
| svc-extraction | `../../infra/migrations/db-structure` |
| svc-policy | `../../infra/migrations/db-policy` |
| svc-ontology | `../../infra/migrations/db-ontology` |
| svc-skill | `../../infra/migrations/db-skill` |

`services/svc-skill/migrations/0003_policy_classifications.sql` →
`infra/migrations/db-skill/0010_policy_classifications.sql` 로 통합 (충돌 해소)

### 적용 명령

```bash
# staging
cd services/svc-xxx && wrangler d1 migrations apply DB_XXX --env staging

# production (manual approval required)
cd services/svc-xxx && wrangler d1 migrations apply DB_XXX --env production
```

## §4 File Mapping

### 수정 파일

1. `services/svc-ingestion/wrangler.toml` — migrations_dir 추가
2. `services/svc-extraction/wrangler.toml` — migrations_dir 추가
3. `services/svc-policy/wrangler.toml` — migrations_dir 추가
4. `services/svc-ontology/wrangler.toml` — migrations_dir 추가
5. `services/svc-skill/wrangler.toml` — migrations_dir 추가
6. `.github/workflows/deploy-services.yml` — migrate-staging, migrate-production job 추가
7. `.github/workflows/ci.yml` — migration drift check step 추가

### 신규 파일

8. `scripts/db-init-staging.sh` — staging 5개 DB 일괄 초기화
9. `scripts/check-migration-drift.sh` — local 파일 순번 검증

### 이동 파일

10. `services/svc-skill/migrations/0003_policy_classifications.sql` →
    `infra/migrations/db-skill/0010_policy_classifications.sql`

## §5 CI/CD Flow Design

### ci.yml — PR Migration Drift Check

```yaml
- name: Check migration sequence
  run: bash scripts/check-migration-drift.sh
```

`check-migration-drift.sh` 검증 항목:
- 각 DB의 migration 파일이 `NNNN_*.sql` 형식인지 확인
- 번호가 0001부터 연속적인지 확인 (갭 없음)
- 동일 번호 중복 없음

### deploy-services.yml — migrate-staging job

```yaml
migrate-staging:
  needs: [prepare, typecheck]
  if: needs.prepare.outputs.environment == 'staging' || github.event_name == 'push'
  environment: staging
  steps:
    - wrangler d1 migrations apply (5 DBs)
```

### deploy-services.yml — migrate-production job

```yaml
migrate-production:
  needs: [prepare, typecheck]
  if: needs.prepare.outputs.environment == 'production'
  environment: production  # manual approval via GitHub environment protection
  steps:
    - wrangler d1 migrations apply (5 DBs)
```

### scripts/db-init-staging.sh

```bash
# 5개 staging DB에 대해 wrangler d1 migrations apply 실행
# 기존에 이미 적용된 건 자동 스킵 (wrangler가 d1_migrations 테이블 확인)
```

## §6 Success Criteria Mapping

| 기준 | 구현 |
|------|------|
| staging skills 테이블 존재 | db-init-staging.sh 또는 migrate-staging job |
| `/skills/from-spec-container` 200 응답 | staging migration 완료 후 svc-skill 배포 |
| PR CI drift 감지 | check-migration-drift.sh |

## §7 TDD

해당 없음 (CI 스크립트 + YAML — 단위 테스트 면제 대상)
