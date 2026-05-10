---
id: AIF-DESIGN-110
sprint: 312
feature: F478
plan: AIF-PLAN-110
title: Fitness 42번째 도메인 신규 — 피트니스 산업 Design
status: active
created: 2026-05-10
---

# F478 Design — AIF-DESIGN-110

## §1 목표

42번째 도메인 피트니스(Fitness) 신규. 31번째 신규 산업. withRuleId 40 Sprint 연속 정점 (round number 마일스톤).

## §2 BL 설계 (FT-001 ~ FT-006)

| BL | 영역 | Detector | 함수 | 패턴 |
|----|------|----------|------|------|
| FT-001 | class capacity — 클래스 정원 한도 | ThresholdCheck (Path A, UPPERCASE) | `bookClassSlot()` | `booked_count >= MAX_CLASS_CAPACITY` |
| FT-002 | membership tier — PT 세션 한도 | ThresholdCheck (Path B, var-vs-var) | `usePtSession()` | `used_count >= ptSessionLimit` |
| FT-003 | personal training atomic | AtomicTransaction | `bookPersonalTraining()` | `db.transaction()` — bookings + trainer_slots + payments |
| FT-004 | progress status transition | StatusTransition | `transitionProgressStatus()` | `initial → in_progress → assessment → completed` |
| FT-005 | no-show fee batch | StatusTransition (batch) | `markNoShowBatch()` | `status='no_show'` 일괄 UPDATE |
| FT-006 | equipment reserve atomic | AtomicTransaction | `reserveEquipment()` | `db.transaction()` — equipment_reservations + equipment_holds + usage_stats |

**균형**: Threshold × 2 + Atomic × 2 + Status × 2 (32번째 정착)

## §3 데이터 스키마

| 테이블 | 역할 |
|--------|------|
| `fitness_classes` | 클래스 (capacity, booked_count, status) |
| `class_bookings` | 클래스 예약 |
| `memberships` | 회원 멤버십 (tier_code, pt_session_limit, pt_sessions_used) |
| `pt_bookings` | PT 예약 (bookings + trainer_slots + payments atomic) |
| `trainer_slots` | 트레이너 슬롯 |
| `pt_payments` | PT 결제 기록 |
| `member_progress` | 운동 진행 상태 (initial → in_progress → assessment → completed) |
| `equipment` | 기구 (status, daily_usage_count) |
| `equipment_reservations` | 기구 예약 |
| `equipment_holds` | 기구 hold 기록 |
| `no_show_fees` | 노쇼 패널티 기록 |

## §4 상수 / 임계값

- `MAX_CLASS_CAPACITY = 25` (FT-001: 클래스 정원 기본 한도, 인원)
- `ptSessionLimit = memberships.pt_session_limit` (FT-002: 멤버십별 PT 세션 한도)

## §5 파일 목록

| 경로 | 작업 |
|------|------|
| `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/fitness.ts` | **신규** ~280 lines |
| `.decode-x/spec-containers/fitness/rules/fitness-rules.md` | **신규** |
| `.decode-x/spec-containers/fitness/rules/FT-001.md` ~ `FT-006.md` | **신규** × 6 |
| `.decode-x/spec-containers/fitness/runbooks/FT-001.md` ~ `FT-006.md` | **신규** × 6 |
| `.decode-x/spec-containers/fitness/tests/FT-001.yaml` | **신규** |
| `.decode-x/spec-containers/fitness/provenance.yaml` | **신규** |
| `scripts/divergence/domain-source-map.ts` | fitness 42번째 entry 추가 |
| `packages/utils/src/divergence/rules-parser.ts` | FT prefix 추가 |
| `packages/utils/test/bl-detector.test.ts` | FT-001~006 test 추가 |

## §6 withRuleId 재사용

신규 detector 0개. BL_DETECTOR_REGISTRY에서 기존 `ThresholdCheck` / `AtomicTransaction` / `StatusTransition` detector에 FT-001~006 withRuleId 바인딩.

## §7 수락 기준 (DoD 12건)

Plan DoD와 동일 (AIF-PLAN-110 §DoD 참조).
