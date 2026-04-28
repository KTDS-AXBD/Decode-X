---
id: AIF-PLAN-042
type: plan
sprint: 242
feature: F409
req: AIF-REQ-037
title: CF Pages→Workers 전환 후 /api/* 프록시 누락 수정
status: IN_PROGRESS
created: 2026-04-28
---

# Plan: F409 — rx.minu.best `/api/*` 프록시 수정

## 1. 문제 요약

`app-web`이 Cloudflare Pages에서 Workers로 이전(F406/F407) 되었으나, `src/worker.ts`가
`/api/*` 경로를 처리하지 않아 모든 API 요청이 SPA fallback(`index.html`, HTTP 200 text/html)을
반환한다. Pages Functions(`functions/api/[[path]].ts`)는 Workers 환경에서 비활성화되는 dead code다.

- **증상**: `rx.minu.best/api/*` → HTML 200 + `cf-cache-status: HIT`
- **정상 경로**: `recon-x-api.ktds-axbd.workers.dev/api/*` → 401 application/json ✅
- **임시 조치**: `poc-spec.spec.ts:29` test.skip (커밋 b531716)

## 2. 근본 원인

```
src/worker.ts fetch handler:
  /cdn-cgi/* → pass-through (CF Access)
  /* → env.ASSETS.fetch()  ← /api/* 도 여기로 떨어짐
       └→ not_found_handling=SPA → index.html 200
```

`functions/api/[[path]].ts`는 Pages Functions 전용이며 Workers 빌드에서 무시된다.

## 3. 수정 계획

| Step | 작업 | 소요 |
|------|------|------|
| 1 | `src/worker.ts`에 `/api/*` 프록시 분기 추가 | 30m |
| 2 | OPTIONS preflight 핸들링 추가 | 10m |
| 3 | `wrangler.toml` — `INTERNAL_API_SECRET` secret 참조 확인 | 10m |
| 4 | typecheck + 로컬 smoke | 20m |
| 5 | 배포 + production smoke 3종 실측 | 30m |
| 6 | `poc-spec.spec.ts:29` skip 해제 + 검증 locator 단순화 | 10m |

## 4. DoD (완료 기준)

- [ ] `rx.minu.best/api/auth/me` → 401 application/json (미인증)
- [ ] `rx.minu.best/api/skills` → 401 application/json (미인증)
- [ ] `rx.minu.best/api/skills/org/Miraeasset/spec/business` → 401 application/json
- [ ] `poc-spec.spec.ts` 5/5 PASS (skip 0건)
- [ ] AIF-REQ-037 PLANNED → DONE
- [ ] Plan/Design/Report 문서 작성 완료

## 5. 범위 외 (non-goal)

- DEMO_MODE TDZ 버그(`functions/api/[[path]].ts:41`)는 dead code 파일이므로 별도 수정 불필요
  (Workers 환경에서 실행되지 않음). 파일 자체는 Pages 시절 이력 보존용으로 유지.
- B-02 CF Access 장애 해소 여부 확인 — F409 범위 외. proxy가 정상화되면 401이 도달하므로
  Access 인증 완결은 별도 검증.
