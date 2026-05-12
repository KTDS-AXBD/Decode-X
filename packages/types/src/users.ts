import { z } from "zod";

/**
 * UserRole — Admin UI 관리용 3 role (CfUser 4 role의 의도적 축소).
 *
 * **F-NEW-C 결정 (S300 F510, AIF-ANLS-119 §6 후속)**:
 * `guest` 의도적 축소 유지 — Admin UI(UsersManager / AuditLog)에서 Admin이 관리 가능한
 * User는 정식 등록 사용자(executive/engineer/admin)만이며, guest는 CF Access JWT
 * 익명/외부 접근 단계에서 결정되는 transient role이므로 User 테이블에 영속화 안 됨.
 *
 * **계층 분리**:
 * - **CfRole 4 (인증 layer)**: executive | engineer | admin | guest — Production SSOT (`auth-store.ts`)
 * - **UserRole 3 (관리 layer)**: executive | engineer | admin — Admin UI 관리 가능 범위
 * - **rbac.Role 6 (권한 layer)**: Analyst/Reviewer/Developer/Client/Executive/Admin — Resource × Action 매트릭스
 *
 * **차기 대안 (deferred)**: Admin UI에서도 guest 표시가 필요하면 `UserRoleWithGuestSchema` 별도 정의.
 * 현 시점 운영 요구 없음 → 3 role 유지.
 *
 * 참조: `docs/03-analysis/features/sprint-324-rbac-domain-decision.analysis.md` (AIF-ANLS-119, S296 F493)
 */
export const UserRoleSchema = z.enum(["executive", "engineer", "admin"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  email: z.string().email(),
  primaryRole: UserRoleSchema,
  status: z.enum(["active", "suspended"]).default("active"),
  lastLogin: z.number().int().nullable(),
  createdAt: z.number().int(),
  displayName: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type User = z.infer<typeof UserSchema>;

export const AuthMeResponseSchema = z.object({
  email: z.string().email(),
  role: UserRoleSchema,
  status: z.enum(["active", "suspended"]),
  isNew: z.boolean(),
});
export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;

export const AuditLogEntrySchema = z.object({
  id: z.number().int().optional(),
  actorEmail: z.string().email(),
  actorRole: UserRoleSchema,
  action: z.string().min(1),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.number().int().optional(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;
