// Static fixture for /auth/me API stub.
// Used with page.route('**/auth/me', ...) in Playwright tests.
//
// F491 (세션 295): role 필드 SSOT — production CfUser["role"] 직접 import.
// 직전: 7-role string union 직접 정의 (analyst/reviewer/developer/client/executive/engineer/guest)
//   → CfUser는 production에서 4 role(executive/engineer/admin/guest)만 정의 → drift 위험.
// 수정: relative import로 src/api/auth-store CfUser 타입 재사용 (e2e tsconfig 미포함이라 production
//   typecheck 영향 0, Playwright tsx runtime은 relative path 정상 해석). PRD §18 5 RBAC role 분리는
//   별도 도메인 결정 (TD-XX 등록 후보).

import type { CfUser } from "../../../src/api/auth-store";

export interface AuthMeResponse {
  email: string;
  role: CfUser["role"];
  status: CfUser["status"];
  displayName?: string;
}

export const AUTH_ME_STUB: AuthMeResponse = {
  email: "e2e@test.local",
  role: "engineer",
  status: "active",
} as const;

export function makeAuthMeRoute(override?: Partial<AuthMeResponse>) {
  const body = JSON.stringify({ ...AUTH_ME_STUB, ...override });
  return (route: { fulfill: (opts: object) => Promise<void> }) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body,
    });
}
