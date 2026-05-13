---
id: AIF-RPRT-050
title: OpenRouter API key rotation (F490 외부 secret 후속)
type: report
status: published
session: 303
date: 2026-05-13
author: Sinclair Seo
---

# OpenRouter API key rotation ✅ DONE — F490 외부 secret 후속

## 개요

Sprint 345 F517에서 INTERNAL_API_SECRET만 진짜 rotation 적용. 외부 발급 secret(OPENROUTER_API_KEY)은 dashboard 발급 필요라 후속 분리됐고, 본 세션 303 끝 follow-up으로 진행.

**Scope**: OpenRouter dashboard에서 신규 API key 발급 + 정본/dev.vars/production 일괄 갱신.

## 결과 (성공)

| 항목 | 값 |
|------|----|
| 신규 OPENROUTER_API_KEY | `sk-or-v1-6d31e510...` 73 chars (OpenRouter dashboard 발급) |
| 정본 백업 | `~/.secrets/openrouter-api-key.backup-20260513-153939` (chmod 600) |
| 정본 갱신 | `~/.secrets/openrouter-api-key` chmod 600 |
| svc-skill `.dev.vars` 갱신 | 정본과 동일 값 |
| v2 스크립트 --apply | 30/30 PUT 성공 (HTTP 200, all update — 기존 secret 모두 존재) |
| 7-worker `/health` | 7/7 HTTP 200 ✅ (10초 propagation 후) |
| 소요 | ~5분 (dashboard 발급 + 정본 + .dev.vars + sync + verify) |

### 갱신 대상 (3 layer)

| Layer | 위치 | 갱신 |
|-------|------|:----:|
| **정본** | `~/.secrets/openrouter-api-key` | ✅ |
| **Local dev** | `services/svc-skill/.dev.vars` | ✅ (LLM 사용 worker 중 .dev.vars 보유 1개) |
| **Production** | 4 worker × 2 env = 8 ops (extraction/policy/ontology/skill × default+production) | ✅ |
| (참조) v2 sync 부수 효과 | 7-worker × INTERNAL_API_SECRET 14 ops + CF_AI_GW 8 ops | ✅ idempotent (값 동일) |
| **총 ops** | **30 (worker × secret × env)** | **30/30 HTTP 200** |

## .dev.vars 분포 관찰 (rotation 전 점검)

LLM 사용 worker 4개 중 svc-skill만 `.dev.vars`에 OPENROUTER_API_KEY 정의:

| Worker | .dev.vars | wrangler secret | Local dev LLM 호출 |
|--------|:--:|:--:|:--:|
| svc-extraction | ❌ | ✅ | mock 또는 미사용 |
| svc-policy | ❌ | ✅ | mock 또는 미사용 |
| svc-ontology | ❌ | ✅ | mock 또는 미사용 |
| svc-skill | ✅ | ✅ | 실 호출 가능 |

> svc-skill 외 3개 worker는 local dev에서 LLM 호출 미사용 (또는 vitest mock으로 우회). production secret만 갱신하면 운영 영향 0.

## Verify 한계 — F514 merged 후 외부 cross-service auth verify 불가

Sprint 343 F514 (CF Access JWT 7-worker middleware) merged 후 외부 라우트는 **JWT + X-Internal-Secret 2단 인증**:

```bash
curl -H "X-Internal-Secret: ..." "https://svc-skill.ktds-axbd.workers.dev/skills?org=LPON"
→ HTTP 401: {"error":{"code":"UNAUTHORIZED","message":"CF Access JWT required or expired"}}
```

이는 F514 의도된 동작. 외부 curl에서 LLM 호출 검증은 불가, 단:
- 7-worker `/health` 7/7 HTTP 200 (boot 정상)
- 30 ops CF API REST PUT HTTP 200 (secret store 적용)
- worker propagation 10초 후 정상 동작

→ **secret rotation 자체는 성공 입증**. 실 LLM 호출 검증은 production UI(rx.minu.best)에서 CF Access 로그인 후 Skill evaluation trigger로 확증 (사용자 후속 검증).

## 메타 학습

### 발견 1: .dev.vars 분포 불균일

LLM 사용 worker 4개 중 1개만 `.dev.vars` 보유. 향후 점검 후보:
- (a) 의도된 분포라면 SPEC/CLAUDE.md 명시 (production만 LLM 호출, local dev는 mock)
- (b) 누락이라면 svc-extraction/policy/ontology에도 .dev.vars 추가 (별도 작업)

본 rotation은 svc-skill만 갱신 (정본 일치 유지).

### 발견 2: F514 적용 후 외부 verify 패턴 변경 필수

CLAUDE.md "Worker Secret Store §Rotation 5번 표준"의 verify 단계가 F514 적용 후 변경 필요:
- **이전**: `curl -H "X-Internal-Secret: ..." {worker}/skills?...` HTTP 200 + 응답 검증
- **F514 이후**: 외부 curl 불가 (CF Access JWT 필수) → production UI에서 Skill evaluation trigger 또는 internal endpoint(`/internal/*`) 활용

CLAUDE.md 갱신 후보 (별도 docs sprint).

### 발견 3: Rotation 3-layer 일관성 패턴 정착

OpenRouter rotation 3-layer (정본 + .dev.vars + production):
1. **정본 갱신** (chmod 600 + 백업 보존)
2. **.dev.vars 갱신** (gitignored, local dev 영향)
3. **production secret 갱신** (v2 스크립트 일괄)

INTERNAL_API_SECRET rotation(S345)은 .dev.vars layer 누락 — local dev에서는 .dev.vars에 INTERNAL_API_SECRET 별도 정의 여부 점검 후속 후보.

## 산출물

- `~/.secrets/openrouter-api-key` (갱신, chmod 600)
- `~/.secrets/openrouter-api-key.backup-20260513-153939` (백업, chmod 600)
- `services/svc-skill/.dev.vars` (갱신, gitignored)
- production secret store 30 ops PUT (CF API REST)
- 본 reports

## 차기

- (선택) svc-extraction/policy/ontology `.dev.vars`에 OPENROUTER_API_KEY 추가 (local dev LLM 호출 활성화)
- (선택) INTERNAL_API_SECRET rotation의 .dev.vars layer 점검 (S345 누락 보완)
- CLAUDE.md "Worker Secret Store §Rotation 5번 표준" F514 이후 verify 패턴 갱신
- Staging env secret sync (`--include-staging` ~5분)
