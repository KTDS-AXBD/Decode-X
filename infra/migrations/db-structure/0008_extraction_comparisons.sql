-- AIF-REQ-002: Anthropic vs OpenAI extraction quality comparison
CREATE TABLE IF NOT EXISTS extraction_comparisons (
  comparison_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'general',
  chunk_count INTEGER NOT NULL DEFAULT 0,

  -- Provider A (typically anthropic)
  provider_a TEXT NOT NULL,
  model_a TEXT NOT NULL,
  result_a_json TEXT NOT NULL,
  process_count_a INTEGER NOT NULL DEFAULT 0,
  entity_count_a INTEGER NOT NULL DEFAULT 0,
  relationship_count_a INTEGER NOT NULL DEFAULT 0,
  rule_count_a INTEGER NOT NULL DEFAULT 0,
  duration_ms_a INTEGER NOT NULL DEFAULT 0,

  -- Provider B (typically openai)
  provider_b TEXT NOT NULL,
  model_b TEXT NOT NULL,
  result_b_json TEXT NOT NULL,
  process_count_b INTEGER NOT NULL DEFAULT 0,
  entity_count_b INTEGER NOT NULL DEFAULT 0,
  relationship_count_b INTEGER NOT NULL DEFAULT 0,
  rule_count_b INTEGER NOT NULL DEFAULT 0,
  duration_ms_b INTEGER NOT NULL DEFAULT 0,

  -- Comparison metrics
  overlap_entities INTEGER DEFAULT 0,
  overlap_processes INTEGER DEFAULT 0,
  jaccard_entities REAL DEFAULT 0,
  jaccard_processes REAL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comparisons_document ON extraction_comparisons(document_id);
CREATE INDEX IF NOT EXISTS idx_comparisons_org ON extraction_comparisons(organization_id);
