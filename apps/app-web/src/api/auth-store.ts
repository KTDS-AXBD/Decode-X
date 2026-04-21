// F389: DEMO_USERS 폐기 — CF Access JWT 기반 사용자 타입으로 교체

export interface CfUser {
  email: string;
  role: "executive" | "engineer" | "admin";
  status: "active" | "suspended";
  displayName?: string | undefined;
}

let currentUser: CfUser | null = null;

export function getAuthUser(): CfUser | null {
  return currentUser;
}

export function setAuthUser(user: CfUser | null): void {
  currentUser = user;
}
