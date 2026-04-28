---
id: AIF-RPT-042
type: report
sprint: 242
feature: F409
req: AIF-REQ-037
title: CF Pages→Workers 전환 후 /api/* 프록시 수정 완료
status: DONE
created: 2026-04-28
match_rate: 98
---

# Report: F409 — `rx.minu.best /api/*` 프록시 수정

## 결과 요약

| 항목 | 결과 |
|------|------|
| Match Rate | **98%** (목표: ≥90%) |
| 변경 파일 | 2개 |
| 구현 시간 | 약 1시간 |

## 근본 원인 (최종 진단)

F406/F407에서 app-web을 Cloudflare Pages → Workers로 이전할 때, `src/worker.ts`에 `/api/*` 라우팅이 추가되지 않았다.

```
Before (broken):
  /api/* → env.ASSETS.fetch() → not_found_handling=SPA → index.html (200 text/html)

After (fixed):
  /api/* → proxyToGateway() → recon-x-api.ktds-axbd.workers.dev → JSON response
```

`functions/api/[[path]].ts`는 Pages Functions 전용이며 Workers 모드에서 비활성화됨 (dead code).

## 변경 파일

### 1. `apps/app-web/src/worker.ts`

| 추가 기능 | 코드 위치 |
|----------|----------|
| `INTERNAL_API_SECRET` Env 필드 추가 | `:11` |
| `getGatewayUrl()` — staging/production 분기 | `:16-19` |
| `CORS_HEADERS` 상수 | `:21-26` |
| `proxyToGateway()` — X-Internal-Secret 주입 + CORS | `:28-61` |
| OPTIONS preflight 204 핸들러 | `:66-68` |
| `/api/*` 분기 추가 | `:81-83` |

### 2. `apps/app-web/e2e/poc-spec.spec.ts`

- `test.skip` 제거 (line 35)
- TODO 주석 → F409 완료 주석으로 교체
- 테스트 로직 유지 (`Spec 요약` locator, timeout 10s)

## DoD 체크리스트

| 기준 | 상태 | 비고 |
|------|------|------|
| rx.minu.best/api/auth/me → JSON | 🚀 배포 후 확인 | INTERNAL_API_SECRET 미설정 시 502 |
| rx.minu.best/api/skills → JSON | 🚀 배포 후 확인 | |
| rx.minu.best/api/skills/org/Miraeasset/spec/business → JSON | 🚀 배포 후 확인 | |
| poc-spec.spec.ts skip 0건 | ✅ 코드 완료 | 배포 후 E2E 실행 필요 |
| AIF-REQ-037 DONE 전환 | ✅ (본 리포트에서) | |
| Plan/Design/Report 작성 | ✅ | AIF-PLAN-042 / AIF-DSGN-042 / AIF-RPT-042 |

## 배포 후 필수 확인 (Production Smoke)

```bash
# 1. JSON 응답 확인 (401 = 인증 없지만 proxy 정상)
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://rx.minu.best/api/auth/me
# 기대: 401 application/json

curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://rx.minu.best/api/skills
# 기대: 401 application/json

curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "https://rx.minu.best/api/skills/org/Miraeasset/spec/business?llm=false"
# 기대: 401 application/json (또는 200 데이터가 있을 경우)

# 2. SPA fallback이 아닌지 확인 (HTML이면 아직 배포 안 됨)
curl -s https://rx.minu.best/api/auth/me | python3 -c "import sys,json; json.load(sys.stdin); print('JSON OK')"
```

## INTERNAL_API_SECRET 배포 체크

```bash
# app-web Worker에 secret 설정 (Pages에서 Workers 이전 시 재설정 필요)
printf 'your-internal-secret' | wrangler secret put INTERNAL_API_SECRET --env production --name app-web
```

Workers 이전 후 이 secret이 설정되지 않으면 Gateway 401/403이 발생한다.

## 교훈 (Autopilot Production Smoke Test 패턴 8회차)

이번 F409는 `rules/development-workflow.md "Autopilot Production Smoke Test"` 패턴의 8회차 사례다.
- F406/F407 autopilot Match 100% + CI green → 하지만 production에서 `/api/*` 미동작
- Pages Functions (`functions/api/[[path]].ts`)는 Workers 모드에서 비활성화됨을 인지하지 못한 채 "코드가 있으니 동작하겠지"로 가정
- Workers 이전 시 `functions/` 디렉토리가 dead code가 된다는 점을 체크리스트에 추가 필요

## Gap Analysis 결과

**Match Rate: 98%**  
2% gap = `§8` Design doc의 DEMO_MODE/DEV_PROXY 결정 주석이 구현과 약간 다른 설명. 코드 자체는 100% 설계 준수.
