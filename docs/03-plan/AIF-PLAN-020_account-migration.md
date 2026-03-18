---
code: AIF-PLAN-020
title: 계정/인프라 이전 계획서
version: "1.0"
status: Draft
category: PLAN
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
req: AIF-REQ-020
---

# AIF-PLAN-020: 계정/인프라 이전 계획서

## Executive Summary

| 항목 | 내용 |
|------|------|
| **목적** | GitHub + Cloudflare 리소스를 개인 계정에서 회사 계정으로 이전 |
| **GitHub** | `sinclairseo@gmail.com` → `ktds.axbd@gmail.com` (KTDS-AXBD org) |
| **Cloudflare** | `sinclair.seo@gmail.com` → `ktds.axbd@gmail.com` |
| **DNS** | 개인 계정(sinclair.seo) 유지 — CNAME만 재설정 |
| **예상 다운타임** | 30분~1시간 (DNS 전파 제외) |
| **롤백** | 가능 — 개인 계정 리소스는 검증 완료 후 삭제 |

---

## 1. 현황 인벤토리

### 1.1 GitHub

| 항목 | 현재 | 비고 |
|------|------|------|
| **Repo** | `AX-BD-Team/res-ai-foundry` | 이미 회사 org 소속 |
| **Org** | KTDS-AXBD (GitHub org) | 개인 계정이 Owner로 참여 |
| **CI/CD Secrets** | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | 개인 계정 Cloudflare 기준 |
| **GitHub Actions** | 4 workflows (deploy-services, deploy-pages, health-check, set-secret) | |

> **판정**: GitHub repo 자체는 이전 불필요 (이미 org 소속). CI/CD secrets만 갱신.

### 1.2 Cloudflare 리소스

#### Workers (12개 서비스)

| # | 서비스 | Default | Staging | Production | Port |
|---|--------|---------|---------|------------|------|
| 1 | svc-ingestion | ✅ | ✅ `-staging` | ✅ `-production` | 8701 |
| 2 | svc-extraction | ✅ | ✅ | ✅ | 8702 |
| 3 | svc-policy | ✅ | ✅ | ✅ | 8703 |
| 4 | svc-ontology | ✅ | ✅ | ✅ | 8704 |
| 5 | svc-skill | ✅ | ✅ | ✅ | 8705 |
| 6 | svc-llm-router | ✅ | ✅ | ✅ | 8706 |
| 7 | svc-security | ✅ | ✅ | ✅ | 8707 |
| 8 | svc-governance | ✅ | ✅ | ✅ | 8708 |
| 9 | svc-notification | ✅ | ✅ | ✅ | 8709 |
| 10 | svc-analytics | ✅ | ✅ | ✅ | 8710 |
| 11 | svc-queue-router | ✅ | ✅ | ✅ | 8711 |
| 12 | svc-mcp-server | ✅ | ✅ | ✅ | 8712 |

#### D1 데이터베이스 (10개 × 2~3환경)

| DB | Default/Prod ID | Staging ID |
|----|-----------------|------------|
| db-ingestion | `5a17041a-...` | `27f0a859-...` |
| db-structure | `1f45eb0b-...` | `6b50dfe0-...` |
| db-policy | `e27a4335-...` | `63741d31-...` |
| db-ontology | `88cda338-...` | `3a1a3a3c-...` |
| db-skill | `a3f582ba-...` | `2166b6b5-...` |
| db-llm | `d50fc742-...` | `a0a12d5e-...` |
| db-security | `474a33f4-...` | `60ff69a8-...` |
| db-governance | `6b2a5531-...` | `9a593eea-...` |
| db-notification | `1a6ef6a4-...` | `e8a57ad8-...` |
| db-analytics | `fe12a186-...` | `1a2f1511-...` |

> **Note**: Default = Production (동일 ID). 총 20개 DB 인스턴스.

#### R2 Buckets (2개 × 2~3환경)

| Bucket | Default/Prod | Staging |
|--------|-------------|---------|
| ai-foundry-documents | ✅ | ai-foundry-documents-staging |
| ai-foundry-skill-packages | ✅ | ai-foundry-skill-packages-staging |

#### KV Namespaces (2개 × 3환경)

| KV | Default ID | Staging ID | Production ID |
|----|-----------|------------|---------------|
| KV_SKILL_CACHE | `b8ca68ae...` | `97b63e0e...` | `916333bc...` |
| KV_PROMPTS | `98ef7885...` | `91c72003...` | `98ef7885...` (=default) |

#### Queues (2개 × 2환경)

