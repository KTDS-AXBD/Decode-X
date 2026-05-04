---
title: "Sprint 253 TD-41 CF Access JWT mock E2E 복원 — Report"
sprint: 253
feature: TD-41
type: report
created: "2026-05-04"
match_rate: 97
status: done
---

# Sprint 253 Report: TD-41 CF Access JWT mock E2E 복원

## 요약

| 항목 | 값 |
|-----|---|
| Sprint | 253 |
| Feature | TD-41 |
| Match Rate | **97%** |
| typecheck | 14/14 PASS |
| lint | 9/9 PASS |
| E2E describe.skip | **0건** |
| 신규 파일 | 3개 |
| 수정 파일 | 2개 |

## 구현 산출물

### 신규
- `apps/app-web/e2e/fixtures/auth/cf-access-cookie.ts` — CF_Authorization JWT 빌더
  - `buildCfJwt(overrides?)`: unsigned JWT (header.payload.) 생성
  - `buildCfAuthorizationCookie()`: Playwright cookie 객체 반환
- `apps/app-web/e2e/fixtures/auth/auth-me-response.ts` — /auth/me 정적 stub
  - `AUTH_ME_STUB`: `{email: "e2e@test.local", role: "engineer", status: "active"}`
  - `makeAuthMeRoute(override?)`: page.route 핸들러 팩토리

### 수정
- `apps/app-web/e2e/auth.setup.ts`:
  - CF_Authorization cookie를 `page.context().addCookies()` 로 주입
  - storageState에 cookie 포함 → 모든 spec에 자동 전파
- `apps/app-web/e2e/auth.spec.ts`:
  - `CF Access JWT mock infrastructure (TD-41)` describe 블록 추가 (3 tests)
  - `buildCfJwt` JWT 형식 검증, storageState cookie 존재 확인, round-trip 통합 검증

### PDCA 문서
- `docs/01-plan/features/TD-41.plan.md`
- `docs/02-design/features/TD-41.design.md`
- `docs/03-analysis/features/TD-41.analysis.md`
- `docs/04-report/features/sprint-253-TD-41.report.md` (본 문서)

## 핵심 설계 결정

1. **msw 미도입** — page.route() 전용. Service Worker 라이프사이클 충돌 없이 단순 구현.
2. **globalSetup 방식 미채택** — page.route()는 storageState에 저장 안 됨 → fixture-per-test 모듈 방식 선택.
3. **VITE_DEMO_MODE 유지** — 기존 45개 spec 보호. CF JWT 인프라는 추가 레이어로 병존.
4. **Cookie in storageState** — auth.setup.ts에서 CF_Authorization cookie를 context에 추가 → storageState 캡처 → 모든 spec에 전파.

## 교훈

- Sprint 227 F401이 demo bypass로 선해소한 상태에서 Sprint 253 시작 → 이전 Sprint 결과물 재확인이 Sprint 시작 전 필수 (5분 절약 가능)
- CF_Authorization cookie는 storageState에 캡처 가능 (localStorage + cookie 모두 포함)
- `page.route()`는 컨텍스트 한정 — fixture 모듈로 공유하는 것이 Playwright 정석 패턴

## 잔여 (Sprint 253 범위 외)

| 항목 | 우선순위 |
|------|---------|
| VITE_DEMO_MODE 완전 제거 + CF JWT 경로 전용 E2E | P3 (현재 45/45 PASS로 긴급도 낮음) |
| CI E2E 신규 3 test 실행 확인 | CI 자동 검증 (push 후) |
