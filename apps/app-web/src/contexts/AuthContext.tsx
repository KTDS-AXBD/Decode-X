// F370 + F389: CF Access JWT 기반 인증 컨텍스트
// DEMO_USERS 제거 — CF Access 인증 이후 /auth/me API로 D1 users 역할 조회

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type React from "react";
import { getCfJwtFromCookie } from "@/lib/auth";
import { setAuthUser } from "@/api/auth-store";
import type { CfUser } from "@/api/auth-store";

const API_BASE = import.meta.env['VITE_API_BASE_URL'] ?? "http://localhost:8705";
// CI E2E demo mode — never set in production builds
const VITE_DEMO_MODE = (import.meta.env as Record<string, string>)['VITE_DEMO_MODE'];
const DEMO_STORAGE_KEY = '__demo_user__';

// F401 fix (Sprint 227 follow-up): module-level ?demo=1 capture.
// Root `/?demo=1` → `<Navigate to="/executive/overview" replace />` drops the query string
// before AuthProvider mounts. Set localStorage here so loadUser() finds the stub user.
if (typeof window !== 'undefined' && VITE_DEMO_MODE === '1') {
  const demoParam = new URLSearchParams(window.location.search).get('demo');
  if (demoParam === '1' && !window.localStorage.getItem(DEMO_STORAGE_KEY)) {
    const stubUser: CfUser = { email: 'e2e@test', role: 'engineer', status: 'active' };
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(stubUser));
  }
}

interface AuthContextType {
  user: CfUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => void;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchUserFromApi(): Promise<CfUser | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { email: string; role: string; status: string };
    return {
      email: data.email,
      role: data.role as CfUser["role"],
      status: data.status as CfUser["status"],
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CfUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    setIsLoading(true);
    try {
      // Demo mode (CI E2E): VITE_DEMO_MODE=1 + ?demo=1 init OR localStorage session
      if (VITE_DEMO_MODE === '1') {
        const stored = localStorage.getItem(DEMO_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as CfUser;
          setUser(parsed);
          setAuthUser(parsed);
          return;
        }
        const isDemoInit = new URLSearchParams(window.location.search).get('demo') === '1';
        if (isDemoInit) {
          const stubUser: CfUser = { email: 'e2e@test', role: 'engineer', status: 'active' };
          localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(stubUser));
          setUser(stubUser);
          setAuthUser(stubUser);
          return;
        }
      }

      // Regular CF Access JWT flow
      const claims = getCfJwtFromCookie();
      if (!claims) {
        setUser(null);
        setAuthUser(null);
        return;
      }

      // CF JWT present — fetch role from D1 via svc-skill /auth/me
      const cfUser = await fetchUserFromApi();
      setUser(cfUser);
      setAuthUser(cfUser);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const logout = useCallback(() => {
    setUser(null);
    setAuthUser(null);
    // CF Access logout endpoint clears the JWT cookie at edge
    window.location.href = "/cdn-cgi/access/logout";
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: user !== null, isLoading, logout, refetch: loadUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
