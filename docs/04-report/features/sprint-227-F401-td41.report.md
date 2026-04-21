# Sprint 227 — F401 TD-41 완전 해소 Report

> **Sprint**: 227 | **Date**: 2026-04-22 | **Match Rate**: 100%

## 완료 항목

### F401 (P1): ?demo=1 bypass + CI DEMO_MODE env flag

**변경 사항**:
1. `functions/api/[[path]].ts`: `DEMO_MODE==='1' && ?demo=1 && path=auth/me` → stub user 반환
2. `src/contexts/AuthContext.tsx`: `VITE_DEMO_MODE==='1'` 감지 + localStorage.__demo_user__ 영속화
3. `e2e/auth.setup.ts`: `/?demo=1` navigate → wait for /executive/overview → storageState 저장
4. `.github/workflows/ci.yml`: E2E job에 `VITE_DEMO_MODE: '1'` 추가
5. E2E spec 11 파일: `test.describe.skip` 15개 전원 해제 + 깨진 테스트 업데이트

**테스트 변화**:
- Before: CI E2E pass 1 / total ~46 (나머지 skip)
- After: CI E2E pass 46 / skip 0 (모든 테스트 활성화)

**보안 Guard**:
- `wrangler.toml` production/preview: `DEMO_MODE` 키 미정의 ✅
- `VITE_DEMO_MODE`: CI job env에만 주입, production build 미포함 ✅
- Stub user: `role: 'engineer'` (CfUser 유효 타입, Analyst RBAC 매핑) ✅

## KPI 달성

- KPI-3 (E2E ≥95% 통과율): CI pass count 1 → 46 (100%) ✅
- TD-41 완전 해소: auth.setup.ts CF Access mock 구현 완료 ✅

## 기술 결정

- `VITE_DEMO_MODE` (VITE_ prefix): Vite가 클라이언트 번들에 env var 노출하는 표준 방식
- `localStorage.__demo_user__`: Playwright storageState가 localStorage 포함 → 세션 영속화
- `role: 'engineer'`: CfUser.role 유효 타입 중 Analyst(업로드/실행) 매핑

## 잔여 항목

- F384 (P2): Guest/Demo 읽기전용 데이터 모드 — 다음 Wave
- F383 (P2): AXIS DS Tier 3 외부 레포 PR skeleton — 선택 항목
