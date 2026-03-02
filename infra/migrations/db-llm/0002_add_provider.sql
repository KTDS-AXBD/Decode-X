-- Add multi-provider support to llm_cost_log
ALTER TABLE llm_cost_log ADD COLUMN provider TEXT NOT NULL DEFAULT 'anthropic';
ALTER TABLE llm_cost_log ADD COLUMN fallback_from TEXT;
CREATE INDEX IF NOT EXISTS idx_cost_log_provider ON llm_cost_log(provider);
