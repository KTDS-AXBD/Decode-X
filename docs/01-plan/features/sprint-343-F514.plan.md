---
id: AIF-PLAN-120
title: "Sprint 343 F514 — CF Access JWT validate 7-worker middleware"
type: plan
sprint: 343
f_items: [F514]
status: IN_PROGRESS
created: "2026-05-13"
---

# AIF-PLAN-120 — Sprint 343 F514 Plan

## 목표

7-worker (svc-ingestion/extraction/policy/ontology/skill/queue-router/mcp-server) 전체에
CF Access JWT (`Cf-Access-Jwt-Assertion` 헤더) validate middleware를 도입한다.

`packages/utils/src/cf-access-jwt.ts` SSOT helper를 신설하고, 각 worker entry에서
외부 라우트 진입 전 JWT 유효성을 검증한다.

## 배경

- F510 (Sprint 338) — RBAC SSOT 완결: `types/rbac.ts` CfRole 4개 + `mapCfRoleToRbacRoles` 완성
- F370 (Sprint) — `svc-skill` `/auth/me`에 CF Access JWT 검증 로직 존재 (인라인)
- 현재 gap: `/auth/me` 외 6 worker가 `X-Internal-Secret`으로만 보호, JWT 미검증
- Phase 3 Should S-2 보안 마감: svc-* 전체 CF Access JWT enforce

## 아키텍처 분석 (사전 fs 실측)

### 현재 worker 인증 레이어 (7개 공통 패턴)
```
GET /health            → 인증 없음
GET /auth/me           → CF Access JWT (svc-skill만)
POST /internal/*       → X-Internal-Secret
기타 모든 라우트        → X-Internal-Secret
```

### F514 후 worker 인증 레이어 (3-layer)
```
GET /health            → 인증 없음 (unchanged)
POST /internal/*       → X-Internal-Secret (unchanged, queue events)
기타 모든 라우트        → CF Access JWT 필수 (신규)
  └ + 기존 RBAC checkPermission (unchanged)
```

### SSOT 추출 대상
- `svc-skill/src/routes/auth.ts` `decodeCfJwt()` → `packages/utils/src/cf-access-jwt.ts`로 이동
- `apps/app-web/src/lib/auth.ts` `parseCfJwt()` — 클라이언트 전용, 변경 없음

## 구현 범위

### 신규 파일
- `packages/utils/src/cf-access-jwt.ts` — SSOT server-side JWT helper
- `packages/utils/src/__tests__/cf-access-jwt.test.ts` — 단위 테스트

### 수정 파일 (7개 worker index.ts)
- `services/svc-ingestion/src/index.ts`
- `services/svc-extraction/src/index.ts`
- `services/svc-policy/src/index.ts`
- `services/svc-ontology/src/index.ts`
- `services/svc-skill/src/index.ts`
- `services/svc-queue-router/src/index.ts`
- `services/svc-mcp-server/src/index.ts`

### 수정 파일 (utils 인덱스)
- `packages/utils/src/index.ts` — cf-access-jwt export 추가

## 설계 명세

### cf-access-jwt.ts API
```ts
export interface CfAccessJwtClaims {
  sub: string;
  email: string;
  name?: string | undefined;
  exp: number;
  iat?: number | undefined;
  iss?: string | undefined;
  aud?: string | string[] | undefined;
}

// JWT 디코딩 (서명 검증 없음, CF Access edge가 검증 보장)
export function decodeCfAccessJwt(token: string): CfAccessJwtClaims | null

// 요청에서 JWT 추출 및 만료 검사
// 유효 → claims 반환, 없거나 만료 → null
export function extractCfAccessJwtClaims(request: Request): CfAccessJwtClaims | null

// 미들웨어 진입점: 유효하면 null 반환, 무효면 401 Response 반환
export function requireCfAccessJwt(request: Request): Response | null
```

### Worker 미들웨어 패턴 (공통)
```ts
// 외부 라우트: CF Access JWT 필수 (internal, health 제외)
if (!path.startsWith("/internal/") && path !== "/health") {
  const jwtDenied = requireCfAccessJwt(request);
  if (jwtDenied) return jwtDenied;
}
```

### svc-skill 특이사항
- `/auth/me` → JWT 검증 계속 (기존 `handleGetMe`에서 수행, 중복 호출 방지)
- `svc-skill/routes/auth.ts`의 인라인 `decodeCfJwt` → utils helper로 교체

## DoD

| # | 항목 | 완료 기준 |
|---|------|----------|
| 1 | utils JWT helper SSOT | `cf-access-jwt.ts` 신설, `index.ts` export |
| 2 | 7-worker middleware | 모든 worker entry 적용 |
| 3 | CfRole→Role 매핑 활용 | svc-skill `/auth/me` claims → D1 role 조회 (기존 유지) |
| 4 | 단위 test | `cf-access-jwt.test.ts` PASS |
| 5 | 실 API path verify | curl 결과 첨부 |
| 6 | reports | `reports/sprint-343-*.{md,json}` |
| 7 | Plan/Report | AIF-PLAN-120 / AIF-RPRT-125 |
| 8 | Match ≥ 90% | Gap analysis |
| 9 | Phase 3 Should S-2 | 보안 마감 선언 |

## 예상 공수

- utils helper + tests: ~30분
- 7-worker middleware: ~40분
- reports + verify: ~20분
- 합계: ~1.5h
