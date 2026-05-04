// Static fixture for /auth/me API stub.
// Used with page.route('**/auth/me', ...) in Playwright tests.

export interface AuthMeResponse {
  email: string;
  role: "analyst" | "reviewer" | "developer" | "client" | "executive" | "engineer" | "guest";
  status: "active" | "inactive";
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
