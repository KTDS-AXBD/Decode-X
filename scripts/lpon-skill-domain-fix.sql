-- ============================================================
-- LPON 온누리상품권 Skills: domain 수정 (pension → giftvoucher)
-- ============================================================
-- 검증 결과 (2026-03-08):
--   - LPON org: 859 skills, 전부 domain='pension' & status='draft'
--   - R2 key: 859/859 정상 (missing_r2=0)
--   - Ontology ID: 859/859 정상 (missing_ontology=0)
--   - Trust score: 515/859 > 0, 344/859 = 0 (zero_trust)
--   - Trust level: 전부 'reviewed'
--   - Content depth: rich=13, medium=787, thin=59
--
-- 실행 방법:
--   cd services/svc-skill
--   npx wrangler d1 execute db-skill --remote --file=../../scripts/lpon-skill-domain-fix.sql
-- ============================================================

-- 1. 수정 전 현황 확인
SELECT domain, COUNT(*) as cnt FROM skills WHERE organization_id = 'LPON' GROUP BY domain;

-- 2. domain 수정: pension → giftvoucher
UPDATE skills
SET domain = 'giftvoucher',
    updated_at = datetime('now')
WHERE organization_id = 'LPON'
  AND domain = 'pension';

-- 3. 수정 후 검증
SELECT domain, COUNT(*) as cnt FROM skills WHERE organization_id = 'LPON' GROUP BY domain;
