import {
  type Role,
  type Resource,
  type Action,
  type CfRole,
  RoleSchema,
  hasPermission,
  hasPermissionForCfRole,
  mapCfRoleToRbacRoles,
} from "@ai-foundry/types";
import { forbidden } from "./response.js";

// Re-export for backward compat (callers may import from utils)
export type { CfRole };
export { mapCfRoleToRbacRoles, hasPermissionForCfRole };

export interface RbacContext {
  userId: string;
  role: Role;
  organizationId: string;
}

/**
 * Extract RBAC context from request headers.
 * Returns null if headers are missing (caller should skip RBAC check).
 */
export function extractRbacContext(request: Request): RbacContext | null {
  const userId = request.headers.get("X-User-Id");
  const roleRaw = request.headers.get("X-User-Role");
  const organizationId = request.headers.get("X-Organization-Id");

  if (!userId || !roleRaw || !organizationId) {
    return null;
  }

  const parsed = RoleSchema.safeParse(roleRaw);
  if (!parsed.success) {
    return null;
  }

  return { userId, role: parsed.data, organizationId };
}

/**
 * Check if the given role has permission for the resource/action.
 * Uses local RBAC matrix (no network call).
 * Returns null if allowed, or a 403 Response if denied.
 */
export function checkPermission(
  role: Role,
  resource: Resource,
  action: Action,
): Response | null {
  if (!hasPermission(role, resource, action)) {
    return forbidden(`Role '${role}' cannot '${action}' on '${resource}'`);
  }
  return null;
}

/**
 * CfUser role 기준으로 권한을 검사한다 — 매핑된 rbac.Role 중 하나라도 권한 보유 시 PASS.
 * F-NEW-A (S300 F510): CfUser → rbac.Role 매핑 layer 적용으로 Production 인증과 권한 layer 분리.
 *
 * @param cfRole CfUser 4 role (Production SSOT)
 * @param resource RBAC Resource
 * @param action RBAC Action
 * @returns null 허용, 403 Response 거부 (모든 매핑 role이 권한 없음)
 */
export function checkPermissionForCfRole(
  cfRole: CfRole,
  resource: Resource,
  action: Action,
): Response | null {
  const rbacRoles = mapCfRoleToRbacRoles(cfRole);
  const allowed = rbacRoles.some((role) => hasPermission(role, resource, action));
  if (!allowed) {
    return forbidden(`CfRole '${cfRole}' (mapped to [${rbacRoles.join(", ")}]) cannot '${action}' on '${resource}'`);
  }
  return null;
}

// `hasPermissionForCfRole` (boolean variant) — see `@ai-foundry/types/rbac` (SSOT).
// Re-exported above (line 15) for backward compat.