| Queue | Default/Prod | Staging |
|-------|-------------|---------|
| ai-foundry-pipeline | ✅ | ai-foundry-pipeline-staging |
| ai-foundry-pipeline-dlq | ✅ | ai-foundry-pipeline-staging-dlq |

#### Durable Objects (1개)

| DO Class | Service | 3환경 script_name 분리 |
|----------|---------|----------------------|
| HitlSession | svc-policy | ✅ |

#### Pages (1개)

| Project | URL | Custom Domain |
|---------|-----|---------------|
| ai-foundry-web | ai-foundry-web.pages.dev | ai-foundry.minu.best |

#### AI Gateway (1개)

| Gateway | Name |
|---------|------|
| AI Gateway | `ai-foundry` |

### 1.3 Secrets 인벤토리

| Secret | 사용 서비스 | 이전 방법 |
|--------|-----------|----------|
| `INTERNAL_API_SECRET` | 전체 (12개) | 새 값 생성 또는 기존 값 이전 |
| `ANTHROPIC_API_KEY` | svc-llm-router, svc-governance | 동일 API key 재사용 |
| `OPENAI_API_KEY` | svc-llm-router, svc-governance | 동일 API key 재사용 |
| `GOOGLE_AI_API_KEY` | svc-llm-router | 동일 API key 재사용 |
| `GOOGLE_API_KEY` | svc-governance | 동일 API key 재사용 |
| `CLOUDFLARE_AI_GATEWAY_URL` | svc-llm-router | 새 계정 AI Gateway URL |
| `JWT_SECRET` | svc-security | 새 값 생성 |
| `UNSTRUCTURED_API_KEY` | svc-ingestion | 동일 key 재사용 |
| `NEO4J_URI` | svc-ontology | 동일 (외부 서비스) |
| `NEO4J_USERNAME` | svc-ontology | 동일 |
| `NEO4J_PASSWORD` | svc-ontology | 동일 |
| `NEO4J_DATABASE` | svc-ontology | 동일 |
| `SLACK_WEBHOOK_URL` | svc-notification (optional) | 동일 |

### 1.4 DNS

| 도메인 | 레코드 | 현재 대상 | 이전 후 |
|--------|--------|----------|---------|
| ai-foundry.minu.best | CNAME | ai-foundry-web.pages.dev | 새 계정 Pages URL |

---

## 2. 이전 전략

### 2.1 원칙

1. **Blue-Green 방식**: 새 계정에 전체 구축 → 검증 → DNS 전환 → 구 계정 정리
2. **데이터 우선**: D1 production 데이터 export → import (policies 3,675, skills 3,924 등)
3. **DNS 최후**: 모든 검증 완료 후 DNS CNAME 변경 (최소 다운타임)
4. **롤백 가능**: 구 계정 리소스는 최소 1주 유지

### 2.2 이전 순서

```
Phase 0: 사전 준비 (30분)
  └─ 회사 계정 Cloudflare 로그인 확인 + API Token 생성
  └─ D1 production 데이터 export

Phase 1: 리소스 프로비저닝 (1시간)
  └─ D1 ×20, R2 ×4, Queue ×4, KV ×6 생성
  └─ AI Gateway 생성
  └─ Pages 프로젝트 생성

Phase 2: 코드 업데이트 (30분)
  └─ wrangler.toml ×12 리소스 ID 교체
  └─ CI/CD secrets 갱신

Phase 3: 배포 + Secrets 설정 (1시간)
  └─ Workers ×12 배포 (staging → production)
  └─ Secrets ×30+ 설정
  └─ D1 migrations 적용
  └─ D1 데이터 import

Phase 4: 검증 (30분)
  └─ Health check 12/12
  └─ E2E pipeline 테스트
  └─ Pages 접속 확인

Phase 5: DNS 전환 + 정리 (10분 + DNS 전파)
  └─ CNAME 변경
  └─ 구 계정 리소스 정리 (1주 후)
```

---

## 3. 상세 절차

### Phase 0: 사전 준비

#### 0-1. 회사 Cloudflare 계정 확인

```bash
# 회사 계정으로 wrangler 로그인
npx wrangler login
# 계정 목록 확인
npx wrangler whoami
```

> 회사 계정 ID를 확인하고 기록: `CLOUDFLARE_ACCOUNT_ID_NEW=______`

#### 0-2. API Token 생성

회사 계정 Cloudflare Dashboard → My Profile → API Tokens:
- **Template**: Edit Cloudflare Workers
- **Permissions**: Account/Workers Scripts/Edit, Account/D1/Edit, Account/R2/Edit, Account/Queues/Edit, Account/Workers KV/Edit, Zone/Workers Routes/Edit
- 생성된 토큰 기록: `CLOUDFLARE_API_TOKEN_NEW=______`

