-- TD-53 해소: skills.status 6-enum 표준화
-- 배경: 0001_init에 draft/published/archived 3종만 정의, CHECK 제약 없어 bundled/reviewed/superseded drift 발생
-- 사용자 결정 (세션 253): 6-status 표준화, 859 superseded migration 없이 history 보존
--
-- ⚠️ 첫 시도 실패 (Sprint 241 deploy run 25255151050, FOREIGN KEY constraint failed):
-- SQLite ALTER 우회 패턴(CREATE→INSERT→DROP→RENAME)은 child tables(skill_downloads/skill_evaluations/ai_ready_scores)가
-- skills.skill_id를 FK로 참조해 DROP TABLE skills 시점에 FK 위반.
-- D1는 PRAGMA foreign_keys/defer_foreign_keys를 migration 안에서 효과적으로 제어 불가.
--
-- ✅ 재작성 (Sprint 241 후속 hotfix): TRIGGER 기반 CHECK 동등 enforcement
-- - 테이블 재구성 없음 → FK 영향 0
-- - 데이터 손실 가능성 0 (production 3,983 row 그대로)
-- - INSERT/UPDATE OF status 시 6-enum 검증 (CHECK 제약과 동일 효과)
-- - 단점: column DEFAULT 변경 안 됨 (기존 'draft' 유지, 무관)

-- 기존 인덱스 정리 (재생성을 위함, 순서 무관)
DROP INDEX IF EXISTS idx_skills_status;
DROP INDEX IF EXISTS idx_skills_org_status;
DROP INDEX IF EXISTS idx_skills_org_id;

-- INSERT 검증 트리거 — 잘못된 status 값으로 INSERT 시 ABORT
CREATE TRIGGER IF NOT EXISTS skills_status_check_insert
BEFORE INSERT ON skills
FOR EACH ROW
WHEN NEW.status NOT IN ('draft','reviewed','bundled','published','superseded','archived')
BEGIN
  SELECT RAISE(ABORT, 'invalid status — must be one of: draft, reviewed, bundled, published, superseded, archived');
END;

-- UPDATE OF status 검증 트리거 — 잘못된 값으로 UPDATE 시 ABORT
CREATE TRIGGER IF NOT EXISTS skills_status_check_update
BEFORE UPDATE OF status ON skills
FOR EACH ROW
WHEN NEW.status NOT IN ('draft','reviewed','bundled','published','superseded','archived')
BEGIN
  SELECT RAISE(ABORT, 'invalid status — must be one of: draft, reviewed, bundled, published, superseded, archived');
END;

-- 인덱스 재생성 (status 필터 + org+status 복합 + org-only 가속)
CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(status);
CREATE INDEX IF NOT EXISTS idx_skills_org_status ON skills(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_skills_org_id ON skills(organization_id);
