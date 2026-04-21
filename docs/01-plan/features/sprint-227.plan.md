# Sprint 227 Plan — F401 + F384 + F383

> **Sprint**: 227 | **Milestone**: M-UX-4 Should + TD-41 완전 해소
> **F-items**: F401 (P1) → F384 (P2) → F383 (P2, 선택)

## Wave 순서
- **F401** (~3h 30min): `?demo=1` bypass + CI DEMO_MODE — P1 선행
- **F384** (4h): Guest/Demo 읽기전용 데이터 모드
- **F383** (8h): AXIS DS Tier 3 외부 레포 PR skeleton

## F401 구현 범위 (TD-41 완전 해소)

### 접근법: 옵션 A (AskUserQuestion S229 확정)
1. **Server** (`functions/api/[[path]].ts`): `env.DEMO_MODE==='1' && ?demo=1` → stub user JSON 반환
2. **Client** (`src/contexts/AuthContext.tsx`): `VITE_DEMO_MODE==='1'` 감지 + localStorage 세션 영속화
3. **Playwright** (`e2e/auth.setup.ts`): `/?demo=1` navigate → storageState 저장
4. **E2E** (11 파일): `test.describe.skip` 15개 전원 해제 + 깨진 테스트 업데이트
5. **CI** (`.github/workflows/ci.yml`): E2E job에만 `VITE_DEMO_MODE: '1'` 추가
6. **Security**: `wrangler.toml` production/preview에 DEMO_MODE 미정의 확인

### DoD
- CI E2E pass count 1 → 45+ 복원
- Production `/?demo=1` → 401 또는 /welcome redirect (stub user 미반환)

## F384 구현 범위
- 읽기 전용 데이터 모드 (Guest role 진입점)
- `/welcome` 페이지에 "데모 둘러보기" CTA 추가
- Demo 진입 시 실 데이터 API 호출 대신 목업 데이터 반환

## F383 구현 범위 (선택, 시간 허용 시)
- AXIS DS 외부 레포 (`IDEA-on-Action/AXIS-Design-System`)에 PR skeleton 생성
- 3 컴포넌트: SpecSourceSplitView, ProvenanceInspector, StageReplayer
