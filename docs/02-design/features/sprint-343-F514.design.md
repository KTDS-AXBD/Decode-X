---
id: AIF-DSGN-120
title: "Sprint 343 F514 — CF Access JWT validate Design"
type: design
sprint: 343
f_items: [F514]
status: IN_PROGRESS
created: "2026-05-13"
---

# AIF-DSGN-120 — Sprint 343 F514 Design

## §1 핵심 설계 결정

### 서명 검증 범위
CF Access JWT 서명 검증은 Cloudflare edge가 수행한다(Zero Trust 보장).
Worker 미들웨어는 **presence + expiry** 만 검사한다.
- 이유: JWKS fetch는 cold-start 레이턴시 + 추가 네트워크 비용 발생
- 선례: `svc-skill/routes/auth.ts` 동일 패턴

### Internal vs External 분리
- `/internal/*` 라우트: `X-Internal-Secret` (queue router → worker 이벤트)
- 그 외 모든 라우트: `Cf-Access-Jwt-Assertion` 헤더 필수
- 이유: queue events는 CF Access를 거치지 않음 (service-to-service)

### svc-skill `/auth/me` 처리
- `handleGetMe` 내부에서 이미 JWT 검증 수행
- Worker entry에서 `/auth/me` 경로는 JWT 미들웨어 skip (중복 검증 방지)
- `decodeCfJwt` 인라인 함수 → `decodeCfAccessJwt` utils import로 교체

## §2 cf-access-jwt.ts 상세 명세

```ts
// packages/utils/src/cf-access-jwt.ts

import { unauthorized } from "./response.js";

export interface CfAccessJwtClaims {
  sub: string;
  email: string;
  name?: string | undefined;
  exp: number;
  iat?: number | undefined;
  iss?: string | undefined;
  aud?: string | string[] | undefined;
}

function base64UrlDecode(str: string): string {
  const pad = 4 - (str.length % 4);
  return atob(
    str.replace(/-/g, "+").replace(/_/g, "/") + (pad === 4 ? "" : "=".repeat(pad))
  );
}

export function decodeCfAccessJwt(token: string): CfAccessJwtClaims | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || parts[1] === undefined) return null;
    return JSON.parse(base64UrlDecode(parts[1])) as CfAccessJwtClaims;
  } catch {
    return null;
  }
}

export function extractCfAccessJwtClaims(request: Request): CfAccessJwtClaims | null {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;
  const claims = decodeCfAccessJwt(token);
  if (!claims) return null;
  if (claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}

export function requireCfAccessJwt(request: Request): Response | null {
  const claims = extractCfAccessJwtClaims(request);
  if (!claims) return unauthorized("CF Access JWT required or expired");
  return null;
}
```

## §3 Worker 미들웨어 패턴

### 공통 패턴 (6 workers: svc-ingestion/extraction/policy/ontology/queue-router/mcp-server)

```ts
// 추가 import
import { requireCfAccessJwt } from "@ai-foundry/utils";

// fetch handler 내부, health 체크 이후, internal secret 체크 이전:

// External routes: CF Access JWT required
// (내부 라우트 /internal/* 및 Queue consumer는 X-Internal-Secret 경로로 분리)
if (!path.startsWith("/internal/")) {
  const jwtDenied = requireCfAccessJwt(request);
  if (jwtDenied) return jwtDenied;
}

// All other routes require inter-service secret (internal only)
if (!verifyInternalSecret(request, env.INTERNAL_API_SECRET)) { ... }
```

### svc-skill 패턴 (특이사항: /auth/me JWT only)

```ts
// /auth/me: JWT only, no X-Internal-Secret
if (method === "GET" && path === "/auth/me") {
  return handleGetMe(request, env);  // internally validates JWT via utils helper
}

// External routes: CF Access JWT required (non-internal, non-health)
if (!path.startsWith("/internal/")) {
  const jwtDenied = requireCfAccessJwt(request);
  if (jwtDenied) return jwtDenied;
}

// Internal routes: X-Internal-Secret
if (!verifyInternalSecret(request, env.INTERNAL_API_SECRET)) { ... }
```

## §4 테스트 설계 (TDD Red)

```ts
// packages/utils/src/__tests__/cf-access-jwt.test.ts

describe("decodeCfAccessJwt", () => {
  test("valid JWT → claims 반환")
  test("malformed token → null")
  test("parts < 3 → null")
  test("invalid base64 payload → null")
})

describe("extractCfAccessJwtClaims", () => {
  test("valid non-expired JWT → claims")
  test("no header → null")
  test("expired JWT (exp < now) → null")
  test("header present but invalid → null")
})

describe("requireCfAccessJwt", () => {
  test("valid JWT → null (no rejection)")
  test("missing JWT → 401 Response")
  test("expired JWT → 401 Response")
})
```

## §5 파일 매핑 (Worker별)

| 파일 | 변경 유형 | 내용 |
|------|---------|------|
| `packages/utils/src/cf-access-jwt.ts` | 신규 | SSOT JWT helper (3 functions) |
| `packages/utils/src/__tests__/cf-access-jwt.test.ts` | 신규 | 단위 테스트 9+ cases |
| `packages/utils/src/index.ts` | 수정 | `export * from "./cf-access-jwt.js"` 추가 |
| `services/svc-ingestion/src/index.ts` | 수정 | JWT 미들웨어 추가 |
| `services/svc-extraction/src/index.ts` | 수정 | JWT 미들웨어 추가 |
| `services/svc-policy/src/index.ts` | 수정 | JWT 미들웨어 추가 |
| `services/svc-ontology/src/index.ts` | 수정 | JWT 미들웨어 추가 |
| `services/svc-skill/src/index.ts` | 수정 | JWT 미들웨어 추가 + /auth/me 순서 조정 |
| `services/svc-skill/src/routes/auth.ts` | 수정 | 인라인 decodeCfJwt → utils import |
| `services/svc-queue-router/src/index.ts` | 수정 | JWT 미들웨어 추가 |
| `services/svc-mcp-server/src/index.ts` | 수정 | JWT 미들웨어 추가 |
| `reports/sprint-343-cf-access-jwt-2026-05-13.md` | 신규 | 실 API verify 결과 |
| `reports/sprint-343-cf-access-jwt-2026-05-13.json` | 신규 | 구조화 결과 |

## §6 보안 고려사항

- JWT 서명 검증: CF edge 보장 (app-level 미수행 — Zero Trust 신뢰 경계)
- 만료 시간 검증: `exp < Math.floor(Date.now() / 1000)` (비교는 UTC seconds)
- Queue consumer paths (`/internal/queue-event`): JWT bypass 유지 — queue events는 CF Access 경유 안 함
- `/health` bypass 유지 — monitoring uptime check (인증 불필요)
