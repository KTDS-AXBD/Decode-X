# Sprint 227 Design — F401 TD-41 완전 해소

## §1 F401 아키텍처

### 인증 흐름 (DEMO_MODE)

```
CI E2E (VITE_DEMO_MODE=1)          Production
─────────────────────────          ──────────────────────
1. auth.setup: goto /?demo=1       1. CF Access JWT 검사
2. AuthContext: VITE_DEMO_MODE=1  2. /auth/me → D1 users 조회
   + ?demo=1 → stub user 생성     3. role: executive/engineer/admin
3. localStorage.__demo_user__      
4. storageState 저장 (incl. LS)   
5. 이후 tests: LS에서 복원          
```

### 세션 영속화 메커니즘

- `VITE_DEMO_MODE === '1'` + `?demo=1` → stub user 생성 + `localStorage.__demo_user__` 저장
- Playwright storageState가 localStorage 포함 → subsequent tests에서 자동 복원
- Production: `VITE_DEMO_MODE` 미설정 → LS 체크 skip → 기존 CF JWT 흐름 유지

## §2 변경 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `functions/api/[[path]].ts` | DEMO_MODE+?demo=1 → stub user (서버사이드 guard) |
| `src/contexts/AuthContext.tsx` | VITE_DEMO_MODE + localStorage demo session |
| `e2e/auth.setup.ts` | /?demo=1 navigate + storageState 저장 |
| `.github/workflows/ci.yml` | E2E job VITE_DEMO_MODE: '1' 추가 |
| `e2e/admin.spec.ts` | 3 test.describe.skip 해제 + benchmark route 수정 |
| `e2e/auth.spec.ts` | 3 test.skip → 새 auth behavior 테스트로 교체 |
| `e2e/deliver.spec.ts` | 1 test.describe.skip 해제 |
| `e2e/extract.spec.ts` | 1 test.describe.skip 해제 + /analysis route 수정 |
| `e2e/functional.spec.ts` | 4 test.describe.skip 해제 |
| `e2e/organization.spec.ts` | 1 test.describe.skip 해제 |
| `e2e/poc-spec.spec.ts` | 1 test.describe.skip 해제 + /poc/ai-ready redirect 수정 |
| `e2e/rbac.spec.ts` | 2 test.describe.skip 해제 + loginAs() demo 업데이트 |
| `e2e/upload.spec.ts` | 1 test.describe.skip 해제 + loginAs click 제거 |
| `e2e/verify.spec.ts` | 1 test.describe.skip 해제 |

## §3 보안 Guard

```typescript
// [[path]].ts — server-side guard
// DEMO_MODE는 production/preview wrangler.toml에 미정의
if (env.DEMO_MODE === '1' && url.searchParams.get('demo') === '1' && segments.join('/') === 'auth/me') {
  return Response.json({ email: 'e2e@test', role: 'engineer', status: 'active' });
}

// AuthContext — client-side guard
// VITE_DEMO_MODE는 CI job env에서만 주입, production build에 미포함
if (VITE_DEMO_MODE !== '1') → normal CF JWT flow
```

## §4 Stub User 스펙

```json
{ "email": "e2e@test", "role": "engineer", "status": "active" }
```

- `role: 'engineer'` = CfUser 유효 타입 (Analyst RBAC 매핑)
- Sidebar에 `e2e@test` + `engineer` 표시됨

## §5 Test 업데이트 상세

### 깨진 route 테스트 (redirect 대응)
- `/benchmark` → `<Navigate to="/executive/overview" />` → URL assertion으로 변경
- `/analysis` → `<Navigate to="/executive/overview" />` → URL assertion으로 변경
- `/poc/ai-ready` → `<Navigate to="/executive/overview" />` → URL assertion으로 변경

### rbac.spec.ts loginAs() 업데이트
- old: `/login` 이동 → DEMO_USERS 클릭
- new: `/?demo=1` 이동 → 모든 user가 demo engineer로 인증

### upload.spec.ts "upload as Analyst" 업데이트
- old: `/login` → "김경임" 클릭
- new: storageState로 이미 인증됨 (별도 loginAs 불필요)

### auth.spec.ts test.skip → 새 테스트
- "welcome page is the unauthenticated landing page": /welcome 접근 확인
- "demo user can navigate to executive overview": /?demo=1 → /executive/overview 리다이렉트
- "logout navigates away from authenticated area": logout 버튼 동작 확인
