-- 0003_report_system.sql
-- 분석 보고서 동적 콘텐츠 관리 + 버전별 스냅샷 시스템
-- AIF-REQ-011: 하드코딩 → API/DB 동적화

-- Report sections: org별 보고서 섹션 콘텐츠
CREATE TABLE IF NOT EXISTS report_sections (
  section_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  section_key TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  icon_name TEXT,
  content_type TEXT NOT NULL CHECK(content_type IN (
    'evaluation_table', 'finding_cards', 'metric_grid',
    'data_table', 'task_list', 'policy_examples', 'text_block',
    'comparison_table', 'framing_block'
  )),
  content TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(organization_id, section_key)
);

-- Report snapshots: 버전별 보고서 전체 캡처
CREATE TABLE IF NOT EXISTS report_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  version TEXT NOT NULL,
  title TEXT,
  sections_json TEXT NOT NULL,
  metrics_json TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(organization_id, version)
);

CREATE INDEX IF NOT EXISTS idx_report_sections_org ON report_sections(organization_id);
CREATE INDEX IF NOT EXISTS idx_report_snapshots_org ON report_snapshots(organization_id, version);
