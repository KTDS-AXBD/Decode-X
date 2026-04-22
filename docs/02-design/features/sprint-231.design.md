# Sprint 231 Design — F384 Guest/Demo 모드

> **Sprint**: 231 | **F-item**: F384 | **Milestone**: M-UX-4 Should — Guest/Demo 읽기 전용 모드
> **Date**: 2026-04-22 | **Author**: Sinclair Seo
> **Base**: Sprint 227 F401 (VITE_DEMO_MODE + AuthContext module-level capture 인프라 재활용)

---

## §1. 목적 & 배경

- **목적**: `/?demo=guest` URL로 진입하는 외부 데모/영업용 읽기 전용 모드
- **DoD**: (a) Executive Overview·Evidence·Skill Catalog 조회, (b) upload 등 쓰기 차단, (c) 🎭 Demo Mode 배지, (d) 로그인 CTA → /welcome
- **보안 규칙**: `VITE_DEMO_MODE` production 빌드(`wrangler.toml [env.production.vars]`)에 절대 미정의 — F401과 동일 가드

---

## §2. 변경 파일 목록

| # | 파일 | 변경 종류 | 내용 |
|---|------|-----------|------|
| 1 | `apps/app-web/src/api/auth-store.ts` | MOD | CfUser.role에 `'guest'` 추가 |
| 2 | `apps/app-web/src/contexts/AuthContext.tsx` | MOD | `?demo=guest` → role=guest stub + module-level 캡처 |
| 3 | `apps/app-web/src/lib/guest-access.ts` | NEW | `isDemoGuest()`, `isGuestBlockedRoute()`, blocked 경로 목록 |
| 4 | `apps/app-web/src/components/GuestBlockedView.tsx` | NEW | 차단 화면 (🔒 + 로그인 CTA) |
| 5 | `apps/app-web/src/lib/demo-seed.ts` | NEW | Skill Catalog 시드 데이터 (SkillRow[] + SkillStats) |
| 6 | `apps/app-web/src/app.tsx` | MOD | `PG` wrapper — Guest 차단 라우트에 적용 |
| 7 | `apps/app-web/src/components/Sidebar.tsx` | MOD | role=guest 시 🎭 Demo Mode 배지 + 로그인 CTA |
| 8 | `apps/app-web/src/pages/skill-catalog.tsx` | MOD | guest 모드 시 fetchSkills/Stats 대신 시드 데이터 사용 |

---

## §3. 핵심 설계 결정

### 3.1 역할 분기 (?demo=1 vs ?demo=guest)

| 파라미터 | 역할 | 용도 | 환경 |
|----------|------|------|------|
| `?demo=1` | `engineer` | CI E2E 테스트 | CI (VITE_DEMO_MODE=1) |
| `?demo=guest` | `guest` | 외부 데모/영업 | Demo (VITE_DEMO_MODE=1) |

두 경로 모두 `VITE_DEMO_MODE === '1'` 가드 필요 — production에서 자동 비활성화.

### 3.2 Guest 차단 라우트

**차단** (write/admin): `/upload`, `/source-upload`, `/hitl`, `/fact-check`, `/gap-analysis`, `/api-console`, `/admin`, `/engineer/workbench`

**허용** (read): `/executive/overview`, `/executive/evidence`, `/skills`, `/skills/:id`, `/specs`, `/specs/:id`, `/export`

### 3.3 시드 데이터 전략

Executive Overview + Evidence는 이미 정적 데이터 사용 중 → 수정 불필요.
Skill Catalog는 API 호출 → `isDemoGuest()` 체크 후 `DEMO_SEED_SKILLS` / `DEMO_SEED_STATS` 주입.

### 3.4 Demo Mode 배지

Sidebar 사용자 프로필 영역: role=guest 시 `🎭 Demo Mode` 배지 표시.
로그인 CTA(`/welcome` 링크 버튼) 추가.

---

## §4. 데이터 플로우

```
/?demo=guest (VITE_DEMO_MODE=1)
  ↓ module-level 캡처 (AuthContext.tsx)
  ↓ localStorage['__demo_user__'] = {role:'guest', email:'demo@decode-x.ai'}
  ↓ AuthProvider loadUser() → setUser(guestStub)
  ↓
  BrowserRouter
    ├─ PG(차단 라우트) → isGuestBlockedRoute() → GuestBlockedView (+ /welcome CTA)
    └─ P(허용 라우트) → 정상 렌더
                         └─ SkillCatalogPage → isDemoGuest() → DEMO_SEED_SKILLS
```

---

## §5. Worker 파일 매핑 (단일 Worker, 직접 구현)

F384는 순수 프론트엔드 변경 (백엔드 API 없음). 단일 구현.

---

## §6. E2E 시나리오 (Playwright — 기존 auth.setup.ts 활용)

| 시나리오 | 진입 | 기대 결과 |
|---------|------|---------|
| Guest 진입 | `/?demo=guest` (VITE_DEMO_MODE=1) | /executive/overview 도달 |
| Executive Overview 조회 | `/executive/overview` | 정상 렌더 |
| Skill Catalog 조회 | `/skills` | 시드 데이터 카드 3개+ 표시 |
| 차단 라우트 | `/upload` (guest) | GuestBlockedView + 로그인 CTA |
| Demo 배지 확인 | Sidebar | 🎭 Demo Mode 배지 표시 |

---

## §7. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-22 | Sprint 231 autopilot 생성 |
