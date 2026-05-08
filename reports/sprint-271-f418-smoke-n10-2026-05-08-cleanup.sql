-- F438 Smoke cleanup — Sprint 271 (AIF-RPRT-069)
-- 본 SQL은 wrangler 권한 환경에서 실행:
--   cd services/svc-policy
--   npx wrangler d1 execute db-policy --remote --file ../../reports/sprint-271-f418-smoke-n10-2026-05-08-cleanup.sql

-- 대상 orgId 패턴: org-smoke-f438-* (메인 n=10 + prereq + miraeasset test 모두 포괄)
-- production data와 격리됨 (prefix `org-smoke-f438-`로 명확 분리)

DELETE FROM hitl_sessions
  WHERE policy_id IN (
    SELECT policy_id FROM policies
    WHERE organization_id LIKE 'org-smoke-f438-%'
  );

DELETE FROM policies
  WHERE organization_id LIKE 'org-smoke-f438-%';

-- Verify (expect 0):
SELECT COUNT(*) AS remaining_policies
  FROM policies
  WHERE organization_id LIKE 'org-smoke-f438-%';

-- 메인 run orgIds (10건):
--   org-smoke-f438-001 ~ org-smoke-f438-010 (58 candidates)
-- 보조 orgIds:
--   org-smoke-f438-prereq-001  (prereq single eval, lpon-charge fixture, 7 candidates)
--   org-smoke-f438-test-miraeasset  (test-miraeasset 디버그 호출, miraeasset fixture, 7 candidates)
-- 추정 총 row: 58 (main) + 7 (prereq) + 7 (miraeasset-test) = 72 policies + 72 hitl_sessions
