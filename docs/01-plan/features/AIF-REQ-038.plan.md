---
id: AIF-REQ-038
sprint: 243
feature: F410
title: Org Spec Business 탭 E2E skip 해제 + demo mock 검증
status: planned
estimated_hours: 1.5
created: 2026-04-29
---

# F410 Plan — AIF-REQ-038

## 목표

`e2e/poc-spec.spec.ts:33` `test.skip` → `test` 복원.
Playwright `page.route` mock으로 `fetchOrgSpec` API 격리 → Business 탭 로딩 검증.

## 배경

- AIF-REQ-037 (Sprint 242 F409) — production `/api/*` proxy DONE, HTTP 302 → CF Access 정상
- E2E 환경은 `localhost:5173` + `DEV_PROXY=remote` — production 미접근
- `fetchOrgSpec`이 `/api/skills/org/{org}/spec/business` 실 호출 → JSON 미도달 → timeout

## 선택 전략

**Option A — Playwright `page.route` (채택)**
- E2E spec 내 격리 mock, UI 코드 무변경
- `**/api/skills/org/*/spec/business` 패턴 intercept
- `route.fulfill({ json: mockDoc })` 응답

**Option B — fetchOrgSpec demo 분기 (폴백)**
- UI 소스 변경 필요, 범위 확대 위험

## DoD

- [ ] `poc-spec.spec.ts` `test.skip` → `test` 복원
- [ ] `TODO(AIF-REQ-037)` 주석 제거
- [ ] Business 탭 `page.route` mock 추가
- [ ] `pnpm test:e2e --grep "Business 탭"` PASS (로컬 또는 CI)
- [ ] CI E2E 기존 PASS 수 유지 (+1)
- [ ] AIF-REQ-038 DONE 마킹
- [ ] TD-46 해소 마킹

## 파일 변경 범위

| 파일 | 변경 |
|------|------|
| `apps/app-web/e2e/poc-spec.spec.ts` | test.skip → test, page.route 추가, 주석 제거 |
| `SPEC.md` | AIF-REQ-038 DONE, TD-46 해소, F410 DONE |

## 확장 (시간 여유 시)

Technical / Quality 탭 동일 패턴 확장 (+0.2h)
