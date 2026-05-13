---
id: AIF-RPRT-125
title: "Sprint 343 F514 — CF Access JWT validate 7-worker Report"
type: report
sprint: 343
f_items: [F514]
status: DONE
created: "2026-05-13"
matchRate: 100
---

# AIF-RPRT-125 — Sprint 343 F514 Report

## 결과 요약

| 항목 | 값 |
|------|---|
| Sprint | 343 |
| F-item | F514 |
| Match Rate | **100%** |
| Tests | **463/463 PASS** (13 신규) |
| DoD | **9/9 달성** |
| Phase 3 Should S-2 | **✅ 마감** |

## 핵심 산출물

### SSOT Helper (`packages/utils/src/cf-access-jwt.ts`)
3 함수로 구성된 CF Access JWT 서버사이드 검증 유틸리티:
- `decodeCfAccessJwt` — payload base64 디코딩 (서명 미검증)
- `extractCfAccessJwtClaims` — header 추출 + 만료 검사
- `requireCfAccessJwt` — 미들웨어 가드 (null = 허용 / 401 Response = 거부)

### 7-worker 미들웨어 (일관 패턴)
```ts
// External routes: CF Access JWT required
if (!path.startsWith("/internal/")) {
  const jwtDenied = requireCfAccessJwt(request);
  if (jwtDenied) return jwtDenied;
}
```

### svc-skill auth.ts SSOT 교체
기존 인라인 `decodeCfJwt()` 제거 → `extractCfAccessJwtClaims()` utils import.
코드 중복 제거 + SSOT 완성.

## 보안 아키텍처 완성 (Phase 3 Should S-2)

```
F510 (S300) RBAC SSOT    +    F514 (S303) JWT Middleware
─────────────────────────────────────────────────────────
CfRole 4 정의            →    CF Access JWT 검증
mapCfRoleToRbacRoles()   →    JWT claim 추출 → CfRole
checkPermissionForCfRole()→   권한 매트릭스 enforcement
─────────────────────────────────────────────────────────
Phase 3 Should S-1 (F504) + S-2 (F514) 보안 마감 완결
```

## 메타 학습

1. **SSOT 추출 패턴**: `svc-skill/routes/auth.ts` 인라인 함수 → utils 공유 helper. 7-worker 중복 방지.
2. **3-layer 분리 실현**: CfRole 인증 → JWT 클레임 추출 → 권한 매트릭스 enforcement.
3. **Internal/External 경계**: `/internal/` 경로는 service binding 경유 (CF Access 미거침), JWT bypass 정당화.
4. **서명 검증 범위**: Zero Trust boundary에서 CF edge가 검증 → Worker는 presence + expiry만 검사 (cold-start 레이턴시 최소화).

## 참조

- Plan: `docs/01-plan/features/sprint-343-F514.plan.md` (AIF-PLAN-120)
- Design: `docs/02-design/features/sprint-343-F514.design.md` (AIF-DSGN-120)
- Reports: `reports/sprint-343-cf-access-jwt-2026-05-13.{md,json}`
- 의존: F510 (S300) RBAC SSOT ← → F514 JWT middleware
