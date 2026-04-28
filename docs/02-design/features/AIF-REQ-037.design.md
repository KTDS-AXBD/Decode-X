---
id: AIF-DSGN-042
type: design
sprint: 242
feature: F409
req: AIF-REQ-037
title: src/worker.ts /api/* 프록시 통합 설계
status: IN_PROGRESS
created: 2026-04-28
---

# Design: F409 — `src/worker.ts` API 프록시 통합

## 1. 현재 상태 (AS-IS)

```
Request → rx.minu.best/api/skills
  → app-web Worker (src/worker.ts)
      → env.ASSETS.fetch(request)          ← /api/* 파일 없음
          → not_found_handling = SPA
              → index.html (200 text/html) ← 버그!
```

## 2. 목표 상태 (TO-BE)

```
Request → rx.minu.best/api/skills
  → app-web Worker (src/worker.ts)
      → /api/* 분기 감지
          → proxyToGateway()
              → recon-x-api.ktds-axbd.workers.dev/api/skills
                  → 401 application/json   ← 정상!
```

## 3. 변경 파일

| 파일 | 변경 유형 | 내용 |
|------|---------|------|
| `apps/app-web/src/worker.ts` | modify | `/api/*` 프록시 분기 + OPTIONS preflight 처리 추가 |
| `apps/app-web/e2e/poc-spec.spec.ts` | modify | test.skip 해제 + "Spec 요약" locator 단순화 |

## 4. worker.ts 설계

### Env 인터페이스 확장
```typescript
export interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  DEPLOY_ENV: string;
  INTERNAL_API_SECRET: string; // secret (wrangler secret put)
}
```

### 요청 라우팅 우선순위
1. `OPTIONS` preflight → CORS 204 즉시 반환
2. `/cdn-cgi/*` → `fetch(request)` (CF Access pass-through, 기존 F407)
3. `/api/*` → `proxyToGateway()` (신규 F409)
4. 그 외 → `env.ASSETS.fetch(request)` (SPA serving, 기존)

### proxyToGateway 동작
- `DEPLOY_ENV === "staging"` → `recon-x-api-staging.ktds-axbd.workers.dev`
- 그 외(production) → `recon-x-api.ktds-axbd.workers.dev`
- `X-Internal-Secret` 헤더 주입 (INTERNAL_API_SECRET secret)
- `host` 헤더 제거 (Gateway가 자체 host 사용)
- CORS 응답 헤더 주입 (Access-Control-Allow-Origin: *)
- 502 에러 핸들링

### CORS preflight (OPTIONS) 처리
```typescript
if (request.method === "OPTIONS") {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Organization-Id, X-User-Id, X-User-Role",
      "Access-Control-Max-Age": "86400",
    },
  });
}
```

## 5. Worker 파일 매핑

| Worker | 담당 파일 |
|--------|----------|
| W-1 (단일 구현) | `apps/app-web/src/worker.ts`, `apps/app-web/e2e/poc-spec.spec.ts` |

## 6. 환경 변수 / Secrets

| 이름 | 종류 | 설정 위치 | 용도 |
|------|------|----------|------|
| `DEPLOY_ENV` | var | wrangler.toml | staging/production gateway 선택 |
| `INTERNAL_API_SECRET` | secret | wrangler secret put | Gateway 인증 헤더 |

> ⚠️ `INTERNAL_API_SECRET`이 app-web Worker에 설정되어 있지 않으면 gateway 호출 시 403.
> 기존 Pages 프로젝트에는 설정되어 있었으나 Workers 이전 시 새로 `wrangler secret put` 필요.

## 7. Production Smoke 기준

| 요청 | 기대 응답 | 확인 포인트 |
|------|----------|------------|
| `GET /api/auth/me` | 401 application/json | `Content-Type: application/json` |
| `GET /api/skills` | 401 application/json | JSON body `{"success":false}` |
| `GET /api/skills/org/Miraeasset/spec/business` | 401 application/json | Gateway 도달 증거 |

> 인증 없이 401이면 Gateway 도달 = 프록시 정상. 200이면 여전히 SPA fallback.

## 8. E2E 테스트 계약

```typescript
// poc-spec.spec.ts:29 — test.skip 해제 후 변경
test("Org Spec — Business 탭 로딩", async ({ page }) => {
  await page.goto("/org-spec");
  await page.getByRole("tab", { name: /Business/ }).click();
  // DEMO_MODE=1 환경에서 stub API 응답, production에서는 401이므로
  // E2E는 DEMO_MODE로 실행 → SpecTabContent 로딩 확인
  await expect(page.getByText(/Spec 요약/).first()).toBeVisible({ timeout: 10_000 });
});
```

> E2E가 실제 API를 호출하는 경우 인증 토큰 없이 401 → test fail.
> 현재 E2E webServer는 `VITE_DEMO_MODE=1` 주입(b26419b) — 단, worker.ts의 DEMO_MODE는
> playwright webServer env에서 별도 설정 필요. 주입 경로 확인 후 skip 해제 여부 결정.