#### 0-3. D1 Production 데이터 Export

```bash
# 각 DB의 production 데이터 export
for DB in db-ingestion db-structure db-policy db-ontology db-skill \
          db-llm db-security db-governance db-notification db-analytics; do
  echo "=== Exporting $DB ==="
  npx wrangler d1 export "$DB" --remote --output="backup/${DB}.sql"
done
```

#### 0-4. R2 데이터 백업

```bash
# R2 버킷 내용 목록화
npx wrangler r2 object list ai-foundry-documents > backup/r2-documents-list.json
npx wrangler r2 object list ai-foundry-skill-packages > backup/r2-skill-packages-list.json
```

> R2는 Cloudflare 계정 간 직접 이전 불가 — wrangler r2 object get/put로 개별 파일 이전 필요.
> 파일 수가 많으면 스크립트로 자동화.

### Phase 1: 리소스 프로비저닝

#### 1-1. D1 데이터베이스 생성 (20개)

```bash
export CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN_NEW
export CLOUDFLARE_ACCOUNT_ID=$CLOUDFLARE_ACCOUNT_ID_NEW

# Production/Default (10개)
for DB in db-ingestion db-structure db-policy db-ontology db-skill \
          db-llm db-security db-governance db-notification db-analytics; do
  npx wrangler d1 create "$DB"
done

# Staging (10개)
for DB in db-ingestion db-structure db-policy db-ontology db-skill \
          db-llm db-security db-governance db-notification db-analytics; do
  npx wrangler d1 create "${DB}-staging"
done
```

> 생성된 각 database_id를 기록 → Phase 2에서 wrangler.toml에 반영.

#### 1-2. R2 Buckets 생성 (4개)

```bash
npx wrangler r2 bucket create ai-foundry-documents
npx wrangler r2 bucket create ai-foundry-documents-staging
npx wrangler r2 bucket create ai-foundry-skill-packages
npx wrangler r2 bucket create ai-foundry-skill-packages-staging
```

#### 1-3. KV Namespaces 생성 (6개)

```bash
# KV_SKILL_CACHE (3환경)
npx wrangler kv namespace create "AI_FOUNDRY_SKILL_CACHE"
npx wrangler kv namespace create "AI_FOUNDRY_SKILL_CACHE" --preview  # staging
npx wrangler kv namespace create "AI_FOUNDRY_SKILL_CACHE_PROD"

# KV_PROMPTS (3환경)
npx wrangler kv namespace create "AI_FOUNDRY_PROMPTS"
npx wrangler kv namespace create "AI_FOUNDRY_PROMPTS" --preview  # staging
npx wrangler kv namespace create "AI_FOUNDRY_PROMPTS_PROD"
```

> 생성된 각 namespace ID를 기록.

#### 1-4. Queues 생성 (4개)

```bash
npx wrangler queues create ai-foundry-pipeline
npx wrangler queues create ai-foundry-pipeline-dlq
npx wrangler queues create ai-foundry-pipeline-staging
npx wrangler queues create ai-foundry-pipeline-staging-dlq
```

#### 1-5. AI Gateway 생성

Cloudflare Dashboard → AI → AI Gateway → Create gateway:
- Name: `ai-foundry`
- Authentication: Off (개발 중)

> Gateway URL 기록: `CLOUDFLARE_AI_GATEWAY_URL_NEW=______`

#### 1-6. Pages 프로젝트 생성

```bash
# Pages 프로젝트 연결 (GitHub repo 연결)
npx wrangler pages project create ai-foundry-web
```

### Phase 2: 코드 업데이트

#### 2-1. wrangler.toml 리소스 ID 교체

12개 서비스의 wrangler.toml에서 다음을 교체:
- `database_id` (D1) — 20개 값
- KV `id` — 6개 값
- Worker 이름(service binding)은 변경 불필요 (동일 이름 사용)
- R2 bucket_name도 변경 불필요 (동일 이름 사용)
- Queue 이름도 변경 불필요 (동일 이름 사용)

> **자동화 스크립트**로 일괄 교체 권장 (sed 또는 Claude 지원).

#### 2-2. Workers URL 패턴 확인

기존: `*.sinclair-account.workers.dev`
신규: `*.ktds-axbd.workers.dev` (회사 계정 subdomain에 따라 다름)

> SPEC.md §5의 서비스 URL도 갱신 필요.

#### 2-3. GitHub CI/CD Secrets 갱신

GitHub repo Settings → Secrets and variables → Actions:

