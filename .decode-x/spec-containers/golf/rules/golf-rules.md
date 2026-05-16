# Spec Container — GLF-001 (골프장/필드 운영 합성 도메인)

**Skill ID**: GLF-001
**Domain**: Golf (골프장/필드 운영 산업 — 코스round한도/memberdailyround한도/티오프batchatomic/round상태전환/만료suspendedround일괄/course환불atomic)
**Source**: SYNTHETIC — 세션 306 후속6 F538, withRuleId 재사용 70번째 도메인 PoC 🏆🏆 round 마일스톤 (Exhibition 다음 산업, 59번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (GF-001 ~ GF-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| GF-001 | 신규 tee time 예약 요청 시 | `course.active_rounds < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_ACTIVE_ROUNDS_PER_COURSE) | tee 예약 허용 + course.active_rounds 증가 | `E422-COURSE-CAPACITY-EXCEEDED` |
| GF-002 | 회원 round 요청 시 | `contract.round_used + round < dailyRoundLimit` (var-vs-var, `limit` keyword) | round 적용 + round_used 증가 | `E422-DAILY-ROUND-LIMIT-EXCEEDED` |
| GF-003 | 티오프 atomic 요청 시 | `tee_schedules.status = 'reserved'` | atomic: rounds INSERT + tee_schedules UPDATE + round_payments INSERT | `E404-SCHEDULE` |
| GF-004 | round 상태 전환 (reserved → teedoff → updated → finished / suspended / cancelled) | 허용 매트릭스 충족 | `tee_schedules.status` UPDATE | `E404-SCHEDULE`, `E409-SCHEDULE` |
| GF-005 | suspended round 일괄 만료 처리 | `rounds.status = 'suspended'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| GF-006 | course 환불 (suspended) atomic 요청 시 | `rounds.status = 'suspended'` | atomic: round_refund_records INSERT + round_refunds INSERT + round_refund_records UPDATE | `E404-SUSPENDED-ROUND` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `courses` | active_rounds 증가 (GF-001) | reserveTeeTime |
| `tee_schedules` | INSERT (GF-001), status 갱신 (GF-003/GF-004) | reserveTeeTime / processTeeOff / transitionRoundStatus |
| `member_contracts` | round_used 증가 (GF-002) | applyRoundLimit |
| `rounds` | INSERT (GF-003), batch expire (GF-005) | processTeeOff / expireSuspendedRoundBatch |
| `round_payments` | INSERT (GF-003) | processTeeOff |
| `round_refund_records` | INSERT + status='refunded' (GF-006) | processCourseRefund |
| `round_refunds` | INSERT (GF-006) | processCourseRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_ACTIVE_ROUNDS_PER_COURSE = 200` (GF-001 골프장별 동시 active round 기본 한도, 18홀 골프장 동시 진행 가능 라운드 ~ 144 그룹 × 안전 마진)
- `dailyRoundLimit = member_contracts.round_limit` (GF-002 회원 등급별 일일 round 한도, 무제한 멤버십 정책 연계)

---

## 상태 머신

```
tee_schedules: reserved → teedoff (GF-003 atomic)
tee_schedules: teedoff ↔ updated (GF-004 transition, 조정 변경)
tee_schedules: teedoff|updated → finished (GF-004 transition, 정상 라운드 종료)
tee_schedules: reserved|teedoff → suspended (GF-004 transition, 기상악화/코스 폐쇄)
tee_schedules: reserved|teedoff → cancelled (GF-004 transition)

rounds: teedoff → updated → finished (정상 종료)
rounds: suspended → expired (GF-005 batch — 데이터 보관 기간 만료)
rounds: teedoff → suspended (기상악화/코스 긴급 폐쇄, GF-006 course 환불 대상)

round_refund_records: pending → calculated → refunded (GF-006 atomic)
```

---

## 의존 함수 (golf.ts)

| BL | 함수 | detector |
|----|------|----------|
| GF-001 | `reserveTeeTime` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| GF-002 | `applyRoundLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| GF-003 | `processTeeOff` | AtomicTransaction (`db.transaction(...)`) |
| GF-004 | `transitionRoundStatus` | StatusTransition (matrix) |
| GF-005 | `expireSuspendedRoundBatch` | StatusTransition (batch) |
| GF-006 | `processCourseRefund` | AtomicTransaction (`db.transaction(...)`) |
