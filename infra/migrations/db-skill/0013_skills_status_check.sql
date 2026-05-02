-- TD-53 해소: skills.status 6-enum CHECK 제약 표준화
-- 배경: 0001_init에 draft/published/archived 3종만 정의, CHECK 제약 없어 bundled/reviewed/superseded drift 발생
-- 사용자 결정 (세션 253): 6-status 표준화, 859 superseded migration 없이 history 보존
--
-- SQLite ALTER TABLE ADD CONSTRAINT 미지원 → CREATE → INSERT → DROP → RENAME 패턴

-- 기존 인덱스 삭제 (DROP TABLE 시 자동 삭제되지만 명시적 처리)
DROP INDEX IF EXISTS idx_skills_status;
DROP INDEX IF EXISTS idx_skills_org_status;
DROP INDEX IF EXISTS idx_skills_org_id;

CREATE TABLE skills_new (
  skill_id TEXT PRIMARY KEY,
  ontology_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  subdomain TEXT,
  language TEXT NOT NULL DEFAULT 'ko',
  version TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  policy_count INTEGER NOT NULL,
  trust_level TEXT NOT NULL,
  trust_score REAL NOT NULL,
  tags TEXT,
  author TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','reviewed','bundled','published','superseded','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  content_depth INTEGER NOT NULL DEFAULT 0,
  organization_id TEXT NOT NULL DEFAULT 'unknown',
  spec_container_id TEXT,
  document_ids TEXT
);

INSERT INTO skills_new SELECT * FROM skills;
DROP TABLE skills;
ALTER TABLE skills_new RENAME TO skills;

CREATE INDEX idx_skills_status ON skills(status);
CREATE INDEX idx_skills_org_status ON skills(organization_id, status);
CREATE INDEX idx_skills_org_id ON skills(organization_id);
