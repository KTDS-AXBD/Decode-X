# Spec Container — DJACADEMY-001 (DJ 학원 합성 도메인)

**Skill ID**: DJACADEMY-001
**Domain**: DJ Academy (DJ 학원 산업 — deck동시한도/lesson한도/lesson예약atomic/lesson상태전환/in_progress일괄완료/lesson환불atomic)
**Source**: SYNTHETIC — 세션 394 F566, withRuleId 재사용 97번째 도메인 PoC (Pottery Studio 다음 산업, 86번째 신규) 🎧 단일 클러스터 28 도메인 첫 사례 마일스톤 신기록 + 24 Sprint 연속 첫 사례 마일스톤 신기록
**Rule prefix**: DJ (DJ academy)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (DJ-001 ~ DJ-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| DJ-001 | 신규 DJ lesson 예약 요청 시 | `dj_academies.active_decks < max_concurrent_decks` (UPPERCASE fallback MAX_CONCURRENT_DECKS_PER_ACADEMY) | deck 예약 허용 + dj_academies.active_decks 증가 | `E422-DECK-LIMIT-EXCEEDED` |
| DJ-002 | 회원 DJ lesson 수강 요청 시 | `membership.monthly_lessons + lessons < lessonLimit` (var-vs-var, `lessonLimit` keyword) | lesson 한도 적용 + monthly_lessons 증가 | `E422-LESSON-LIMIT-EXCEEDED` |
| DJ-003 | lesson 예약 atomic 요청 시 | `dj_lessons.status = 'scheduled'` | atomic: deck_schedules INSERT + dj_lessons UPDATE + lesson_payments INSERT + equipment_rental INSERT | `E404-LESSON` |
| DJ-004 | lesson 상태 전환 (scheduled → in_progress → completed / no_show / cancelled) | 허용 매트릭스 충족 | `dj_lessons.status` UPDATE | `E404-LESSON`, `E409-LESSON` |
| DJ-005 | in_progress lesson 일괄 완료 처리 | `dj_lessons.status = 'in_progress'` AND `scheduled_at <= now` | `status='completed'` 일괄 UPDATE | 대상 없으면 completedCount=0 |
| DJ-006 | lesson 환불 atomic (월간 구독 환불 + 장비 파손 변상 정책) | `dj_lessons.status = 'cancelled'` | atomic: cancelled_lesson_records INSERT + lesson_refunds INSERT + cancelled_lesson_records UPDATE (장비 파손 변상 equipment_damage_charge 차감) | `E404-CANCELLED-LESSON` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `dj_academies` | active_decks 증가 (DJ-001) | reserveLesson |
| `dj_lessons` | INSERT (DJ-001), status + deck/schedule/payment/rental 갱신 (DJ-003/DJ-004/DJ-005) | reserveLesson / processLessonBooking / transitionLessonStatus / autocompleteInProgressBatch |
| `memberships` | monthly_lessons 증가 (DJ-002) | applyLessonLimit |
| `deck_schedules` | INSERT (DJ-003) | processLessonBooking |
| `lesson_payments` | INSERT (DJ-003) | processLessonBooking |
| `equipment_rental` | INSERT (DJ-003) | processLessonBooking |
| `cancelled_lesson_records` | INSERT + status='refunded' (DJ-006) | processLessonRefund |
| `lesson_refunds` | INSERT (DJ-006) | processLessonRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_DECKS_PER_ACADEMY = 8` (DJ-001 academy별 동시 active deck 한도 — DJ 학원 8 deck 기준)
- lesson 한도: starter=2회, basic=4회, pro=8회, master=무제한 (멤버십 등급별 월간 수강 횟수, DJ-002)
- 장비 종류: cdj / mixer / controller / headphones (종류별 임대 가격 차등, DJ-003)
- 환불 정책: 장비 파손 변상(equipment_damage_charge) 별도 청구 + 월간 구독 취소율 적용 (DJ-006)
- lesson 시간: 60분 (1:1) / 90분 (소그룹 2-4인) (수업 유형별 차등)
- lesson 상태: scheduled(예약) → in_progress(수업 진행) → completed(완료) / no_show(미출석) / cancelled(취소)
- 강사 운영: instructor_id 필수 (1인 강사 최대 4명 지도, DJ-003 deck_schedules)
- 레벨 진급: beginner / intermediate / advanced / professional (lesson 누적으로 진급, 별도 평가)
