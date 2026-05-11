---
title: Sprint 324 F493 — RBAC 도메인 결정 (Production CfUser 4 role SSOT)
project: Decode-X
type: Analysis
docCode: AIF-ANLS-119
sprint: 324
fitem: F493
sessionId: 296
author: Sinclair Seo
created: 2026-05-12
updated: 2026-05-12
status: DONE
related:
  - F491 (Sprint 295 RBAC role SSOT — TD-41 fix-forward 정리)
  - PRD §18 (RBAC Roles)
  - packages/types/src/rbac.ts
  - packages/types/src/users.ts
  - apps/app-web/src/api/auth-store.ts
---

# Sprint 324 F493 — RBAC 도메인 결정 분석

## 1) 배경

세션 295 F491 RBAC role SSOT 정합화 작업 중 **3 모델 불일치** 발견:

- **CfUser** (`apps/app-web/src/api/auth-store.ts:5`) — Production 운영 4 role: `executive | engineer | admin | guest`
- **UserRole** (`packages/types/src/users.ts:3`) — Admin UI 관리용 3 role: `executive | engineer | admin` (guest 제외)
- **Role** (`packages/types/src/rbac.ts:3`) — PRD §18 RBAC 6 role: `Analyst | Reviewer | Developer | Client | Executive | Admin`

F491에서는 e2e auth-me-response 7-role string union을 CfUser['role'] 4-role relative import로 단순 정합화했으나, 위 3 모델 도메인 결정은 단순 fix-forward 범위 초과 → 별도 Sprint(F493)로 분리하여 결정 문서화.

세션 296 사용자 결정 (AskUserQuestion, 2026-05-12):
> **"Production CfUser 4 role 기준 (Recommended)"** — executive/engineer/admin/guest 구현 기준으로 PRD §18 문서를 업데이트.

본 문서는 결정 근거 + 매핑 테이블 + 후속 권고를 명시한다.

---

## 2) 3 모델 실측 정밀 분석

### 2.1 CfUser (Production 운영 SSOT)

```typescript
// apps/app-web/src/api/auth-store.ts:3-8
export interface CfUser {
  email: string;
  role: "executive" | "engineer" | "admin" | "guest";
  status: "active" | "suspended";
  displayName?: string | undefined;
}
```

- **사용처**: AuthContext, Cloudflare Access JWT 토큰, AuthMeResponse, e2e auth-me-response fixture (F491 정합화 후)
- **F389 (Sprint 226~)** DEMO_USERS 폐기 + CF Access JWT 기반 사용자 타입으로 도입
- **현재 인증·세션 라이프사이클의 단일 진입점** — Sprint 234 F405 CF Access Application 등록 + Sprint 241 B-02~B-04 chain fix 이후 production에서 actively 사용 중

### 2.2 UserRole (Admin UI 관리용)

```typescript
// packages/types/src/users.ts:3
export const UserRoleSchema = z.enum(["executive", "engineer", "admin"]);
```

- **사용처**:
  - `apps/app-web/src/components/admin/AuditLog.tsx:39` — Audit log filter dropdown
  - `apps/app-web/src/components/admin/UsersManager.tsx:31` — User management Role 변경 옵션
  - `AuthMeResponseSchema` (users.ts:19)
- **guest 제외 이유**: Admin이 관리 가능한 User는 guest가 아닌 정식 등록 사용자만 — Admin UI에서 guest를 부여할 수 없음
- **결과**: CfUser 4 role 부분집합 (3 role)으로 의도적 축소

### 2.3 rbac.Role (PRD §18 RBAC 권한 매트릭스)

```typescript
// packages/types/src/rbac.ts:3-10
export const RoleSchema = z.enum([
  "Analyst",     // 문서 업로드 / 파이프라인 실행
  "Reviewer",    // HITL 정책 검토
  "Developer",   // Skill 통합
  "Client",      // 읽기 전용
  "Executive",   // 대시보드
  "Admin",       // 관리자 (PRD §18 미포함, 운영상 추가)
]);
```

