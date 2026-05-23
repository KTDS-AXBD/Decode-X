# Sprint 394 Design — F566 DJ Academy

## §1 도메인 개요
DJ Academy (DJ 학원) — 학원 모델 + 월간 멤버십 + 장비 임대 + 강사 1:1/그룹 lesson + 자가 연습 booking + level 진급 시스템

## §2 비즈니스 룰 (6 BLs)
- DJ-001: 동시 active deck 한도 (ThresholdCheck, MAX_CONCURRENT_DECKS_PER_ACADEMY)
- DJ-002: 회원 월간 lesson 한도 (ThresholdCheck, var-vs-var, lessonLimit)
- DJ-003: lesson 예약 atomic (AtomicTransaction, dj_lessons+deck_schedules+lesson_payments+equipment_rental)
- DJ-004: lesson 상태 전환 (StatusTransition, scheduled→in_progress→completed/no_show/cancelled)
- DJ-005: in_progress lesson auto-complete batch (StatusTransition batch)
- DJ-006: lesson 환불 atomic (AtomicTransaction, 월간 구독 환불 + 장비 파손 변상 정책)

## §3 파일 매핑
- 반제품-스펙/pilot-lpon-cancel/working-version/src/domain/dj-academy.ts
- .decode-x/spec-containers/dj-academy/provenance.yaml
- .decode-x/spec-containers/dj-academy/rules/dj-academy-rules.md
- .decode-x/spec-containers/dj-academy/tests/DJ-001.yaml
- scripts/divergence/domain-source-map.ts (DOMAIN_MAP 97번째 entry)
- packages/utils/src/divergence/rules-parser.ts (DJ prefix)
- packages/utils/src/divergence/bl-detector.ts (REGISTRY DJ-001~006)
- packages/utils/test/bl-detector.test.ts (5축 test)

## §4 상수
- MAX_CONCURRENT_DECKS_PER_ACADEMY = 8 (DJ 학원 동시 active deck 한도)
- lesson 상태: scheduled → in_progress → completed / no_show / cancelled
