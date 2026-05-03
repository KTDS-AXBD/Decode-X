-- F418 / TD-58: PolicyCandidateSchema exception 필드 정식 추가
-- D1 SSOT 정렬, 신규 inference 시점부터 exception 자연 채움.
-- 기존 정책은 NULL — backfill script(scripts/policy/backfill-exception.ts)로 채움.
--
-- SQLite는 ADD COLUMN을 native 지원 (락/장애 위험 낮음).
-- IF NOT EXISTS는 SQLite ADD COLUMN에 미지원이므로,
-- 사전 PRAGMA table_info(policies)로 컬럼 부재 확인 후 적용 권장.

ALTER TABLE policies ADD COLUMN exception TEXT;