| Secret | 조치 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | 회사 계정 API Token으로 교체 |
| `CLOUDFLARE_ACCOUNT_ID` | 회사 계정 ID로 교체 |

### Phase 3: 배포 + Secrets + 데이터

#### 3-1. D1 Migrations 적용

```bash
export CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN_NEW

# 각 서비스별 마이그레이션 적용
for SVC_DIR in services/svc-*; do
  SVC=$(basename "$SVC_DIR")
  echo "=== Migrating $SVC ==="
  (cd "$SVC_DIR" && npx wrangler d1 migrations apply --remote 2>/dev/null || true)
  (cd "$SVC_DIR" && npx wrangler d1 migrations apply --remote --env staging 2>/dev/null || true)
  (cd "$SVC_DIR" && npx wrangler d1 migrations apply --remote --env production 2>/dev/null || true)
done
```

#### 3-2. D1 데이터 Import

```bash
# Production 데이터 복원 (Phase 0에서 export한 SQL)
for DB in db-ingestion db-structure db-policy db-ontology db-skill \
          db-llm db-security db-governance db-notification db-analytics; do
  echo "=== Importing $DB ==="
  npx wrangler d1 execute "$DB" --remote --file="backup/${DB}.sql"
done
```

> `--file` 방식이 OAuth 에러 날 경우, `--command` 인라인으로 분할 실행.

#### 3-3. R2 데이터 이전

```bash
# 스크립트로 R2 오브젝트 이전 (별도 마이그레이션 스크립트 작성)
# 개인 계정에서 get → 회사 계정에서 put
node scripts/migrate-r2.js
```

#### 3-4. Workers 배포

```bash
export CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN_NEW

# Staging 배포
for SVC_DIR in services/svc-*; do
  SVC=$(basename "$SVC_DIR")
  echo "=== Deploying $SVC (staging) ==="
  (cd "$SVC_DIR" && npx wrangler deploy --env staging)
done

# Production 배포
for SVC_DIR in services/svc-*; do
  SVC=$(basename "$SVC_DIR")
  echo "=== Deploying $SVC (production) ==="
  (cd "$SVC_DIR" && npx wrangler deploy --env production)
  # Default env도 배포 (svc-queue-router 제외)
  if [ "$SVC" != "svc-queue-router" ]; then
    (cd "$SVC_DIR" && npx wrangler deploy)
  fi
done
```

#### 3-5. Secrets 설정

```bash
# INTERNAL_API_SECRET (전체 12개 × 3환경)
for SVC_DIR in services/svc-*; do
  SVC=$(basename "$SVC_DIR")
  (cd "$SVC_DIR" && printf 'NEW_SECRET_VALUE' | npx wrangler secret put INTERNAL_API_SECRET)
  (cd "$SVC_DIR" && printf 'NEW_SECRET_VALUE' | npx wrangler secret put INTERNAL_API_SECRET --env staging)
  (cd "$SVC_DIR" && printf 'NEW_SECRET_VALUE' | npx wrangler secret put INTERNAL_API_SECRET --env production)
done

# 서비스별 고유 Secrets
cd services/svc-llm-router
printf 'sk-ant-...' | npx wrangler secret put ANTHROPIC_API_KEY
printf 'sk-...' | npx wrangler secret put OPENAI_API_KEY
printf 'AI...' | npx wrangler secret put GOOGLE_AI_API_KEY
printf 'https://gateway.ai.cloudflare.com/v1/...' | npx wrangler secret put CLOUDFLARE_AI_GATEWAY_URL
# staging/production 환경에도 동일하게 반복

cd ../svc-security
printf 'NEW_JWT_SECRET' | npx wrangler secret put JWT_SECRET

cd ../svc-ingestion
printf '...' | npx wrangler secret put UNSTRUCTURED_API_KEY

cd ../svc-ontology
printf '...' | npx wrangler secret put NEO4J_URI
printf '...' | npx wrangler secret put NEO4J_USERNAME
printf '...' | npx wrangler secret put NEO4J_PASSWORD
printf '...' | npx wrangler secret put NEO4J_DATABASE
```

#### 3-6. Pages 배포

```bash
cd apps/app-web
bun install && bun run build
npx wrangler pages deploy dist --project-name=ai-foundry-web --branch=main
```

### Phase 4: 검증

#### 4-1. Health Check

```bash
# 새 계정의 Workers URL 패턴으로 확인
for SVC in svc-ingestion svc-extraction svc-policy svc-ontology svc-skill \
           svc-llm-router svc-security svc-governance svc-notification \
           svc-analytics svc-queue-router svc-mcp-server; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://${SVC}.NEW-SUBDOMAIN.workers.dev/health")
  echo "${SVC}: HTTP ${STATUS}"
done
```

