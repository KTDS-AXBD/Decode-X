-- ============================================================
-- LPON 온누리상품권 Skills: draft → published 전환
-- ============================================================
-- 조건: trust_score > 0 인 skills만 published 전환
-- 검증 결과: 515/859 (trust_score > 0), 344/859 (trust_score = 0)
--
-- trust_score 분포:
--   - 0:       344건 (zero — published 대상 아님)
--   - 0.49~0.7: 515건 (avg 0.345 전체, 0.576 non-zero)
--
-- 실행 방법:
--   cd services/svc-skill
--   npx wrangler d1 execute db-skill --remote --file=../../scripts/lpon-skill-publish.sql
--
-- ⚠️ 주의: domain 수정(lpon-skill-domain-fix.sql) 먼저 실행 후 이 스크립트 실행
-- ============================================================

-- 1. 수정 전 현황 확인
SELECT status, COUNT(*) as cnt,
       SUM(CASE WHEN trust_score > 0 THEN 1 ELSE 0 END) as has_trust,
       SUM(CASE WHEN trust_score = 0 THEN 1 ELSE 0 END) as zero_trust
FROM skills WHERE organization_id = 'LPON' GROUP BY status;

-- 2. draft → published (trust_score > 0 조건)
UPDATE skills
SET status = 'published',
    updated_at = datetime('now')
WHERE organization_id = 'LPON'
  AND status = 'draft'
  AND trust_score > 0;

-- 3. 수정 후 검증
SELECT status, COUNT(*) as cnt FROM skills WHERE organization_id = 'LPON' GROUP BY status;
