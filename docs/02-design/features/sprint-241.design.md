---
code: AIF-DSGN-043
title: "Sprint 241 F413 + F403 — Design"
version: "0.1"
status: Draft
category: DSGN
created: 2026-05-02
updated: 2026-05-02
author: Sinclair Seo
sprint: 241
related:
  - docs/01-plan/features/F413.plan.md
  - SPEC.md §6 Sprint 241
  - SPEC.md §8 TD-53
  - infra/migrations/db-skill/0013_skills_status_check.sql (신규)
  - services/svc-skill/src/routes/ai-ready.ts:214
  - services/svc-skill/src/routes/skills.ts:513-553
  - apps/app-web/e2e/executive-evidence.spec.ts (신규)
  - apps/app-web/e2e/engineer-workbench.spec.ts (신규)
  - apps/app-web/e2e/guest-mode.spec.ts (신규)
  - apps/app-web/e2e/admin.spec.ts (확장)
---

# Sprint 241 — F413 + F403 Design

> **F413**: TD-53 해소 — `skills.status` 6-enum 표준화 + AI-Ready filter 보정
> **F403**: Phase 9 신규 라우트 E2E 커버리지 보강 (AIF-ANLS-032 remediation)

## §1 F413 — Skill Packaging Lifecycle 표준화

### §1.1 Problem

`skills.status` enum이 schema(0001_init.sql:15)에는 3종(`draft/published/archived`)만 정의되고 CHECK 제약 없음. 코드에서 3종 추가(`bundled/reviewed/superseded`) drift 발생. 결과: AI-Ready batch endpoint `status='published'` filter가 production LPON published 0건과 미스매치 → HTTP 400 차단.

### §1.2 6-Status Lifecycle

| Status | 진입 경로 | AI-Ready 평가 |
|--------|----------|:---:|
| `draft` | queue/handler INSERT | ❌ |
| `reviewed` | skills.ts:654 INSERT (F362) | ✅ |
| `bundled` | rebundle-orchestrator:154 INSERT | ✅ |
| `published` | handleUpdateSkillStatus 수동 | ✅ |
| `superseded` | rebundle-orchestrator:178 UPDATE | ❌ |
| `archived` | handleUpdateSkillStatus 수동 | ❌ |

### §1.3 변경 파일 매핑

| # | 파일 | 변경 내용 |
|---|------|---------|
| 1 | `infra/migrations/db-skill/0013_skills_status_check.sql` | 6-enum CHECK 제약 + org/status 복합 인덱스 (CREATE TABLE → INSERT → DROP → RENAME 패턴) |
| 2 | `services/svc-skill/src/routes/ai-ready.ts` | :214 `status='published'` → `status IN ('bundled','reviewed')` |
| 3 | `services/svc-skill/src/routes/skills.ts` | :513 `UpdateStatusSchema` enum 6개, :551 `BulkPublishSchema` enum 6개 |
| 4 | `services/svc-skill/src/ai-ready/repository.test.ts` | bundled/reviewed 시나리오 추가 |

### §1.4 Migration 전략

SQLite `ALTER TABLE ADD CONSTRAINT` 미지원 → CREATE TABLE → INSERT → DROP → RENAME 패턴:
- `skills_new` 테이블 생성 (6-enum CHECK 제약 포함)
- `INSERT INTO skills_new SELECT * FROM skills` (기존 데이터 복사)
- `DROP TABLE skills` + `ALTER TABLE skills_new RENAME TO skills`
- 기존 data 사전 검증: production 5종만 존재(`draft/reviewed/bundled/published/superseded`), `archived` 없으나 enum 포함 OK

## §2 F403 — Phase 9 E2E 커버리지 보강

### §2.1 대상 라우트 + 신규 spec 파일

| 파일 | 라우트 | 근거 F-item |
|------|--------|-------------|
| `e2e/executive-evidence.spec.ts` (신규) | `/executive/evidence` | F378 |
| `e2e/engineer-workbench.spec.ts` (신규) | `/engineer/workbench`, `/engineer/workbench/:id` | F379/F380 |
| `e2e/guest-mode.spec.ts` (신규) | `/?demo=guest`, `/upload` guest blocked | F384 |
| `e2e/admin.spec.ts` (확장) | `/admin` AuditLog 탭 전환 | F382/F387 |

### §2.2 각 spec 설계

**executive-evidence.spec.ts**:
- `test("renders evidence hub page")` → h2 "근거 자료 (Evidence)" 가시
- `test("tab navigation works")` → tab trigger 클릭 시 URL searchParam 변경

**engineer-workbench.spec.ts**:
- `test("renders workbench search UI")` → `/engineer/workbench` 로딩 + search input 존재
- `test("detail page renders with id")` → `/engineer/workbench/test-id` → search input = test-id

**guest-mode.spec.ts**:
- storageState 없이(`{ storageState: undefined }`) 독립 실행
- `test("demo=guest shows GuestBlockedView on upload")` → `/?demo=guest` 후 `/upload` 이동 → GuestBlockedView 텍스트 + 로그인 버튼 가시
- `test("demo=guest shows Demo Mode badge")` → `/?demo=guest` → 사이드바 🎭 배지 가시

**admin.spec.ts 확장**:
- `test("admin page renders")` → `/admin` h1 "Admin 대시보드" 가시
- `test("AuditLog tab switch")` → "감사 로그" TabsTrigger 클릭 → AuditLog 컴포넌트 렌더

### §2.3 E2E 개수 변화

| 구분 | 현재 | 추가 | 목표 |
|------|----:|----:|----:|
| 기존 | 50 | - | - |
| executive-evidence | - | 2 | - |
| engineer-workbench | - | 2 | - |
| guest-mode | - | 2 | - |
| admin 확장 | - | 2 | - |
| **합계** | **50** | **+8** | **≥58** |

> DoD: CI E2E 51+ PASS (실제 +8 추가로 더 달성)

## §3 DoD 체크리스트

- [ ] F413: 0013 migration 파일 생성
- [ ] F413: ai-ready.ts filter 변경
- [ ] F413: UpdateStatusSchema/BulkPublishSchema enum 6개
- [ ] F413: 테스트 bundled/reviewed 시나리오
- [ ] F403: executive-evidence.spec.ts (2 tests)
- [ ] F403: engineer-workbench.spec.ts (2 tests)
- [ ] F403: guest-mode.spec.ts (2 tests)
- [ ] F403: admin.spec.ts 확장 (2 tests)
- [ ] pnpm typecheck PASS
- [ ] pnpm lint PASS
- [ ] Match Rate ≥ 90%
