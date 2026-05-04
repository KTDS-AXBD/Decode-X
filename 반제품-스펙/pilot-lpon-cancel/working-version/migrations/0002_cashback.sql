-- BL-028: cashback 추적 컬럼 추가 (Sprint 251 F359)
-- 환불 제외금액 산정 시 캐시백 사용분 참조용
ALTER TABLE vouchers ADD COLUMN cashback_amount INTEGER NOT NULL DEFAULT 0;
