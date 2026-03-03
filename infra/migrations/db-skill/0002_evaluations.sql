-- Phase 3: Skill policy evaluation records
-- Tracks each LLM evaluation for audit, benchmarking, and analytics
CREATE TABLE IF NOT EXISTS skill_evaluations (
  evaluation_id TEXT PRIMARY KEY,
  skill_id      TEXT NOT NULL,
  policy_code   TEXT NOT NULL,
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  input_context TEXT NOT NULL,
  input_params  TEXT,
  result        TEXT NOT NULL,
  confidence    REAL NOT NULL,
  reasoning     TEXT,
  latency_ms    INTEGER NOT NULL,
  token_count   INTEGER,
  evaluated_by  TEXT NOT NULL DEFAULT 'anonymous',
  evaluated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (skill_id) REFERENCES skills(skill_id)
);

CREATE INDEX IF NOT EXISTS idx_eval_skill ON skill_evaluations(skill_id);
CREATE INDEX IF NOT EXISTS idx_eval_provider ON skill_evaluations(provider);
CREATE INDEX IF NOT EXISTS idx_eval_policy ON skill_evaluations(policy_code);
