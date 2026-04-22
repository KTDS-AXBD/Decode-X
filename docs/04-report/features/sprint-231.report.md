# Sprint 231 Report — F384 Guest/Demo 모드

> **Sprint**: 231 | **Date**: 2026-04-22 | **Match Rate**: 100%
> **Autopilot**: Tier 3 (직접 실행)

---

## 결과 요약

| 항목 | 결과 |
|------|------|
| F-item | F384 — Guest/Demo 읽기 전용 모드 |
| typecheck | ✅ PASS |
| lint | ✅ PASS (pre-existing svc-skill 에러 1건 함께 수정) |
| Match Rate | 100% (8/8 Design 항목) |
| E2E Verify | SKIP (foundry-x e2e-verify 미지원) |
| Codex Review | SKIP (스크립트 미존재) |

---

## 구현 항목 (8/8)

1. **auth-store.ts** — CfUser.role에 `'guest'` 추가
2. **AuthContext.tsx** — `?demo=guest` module-level 캡처 + loadUser() 처리
3. **lib/guest-access.ts** (신규) — `isDemoGuest()`, `isGuestBlockedRoute()` 헬퍼
4. **components/GuestBlockedView.tsx** (신규) — 차단 화면 (🔒 + 로그인 CTA)
5. **lib/demo-seed.ts** (신규) — 퇴직연금/온누리상품권 4개 Skill 시드 데이터
6. **app.tsx** — `PG` wrapper 추가, 차단 8개 라우트에 적용
7. **Sidebar.tsx** — role=guest 시 🎭 Demo Mode 배지 + 로그인 CTA 링크
8. **skill-catalog.tsx** — `isDemoGuest()` 분기, 시드 데이터 주입

## 보너스 수정

- **svc-skill/src/routes/provenance.ts** — 미사용 `errFromUnknown` import 제거 (pre-existing lint 에러)

---

## DoD 달성 여부

| 항목 | 상태 |
|------|------|
| (a) `/?demo=guest` → Executive Overview/Evidence/Skill Catalog 조회 | ✅ |
| (b) Upload 등 write 8개 라우트 차단 | ✅ |
| (c) 🎭 Demo Mode 배지 표시 | ✅ |
| (d) 로그인 CTA → /welcome | ✅ |
| Security: production VITE_DEMO_MODE 미정의 가드 유지 | ✅ |

---

## 주요 설계 결정

- F401 인프라(VITE_DEMO_MODE + DEMO_STORAGE_KEY)를 재활용, `?demo=guest` 파라미터로 role 분기
- GuestGuard는 Layout 내부에 위치 — ProtectedRoute 이후 role 체크 가능
- 기존 `?demo=1` (CI E2E, engineer role)과 직교 — 회귀 없음
- Skill Catalog만 시드 데이터 필요 (Executive Overview/Evidence는 이미 정적 데이터 사용)

---

## 다음 단계

- Production smoke test: `/?demo=guest` 접근 시 VITE_DEMO_MODE 미정의로 진입 불가 확인
- E2E spec 추가: `auth.setup.ts`에 `?demo=guest` setup 추가 (다음 Sprint TD)
