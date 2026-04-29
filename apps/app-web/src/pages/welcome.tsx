// F372: Guest 랜딩 페이지 — 3줄 요약 + Google 로그인 CTA
// CF Access 인증 후 자동으로 원래 페이지로 리다이렉트됨

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function WelcomePage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleGoogleLogin = () => {
    // CF Access middleware intercepts protected paths and emits a 302 with
    // the dispatcher URL containing the per-request kid (AUD) and signed meta
    // JWT. Building that URL client-side is impossible (the meta JWT is
    // signed by CF edge), so navigate to "/" and let the middleware emit the
    // correct dispatch. Verified: GET /  →  302  https://<team>.cloudflareaccess.com/cdn-cgi/access/login/<host>?kid=<AUD>&meta=<JWT>&redirect_url=/
    window.location.href = "/";
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div className="w-full max-w-md text-center space-y-8">
        <div>
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center"
            style={{ backgroundColor: "var(--primary)" }}
          >
            <span
              className="text-2xl font-bold"
              style={{ color: "var(--primary-foreground)" }}
            >
              AI
            </span>
          </div>
          <h1
            className="text-3xl font-bold mb-3"
            style={{ color: "var(--foreground)" }}
          >
            Decode-X
          </h1>
          <p className="text-base" style={{ color: "var(--muted-foreground)" }}>
            기존 시스템·SI 산출물에서 기능 스펙을 역추출하는 디코딩 엔진
          </p>
        </div>

        <div
          className="rounded-xl p-6 space-y-3 text-left"
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--foreground)" }}>
            <span className="font-semibold">본부장</span>을 위한 Foundry-X
            핸드오프 실사례 타임라인
          </p>
          <p className="text-sm" style={{ color: "var(--foreground)" }}>
            <span className="font-semibold">엔지니어</span>를 위한
            Spec→Source 3클릭 역추적 워크벤치
          </p>
          <p className="text-sm" style={{ color: "var(--foreground)" }}>
            <span className="font-semibold">관리자</span>를 위한 역할 관리 및
            감사 로그
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          className="w-full py-3 px-6 rounded-lg font-semibold text-base transition-opacity hover:opacity-90 flex items-center justify-center gap-3"
          style={{
            backgroundColor: "var(--primary)",
            color: "var(--primary-foreground)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Google로 로그인
        </button>

        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          KTDS AX BD팀 전용 — Cloudflare Access SSO로 보안 인증됩니다
        </p>
      </div>
    </div>
  );
}
