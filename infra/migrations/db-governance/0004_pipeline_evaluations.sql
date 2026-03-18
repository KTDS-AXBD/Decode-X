-- Pipeline Quality Evaluation results
-- 모든 eval stage (mechanical, semantic, consensus, ambiguity) 결과를 통합 저장
CREATE TABLE IF NOT EXISTS pipeline_evaluations (
  eval_id        TEXT PRIMARY KEY,
  target_type    TEXT NOT NULL CHECK(target_type IN ('policy', 'skill', 'document')),
  target_id      TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  stage          TEXT NOT NULL CHECK(stage IN ('mechanical', 'semantic', 'consensus', 'ambiguity', 'brownfield')),
  verdict        TEXT NOT NULL CHECK(verdict IN ('pass', 'fail', 'needs_review', 'consensus_approve', 'consensus_reject', 'consensus_split', 'skipped')),
  score          REAL NOT NULL CHECK(score >= 0 AND score <= 1),
  issues_json    TEXT NOT NULL DEFAULT '[]',
  evaluator      TEXT NOT NULL,
  duration_ms    INTEGER NOT NULL DEFAULT 0,
  metadata_json  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 인덱스: target별 조회 (HITL 세션에서 eval 결과 참조)
CREATE INDEX IF NOT EXISTS idx_pe_target
  ON pipeline_evaluations(target_type, target_id);

-- 인덱스: org + stage별 집계 (대시보드)
CREATE INDEX IF NOT EXISTS idx_pe_org_stage
  ON pipeline_evaluations(organization_id, stage, created_at);

-- 인덱스: verdict 필터 (needs_review 건만 조회)
CREATE INDEX IF NOT EXISTS idx_pe_verdict
  ON pipeline_evaluations(verdict, created_at);
