const API_SECRET =
  (import.meta.env["VITE_INTERNAL_SECRET"] as string | undefined) ??
  "dev-secret";

export function buildHeaders(organizationId: string): Record<string, string> {
  return {
    "X-Internal-Secret": API_SECRET,
    "X-User-Id": "demo-user",
    "X-User-Role": "Developer",
    "X-Organization-Id": organizationId,
    "Content-Type": "application/json",
  };
}
