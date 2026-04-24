-- Migration: 0012_ai_ready_scores
-- F356-B: AI-Ready LLM-based evaluation tables
-- ai_ready_scores: per-criterion scores (6 per skill per evaluation)
-- ai_ready_batches: batch job metadata + progress tracking

CREATE TABLE IF NOT EXISTS ai_ready_scores (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  criterion TEXT NOT NULL CHECK (criterion IN (
    'source_consistency','comment_doc_alignment','io_structure',
    'exception_handling','srp_reusability','testability'
  )),
  score REAL NOT NULL CHECK (score BETWEEN 0 AND 1),
  rationale TEXT NOT NULL,
  passed INTEGER NOT NULL CHECK (passed IN (0,1)),
  pass_threshold REAL NOT NULL DEFAULT 0.75,
  model TEXT NOT NULL CHECK (model IN ('haiku','opus','sonnet')),
  batch_id TEXT,
  evaluated_at TEXT NOT NULL,
  cost_usd REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (skill_id) REFERENCES skills(skill_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_ready_skill
  ON ai_ready_scores(skill_id, model, evaluated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_ready_batch
  ON ai_ready_scores(batch_id) WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_ready_org
  ON ai_ready_scores(organization_id, evaluated_at DESC);

CREATE TABLE IF NOT EXISTS ai_ready_batches (
  batch_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  model TEXT NOT NULL,
  parent_batch_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed','partial')),
  total_skills INTEGER NOT NULL,
  completed_skills INTEGER NOT NULL DEFAULT 0,
  failed_skills INTEGER NOT NULL DEFAULT 0,
  total_cost_usd REAL NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_ready_batches_org
  ON ai_ready_batches(organization_id, started_at DESC);
