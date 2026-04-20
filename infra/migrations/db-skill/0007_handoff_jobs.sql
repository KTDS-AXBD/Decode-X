-- Sprint 215: Handoff Jobs — tracks Decode-X→Foundry-X submissions and callbacks

CREATE TABLE IF NOT EXISTS handoff_jobs (
  id TEXT PRIMARY KEY,                    -- HPK-{orgId}-{skillId}-{timestamp}
  org_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  foundry_job_id TEXT,                    -- assigned by Foundry-X on submission
  status TEXT NOT NULL DEFAULT 'pending', -- pending | submitted | completed | failed
  gate_pass INTEGER NOT NULL DEFAULT 0,  -- 1 if ai_ready_overall >= 0.75
  ai_ready_overall REAL,
  prd_title TEXT NOT NULL,
  callback_url TEXT,
  -- SyncResult (populated on callback)
  verdict TEXT,                           -- green | yellow | red
  spec_match REAL,
  code_match REAL,
  test_match REAL,
  round_trip_rate REAL,
  prototype_url TEXT,
  errors TEXT,                            -- JSON array
  warnings TEXT,                          -- JSON array
  contract_version TEXT NOT NULL DEFAULT 'FX-SPEC-003/1.0',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_handoff_jobs_skill ON handoff_jobs (org_id, skill_id);
CREATE INDEX IF NOT EXISTS idx_handoff_jobs_foundry ON handoff_jobs (foundry_job_id);
CREATE INDEX IF NOT EXISTS idx_handoff_jobs_status ON handoff_jobs (status);
