-- F362 Sprint 219: spec_container_id 컬럼 추가
-- spec-container → skills D1 packaging pipeline 연결 추적용
ALTER TABLE skills ADD COLUMN spec_container_id TEXT;
CREATE INDEX IF NOT EXISTS idx_skills_spec_container ON skills(spec_container_id)
  WHERE spec_container_id IS NOT NULL;
