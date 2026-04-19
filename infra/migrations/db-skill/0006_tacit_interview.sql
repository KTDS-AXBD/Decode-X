-- Sprint 5: Tacit Interview Agent MVP (AIF-REQ-035)
CREATE TABLE IF NOT EXISTS tacit_interview_sessions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  sme_id TEXT NOT NULL,
  department TEXT,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  fragment_count INTEGER NOT NULL DEFAULT 0,
  avg_confidence REAL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS tacit_spec_fragments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES tacit_interview_sessions(id),
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  spec_content TEXT NOT NULL,
  spec_type TEXT NOT NULL,
  confidence REAL NOT NULL,
  policy_code TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tif_session ON tacit_spec_fragments(session_id);
CREATE INDEX IF NOT EXISTS idx_tif_confidence ON tacit_spec_fragments(confidence);