#### 4-2. E2E Pipeline 테스트

```bash
# Staging 환경에서 E2E 테스트
bash scripts/test-e2e-pipeline.sh --staging
```

#### 4-3. Pages 접속 확인

- `https://ai-foundry-web.pages.dev` 접속
- 로그인 → 대시보드 → 데이터 확인

#### 4-4. Production 데이터 정합성

```bash
# 주요 테이블 레코드 수 비교 (구 계정 vs 신 계정)
# policies, skills, terms, documents 등
```

### Phase 5: DNS 전환 + 정리

#### 5-1. DNS CNAME 변경

개인 계정 Cloudflare Dashboard → DNS → ai-foundry.minu.best:
- CNAME 대상을 새 Pages URL로 변경

또는 새 계정 Pages에 Custom Domain 설정:
- Pages → ai-foundry-web → Custom domains → Add `ai-foundry.minu.best`
- 개인 계정 DNS에서 CNAME 조정

#### 5-2. SPEC.md / CLAUDE.md 갱신

- Workers URL 패턴 업데이트
- CLOUDFLARE_ACCOUNT_ID 참조 업데이트
- 커스텀 도메인 확인

#### 5-3. 구 계정 리소스 정리 (1주 후)

검증 완료 확인 후:
```bash
# Workers 삭제
# D1 삭제
# R2 버킷 삭제
# KV 삭제
# Queue 삭제
```

---

## 4. 리스크 & 완화

| 리스크 | 영향 | 완화 |
|--------|------|------|
| D1 export/import 실패 | 데이터 유실 | SQL export 파일 검증 + 레코드 수 비교 |
| R2 대용량 파일 이전 지연 | 이전 시간 초과 | 병렬 이전 스크립트 + 우선순위 파일만 먼저 |
| DNS 전파 지연 | 일시적 접속 불가 | TTL 사전 단축 (300s) |
| Secret 누락 | 런타임 에러 | `/secrets-check` 스킬로 전수 검증 |
| 구 계정 리소스 조기 삭제 | 롤백 불가 | 최소 1주 유지 정책 |
| Durable Object 데이터 | 진행중 HITL 세션 유실 | 이전 전 모든 HITL 세션 완료 확인 |
| AI Gateway 설정 차이 | LLM 호출 실패 | Gateway URL 사전 확인 + 테스트 |

---

## 5. 롤백 계획

이전 중 문제 발생 시:
1. wrangler.toml을 git revert로 원복
2. CI/CD secrets를 개인 계정 값으로 복원
3. DNS CNAME 원복 (이미 변경한 경우)
4. 구 계정 서비스는 그대로 유지되어 즉시 복구 가능

---

## 6. 체크리스트

### Pre-Migration
- [ ] 회사 Cloudflare 계정 로그인 확인
- [ ] 회사 계정 API Token 생성 (Workers/D1/R2/Queue/KV 권한)
- [ ] D1 ×10 production export 완료
- [ ] R2 파일 목록 확인
- [ ] 진행중 HITL 세션 없음 확인
- [ ] DNS TTL 300s로 단축

### Resource Provisioning
- [ ] D1 ×20 생성 (prod 10 + staging 10)
- [ ] R2 ×4 생성
- [ ] KV ×6 생성
- [ ] Queue ×4 생성
- [ ] AI Gateway 생성
- [ ] Pages 프로젝트 생성

### Code Update
- [ ] wrangler.toml ×12 database_id 교체 (20개 값)
- [ ] wrangler.toml ×3 KV id 교체 (6개 값)
- [ ] GitHub secrets 갱신 (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID)

### Deploy & Data
- [ ] D1 migrations 적용 (20개 DB)
- [ ] D1 production 데이터 import (10개 DB)
- [ ] R2 파일 이전 (documents + skill-packages)
- [ ] Workers ×12 배포 (staging + production + default)
- [ ] Secrets 설정 (30+ 값)
- [ ] Pages 배포

### Verification
- [ ] Health check 12/12 PASS
- [ ] E2E pipeline 테스트 PASS
- [ ] Pages 접속 + 데이터 확인
- [ ] Production 데이터 정합성 확인

### Post-Migration
- [ ] DNS CNAME 변경
- [ ] SPEC.md Workers URL 갱신
- [ ] CLAUDE.md 갱신
- [ ] MEMORY.md 갱신
- [ ] 구 계정 리소스 정리 (1주 후)
