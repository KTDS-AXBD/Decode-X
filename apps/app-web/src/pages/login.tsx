// F389: 레거시 /login → /welcome 리다이렉트
// DEMO_USERS 기반 로그인 제거 — CF Access SSO로 전환됨

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/welcome", { replace: true });
  }, [navigate]);

  return null;
}
