import { z } from "zod";

export const RoleSchema = z.enum([
  "Analyst",
  "Reviewer",
  "Developer",
  "Client",
  "Executive",
  "Admin",
]);

export type Role = z.infer<typeof RoleSchema>;

export const ResourceSchema = z.enum([
  "document",
  "extraction",
  "policy",
  "ontology",
  "skill",
  "audit",
  "governance",
  "analytics",
  "notification",
  "user",
  "ai_ready",
]);

export type Resource = z.infer<typeof ResourceSchema>;

export const ActionSchema = z.enum([
  "create",
  "read",
  "update",
  "delete",
  "upload",
  "download",
  "approve",
  "reject",
  "execute",
]);

export type Action = z.infer<typeof ActionSchema>;

export const AuthContextSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  role: RoleSchema,
  organizationId: z.string(),
  sessionId: z.string(),
  issuedAt: z.number(),
  expiresAt: z.number(),
});

export type AuthContext = z.infer<typeof AuthContextSchema>;

// All resources — used to grant universal read access in demo mode
const ALL_RESOURCES: Resource[] = [
  "document", "extraction", "policy", "ontology", "skill",
  "audit", "governance", "analytics", "notification", "user", "ai_ready",
];

const ALL_READ: Partial<Record<Resource, Action[]>> = Object.fromEntries(
  ALL_RESOURCES.map((r) => [r, ["read"] as Action[]]),
);

// RBAC permission matrix
// NOTE: All roles have universal read access for demo/pilot.
//       Role-specific write permissions are layered on top.
export const PERMISSIONS: Record<Role, Partial<Record<Resource, Action[]>>> = {
  Admin: {
    document: ["create", "read", "update", "delete", "upload", "download"],
    extraction: ["create", "read", "update", "delete", "execute"],
    policy: ["create", "read", "update", "delete", "approve", "reject"],
    ontology: ["create", "read", "update", "delete"],
    skill: ["create", "read", "update", "delete", "download"],
    audit: ["create", "read"],
    governance: ["create", "read", "update"],
    analytics: ["create", "read", "update", "delete"],
    notification: ["read", "update", "delete"],
    user: ["create", "read", "update", "delete"],
    ai_ready: ["read", "execute", "create"],
  },
  Analyst: {
    ...ALL_READ,
    document: ["create", "read", "update", "upload", "download"],
    extraction: ["read", "execute"],
    notification: ["read", "update"],
    ai_ready: ["read", "execute"],
  },
  Reviewer: {
    ...ALL_READ,
    policy: ["read", "approve", "reject", "update"],
    notification: ["read", "update"],
    ai_ready: ["read", "execute", "create"],
  },
  Developer: {
    ...ALL_READ,
    skill: ["read", "download"],
    notification: ["read", "update"],
    ai_ready: ["read", "create"],
  },
  Client: {
    ...ALL_READ,
  },
  Executive: {
    ...ALL_READ,
    skill: ["read", "download"],
  },
};

export function hasPermission(
  role: Role,
  resource: Resource,
  action: Action,
): boolean {
  const allowed = PERMISSIONS[role]?.[resource];
  return allowed?.includes(action) ?? false;
}

// ── F-NEW-A (S300 F510): CfUser → rbac.Role 매핑 (F493 분리 권고) ─────────
// Production CfUser 4 role을 RBAC Role 6 매트릭스로 매핑하는 SSOT layer.
// frontend(app-web)와 backend(utils) 양쪽에서 import 가능한 위치(types)에 정의.

/**
 * CfUser role (Production SSOT, `auth-store.ts`).
 * 4 role: executive | engineer | admin | guest.
 */
export type CfRole = "executive" | "engineer" | "admin" | "guest";

/**
 * CfUser 4 role → rbac.Role 6 role 매핑.
 * 매핑 근거: `docs/03-analysis/features/sprint-324-rbac-domain-decision.analysis.md` §4 (AIF-ANLS-119).
 *
 * - **executive**: 임원 대시보드 + 외부 클라이언트 뷰 → [Executive, Client]
 * - **engineer**: 개발/통합/분석/리뷰 통합 직무 → [Developer, Analyst, Reviewer]
 * - **admin**: 관리 + 임원 + 개발 통합 권한 → [Admin, Executive, Developer]
 * - **guest**: 읽기 전용 → [Client]
 */
const CF_TO_RBAC_ROLE_MAP: Record<CfRole, Role[]> = {
  executive: ["Executive", "Client"],
  engineer: ["Developer", "Analyst", "Reviewer"],
  admin: ["Admin", "Executive", "Developer"],
  guest: ["Client"],
};

export function mapCfRoleToRbacRoles(cfRole: CfRole): Role[] {
  return CF_TO_RBAC_ROLE_MAP[cfRole];
}

/**
 * CfUser role이 resource/action 권한을 보유하는지 검사 (boolean 반환).
 * 매핑된 rbac.Role 중 하나라도 권한 보유 시 true.
 *
 * **사용처**:
 * - Frontend: UI 조건부 렌더링 (RoleBasedGate 컴포넌트)
 * - Backend: 사용자 인증 미들웨어에서 권한 일괄 체크
 */
export function hasPermissionForCfRole(
  cfRole: CfRole,
  resource: Resource,
  action: Action,
): boolean {
  const rbacRoles = mapCfRoleToRbacRoles(cfRole);
  return rbacRoles.some((role) => hasPermission(role, resource, action));
}
