---
name: AIF-RPRT-122 — Sprint 339 F490 Secret Rotation 7-worker 자동화 (scope 축소 dry-run only)
description: scripts/secret-sync-all-workers.sh 신설 + dry-run 검증 + 차기 세션 실 rotation 절차 명시
category: report
project: Decode-X
sprint: 339
fItem: F490
created: 2026-05-12
updated: 2026-05-12
author: Sinclair Seo
status: DONE
---

# Sprint 339 F490 — Secret Rotation 7-worker 자동화 (dry-run only)

## 1. 배경

**S246 + S260 + S268 누적 교훈** — `wrangler <name>` (default env) vs `<name>-production` (--env production) vs `<name>-staging` (--env staging)이 별개 secret store. rotation 시 한쪽만 갱신하면 silent fail 발생.

기존 `scripts/secret-sync-svc-skill.sh`는 svc-skill 단일 worker용. **F490은 7 worker 전체 확장**.

세션 295 F490 사전 등록 후 5 세션 미진입. Sprint 339에서 정식 할당 + dry-run only scope 축소 진행 (S300 사용자 결정 — 실 rotation은 차기 세션 신중 진행).

## 2. 산출물

**`scripts/secret-sync-all-workers.sh`** (~210 lines) — 7 worker 일괄 자동화 스크립트.

핵심 기능:
- **Worker × Secret 매핑**: 7 worker 별 사용 secret 명시 (LLM 사용 5 워커는 3 secret, 비 LLM 2 워커는 INTERNAL_API_SECRET만)
- **real HOME 자동 감지**: `getent passwd $USER` + `AX_TARGET_HOME` / `SECRETS_DIR` env var override (CLAUDE.md `.claude-work` 환경 대응 패턴 적용)
- **정본 파일 검증**: chmod 600 + size + CLOUDFLARE_AI_GATEWAY_URL full path 형식 (`/openrouter/v1/chat/completions` suffix)
- **dry-run / --apply 분리**: dry-run 기본, --apply 시 사용자 confirm prompt (실 production rotation 안전성)
- **종료 코드 정의**: 0=성공, 1=설정 오류, 2=secret 미존재, 3=wrangler put 실패

## 3. 실행 계획 (dry-run 검증)

**대상**: 7 worker × secret × 2 env (default + production) = 30건

| Worker | Secrets | × env | Ops |
|--------|---------|:-----:|:---:|
| svc-ingestion | INTERNAL_API_SECRET | 2 | 2 |
| svc-extraction | INTERNAL_API_SECRET + OPENROUTER_API_KEY + CLOUDFLARE_AI_GATEWAY_URL | 2 | 6 |
| svc-policy | (same) | 2 | 6 |
| svc-ontology | (same) | 2 | 6 |
| svc-skill | (same) | 2 | 6 |
| svc-queue-router | INTERNAL_API_SECRET | 2 | 2 |
| svc-mcp-server | INTERNAL_API_SECRET | 2 | 2 |
| **합계** | | | **30** |

`--include-staging` 추가 시: 30 + 15 (staging env 추가 7+5+5+5+5+1+1 → 5+15=20... 실제 +7+5×... — staging 추가 시 같은 패턴 1배수 → +15건 = 45건 total).

## 4. dry-run 실측 결과

```
▶ secret-sync-all-workers.sh (apply=false, envs=default production)

▶ 정본 파일 점검 (/home/sinclair/.secrets)
  ✅ CLOUDFLARE_AI_GATEWAY_URL (chmod 600, size=110)
  ✅ INTERNAL_API_SECRET (chmod 600, size=64)
  ✅ OPENROUTER_API_KEY (chmod 600, size=73)

▶ Worker 디렉토리 점검
  ✅ services/svc-ingestion ~ services/svc-mcp-server (7/7)

▶ 실행 계획: 총 30건 (7개 worker × secrets × 2 env)
💡 dry-run 종료. 실제 적용은 --apply 추가 (S339 scope에서는 차기 세션 권장)
```

## 5. 차기 세션 실 rotation 절차 (3-step)

**S339 Sprint scope 외 차기 세션 권장 절차** — secret rotation은 production downtime 위험 + 양 env 동기화 신중성 요구.

### Step 1: 단일 worker 검증 (~10분)
```bash
bash scripts/secret-sync-svc-skill.sh --apply --verify
```
- svc-skill default + production env 양쪽 갱신
- 실 API path verify (`POST /skills/{id}/ai-ready/evaluate?force=true`)
- HTTP 200 + LLM 응답 정상 확인

### Step 2: 전체 dry-run 재확인 (~1분)
```bash
bash scripts/secret-sync-all-workers.sh
```
- 30건 실행 계획 + 정본 파일 + worker 디렉토리 검증

### Step 3: 전체 적용 + 단계적 verify (~30분)
```bash
bash scripts/secret-sync-all-workers.sh --apply
# (confirm prompt에 "yes" 입력)
```
- 7 worker × 30건 일괄 적용
- 각 worker 단건 verify (실 API path 호출, /health 불가 — S245 교훈)

## 6. DoD 6/6 PASS

- [x] scripts/secret-sync-all-workers.sh 신설 (~210 lines) ✅
- [x] real HOME 자동 감지 (getent + env var override) ✅
- [x] dry-run 30건 실행 계획 + 정본 검증 PASS ✅
- [x] --apply 모드 + 사용자 confirm prompt + 단계적 적용 권고 명시 ✅
- [x] 차기 세션 3-step 절차 명시 (단일 검증 → dry-run → 전체 적용) ✅
- [x] reports/sprint-339-secret-rotation-2026-05-12.md (AIF-RPRT-122) 작성 ✅

## 7. 메타 학습 3종

1. **scope 축소 결정 가치**: 사전 등록 시 ~3h 추정이었던 F490을 dry-run only로 축소(~1h) → 신중성 확보 + 세션 시간 제약 대응. 실 rotation은 신중성이 효율성보다 우선.

2. **real HOME 자동 감지 패턴 정착**: CLAUDE.md `.claude-work` HOME 환경 차이 대응. `getent passwd $USER`로 real HOME 추출 + `AX_TARGET_HOME` / `SECRETS_DIR` env var override 옵션. 차기 신규 secret-handling 스크립트에 동일 패턴 적용 권장.

3. **Worker × Secret 매핑 명시화**: 7 worker 모두 3 secret 사용 가정이었으나 fs 점검 결과 LLM 미사용 worker(svc-ingestion / svc-queue-router / svc-mcp-server)는 INTERNAL_API_SECRET만 필요. 실 작업량 30건 (예상 42 대비 -29%) — 정본 정보 정확도 향상.

## 8. 후속 후보 (deferred)

- 실 rotation 본 적용 (차기 세션 3-step 절차 따라 ~30분)
- staging env 포함 시 +15건 (`--include-staging` flag)
- cron 주기화 (90일 자동 rotation, 사용자 본인 운영 정책 결정 필요)
- verify 자동화 확장 — 현 secret-sync-svc-skill.sh --verify 패턴을 다른 worker도 적용 가능하도록 일반화