- **사용처**: Resource × Action × Role 권한 매트릭스 (`packages/utils/src/rbac.ts checkPermission`)
- **PRD 출처**: AI Foundry PRD §18 5 RBAC (Analyst/Reviewer/Developer/Client/Executive) + 운영 Admin
- **현재 상태**: Sprint 223+ Phase 3 도입, 권한 체크 자체는 시스템적으로 적용 중이나 **CfUser 4 role → rbac.Role 6 role 매핑 부재** → 실 인증 사용자가 어떤 권한을 가지는지 미정의

---

## 3) 핵심 결정

**Production CfUser 4 role을 SSOT(Single Source of Truth)로 채택**한다.

### 3.1 결정 근거

| 기준 | CfUser 4 (채택) | PRD §18 5 (대안) |
|------|:---------------:|:----------------:|
| 실 운영 사용 | ✅ active production | ❌ 매트릭스만 정의 |
| 인증 라이프사이클 통합 | ✅ CF Access JWT | ❌ 별도 매핑 필요 |
| 코드 마이그레이션 비용 | 낮음 (PRD 문서만 갱신) | 높음 (CfUser 4 → 5 확장 + UI/audit/auth-store 전수 변경) |
| 운영 직무 매칭 | ✅ executive(임원)/engineer(개발자)/admin(관리자)/guest(미인증 데모) | 부분적 (Analyst 분류가 한국 KT DS 직무체계와 비매칭) |
| 향후 확장성 | ✅ 매핑 테이블로 RBAC 6 role 흡수 가능 | — |

### 3.2 도메인 결정 본문

- **인증 SSOT**: `CfUser.role` (`"executive" | "engineer" | "admin" | "guest"`)
- **권한 SSOT**: `rbac.Role` 6 role 권한 매트릭스는 유지 (Resource × Action × Role 체계는 무결성)
- **매핑 규칙**: CfUser → rbac.Role의 1:N 멤버십 매핑 (다음 §4 매핑 테이블 참조)
- **UserRole 정리**: `packages/types/src/users.ts` UserRole(3 role) → CfUser 4 role과 통일 (guest 추가) 또는 Admin UI 의도적 축소 명시 유지 (다음 §5 권고)

---

## 4) 매핑 테이블 (CfUser 4 → rbac.Role 6)

| CfUser.role | 의미 | rbac.Role 권한 매핑 (1:N) | 비고 |
|-------------|------|----------------------------|------|
| `executive` | 임원 / 본부장 | `Executive`, `Client` | 대시보드 + 읽기 전용 |
| `engineer` | 컨설팅 엔지니어 | `Developer`, `Analyst`, `Reviewer` | Skill 통합 + 문서 업로드 + HITL 검토 (현 KT DS AX 컨설팅팀 단일 트랙) |
| `admin` | 시스템 관리자 | `Admin`, `Executive`, `Developer` | 전 권한 + 대시보드 + Skill 관리 |
| `guest` | 미인증 데모 | `Client` (읽기 전용) | DEMO_MODE 또는 공개 데모 화면만 |

### 4.1 매핑 원칙

1. **1 CfUser.role → N rbac.Role**: 단일 인증 role에서 다수 권한 부여 가능 (예: engineer는 Analyst + Reviewer + Developer 모두)
2. **권한 분리 원칙 유지**: rbac.ts Resource × Action 매트릭스는 변경 없음 — 본 결정은 인증 role → 권한 role 매핑만 명시
3. **guest = Client(읽기 전용)**: 미인증 데모 사용자는 모든 변경 작업 차단 — 공개 데모 화면만 접근

### 4.2 의존 코드 위치 (후속 마이그레이션 시 변경 대상)

| 위치 | 현재 | 변경 권고 |
|------|------|----------|
| `packages/utils/src/rbac.ts checkPermission` | `Role` 직접 비교 | helper `mapCfRoleToRbacRoles(cfRole: CfUser["role"]): Role[]` 추가 |
| `apps/app-web/src/contexts/AuthContext.tsx` | `user.role` (CfUser) | 권한 체크 시 매핑 helper 호출 |
| `services/svc-*/src/auth/*` | INTERNAL_API_SECRET only | 향후 CF Access JWT validate + role 매핑 |

