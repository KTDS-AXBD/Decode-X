// F384: Guest/Demo 모드 — 접근 제어 헬퍼

const GUEST_BLOCKED_ROUTES = [
  '/upload',
  '/source-upload',
  '/hitl',
  '/fact-check',
  '/gap-analysis',
  '/api-console',
  '/admin',
  '/engineer/workbench',
];

export function isGuestBlockedRoute(pathname: string): boolean {
  return GUEST_BLOCKED_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + '/'),
  );
}

const DEMO_STORAGE_KEY = '__demo_user__';

export function isDemoGuest(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage.getItem(DEMO_STORAGE_KEY);
  if (!stored) return false;
  try {
    const parsed = JSON.parse(stored) as { role?: string };
    return parsed.role === 'guest';
  } catch {
    return false;
  }
}
