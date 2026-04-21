-- Policy classification results for Skill bundling
-- Maps each policy to a business domain category via LLM classification
-- (Moved from services/svc-skill/migrations/ — F366 migration consolidation)

CREATE TABLE IF NOT EXISTS policy_classifications (
  policy_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  category TEXT NOT NULL,
  confidence REAL DEFAULT 0,
  classified_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (policy_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_policy_classifications_org_cat
  ON policy_classifications(organization_id, category);