> 본 Sprint 324는 docs-only — 코드 마이그레이션은 별도 Sprint로 분리.

---

## 5) PRD §18 갱신 권고

PRD §18 "RBAC Roles" 섹션을 다음 구조로 재작성 권고:

```markdown
## §18 RBAC Roles

### 18.1 인증 SSOT (CfUser)
사용자 인증 layer의 단일 권한 마커. CF Access JWT 기반.
- `executive` — 임원/본부장 (대시보드 + 읽기)
- `engineer` — 컨설팅 엔지니어 (Skill 통합 + 문서 업로드 + HITL 검토)
- `admin` — 시스템 관리자 (전 권한)
- `guest` — 미인증 데모 (읽기 전용)

### 18.2 권한 매트릭스 (rbac.Role)
Resource × Action × Role 권한 체크용. checkPermission() helper 사용.
- `Analyst` — 문서 업로드, 파이프라인 실행 (engineer 매핑)
- `Reviewer` — HITL 정책 검토 (engineer 매핑)
- `Developer` — Skill 통합 (engineer/admin 매핑)
- `Client` — 읽기 전용 (executive/guest 매핑)
- `Executive` — 대시보드 (executive/admin 매핑)
- `Admin` — 관리자 전 권한 (admin 매핑)

### 18.3 매핑 (Source: AIF-ANLS-119 sprint-324)
§4 매핑 테이블 동기 유지.
```

---

## 6) 후속 권고 (별도 Sprint 분리)

본 Sprint 324(docs-only)는 도메인 결정 + 매핑 명시만 수행. 다음 코드 마이그레이션은 별도 F-item으로 분리:

| 후속 F-item | 작업 | 추정 |
|-------------|------|------|
| F-NEW-A | `packages/utils/src/rbac.ts`에 `mapCfRoleToRbacRoles(cfRole): Role[]` helper 추가 + checkPermission 변경 | ~1h |
| F-NEW-B | `apps/app-web/src/contexts/AuthContext.tsx`에 권한 helper 적용 + RoleBasedGate 컴포넌트화 | ~1h |
| F-NEW-C | `packages/types/src/users.ts` UserRole 결정 — guest 추가 vs Admin UI 의도적 축소 명시 유지 | ~30분 |
| F-NEW-D | PRD §18 본문 실 갱신 (`docs/AI_Foundry_PRD_TDS_v0.7.5.docx` 또는 SPEC §18 신설) | ~1h |
| F-NEW-E | services/svc-* CF Access JWT validate + role 매핑 적용 (Phase 3 후속) | ~3h |

---

## 7) DoD 충족

- [x] 3 모델 비교 분석 본문 (§2)
- [x] Production CfUser 4 role SSOT 결정 + 근거 (§3)
- [x] CfUser 4 → rbac.Role 6 매핑 테이블 (§4)
- [x] PRD §18 갱신 권고 (§5)
- [x] 후속 마이그레이션 F-item 분리 권고 (§6)
- [x] 코드 변경 0 (docs-only 약속 충족)

---

## 8) 메타 학습

- **3 모델 불일치 패턴 정착**: 1 도메인(권한)에 3 모델 분기되면 단순 fix-forward 범위 초과 → 도메인 결정 별도 Sprint 분리가 표준 절차로 정착 (F491 발견 → F493 결정)
- **결정 vs 마이그레이션 분리**: 도메인 결정(docs-only)과 코드 마이그레이션(F-NEW-A~E)을 분리하면 결정 비용 + 변경 충돌 위험 양쪽 최소화
- **인증 vs 권한 분리 명시화 가치**: CfUser(인증)와 rbac.Role(권한)을 동일 layer로 혼동하면 새 직무 추가 시 양쪽 모두 변경 — 매핑 helper 도입이 SSOT 분리의 핵심
- **Master inline 19회 연속 회피 패턴 유지** (S253~S322+S324) — autopilot Production Smoke Test 14회차 변종 회피 + docs-only Sprint는 hallucination 위험 0건

---

**작성**: Sinclair Seo (2026-05-12, 세션 296, Master inline ~1h, Match 100%)
