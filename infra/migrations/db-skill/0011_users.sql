-- F371: D1 users 테이블 신설 (AIF-REQ-036 Sprint 223)
-- IAM 체계 정식화 — Cloudflare Access + Google IdP 인증 사용자 관리

CREATE TABLE users (
  email TEXT PRIMARY KEY,
  primary_role TEXT NOT NULL CHECK (primary_role IN ('executive', 'engineer', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  last_login INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  display_name TEXT,
  metadata TEXT
);

CREATE INDEX idx_users_role_status ON users(primary_role, status);
CREATE INDEX idx_users_last_login ON users(last_login);
