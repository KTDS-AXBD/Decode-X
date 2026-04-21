// F370 + F389: CF Access JWT 기반 인증 컨텍스트
// DEMO_USERS 제거 — CF Access 인증 이후 /auth/me API로 D1 users 역할 조회

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type React from "react";
import { getCfJwtFromCookie } from "@/lib/auth";
import { setAuthUser } from "@/api/auth-store";
import type { CfUser } from "@/api/auth-store";

const API_BASE = import.meta.env['VITE_API_BASE_URL'] ?? "http://localhost:8705";

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
      // Quick check: does a CF JWT cookie exist?
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
