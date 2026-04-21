import { z } from "zod";

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
