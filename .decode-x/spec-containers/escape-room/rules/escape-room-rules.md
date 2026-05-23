# Spec Container — ESCAPE-ROOM-001 (방탈출 카페 합성 도메인)

**Skill ID**: ESCAPE-ROOM-001
**Domain**: Escape Room (방탈출 카페 산업 — 동시room한도/attempt한도/room예약atomic/session상태전환/ended세션일괄만료/session환불atomic)
**Source**: SYNTHETIC — 세션 392 F564, withRuleId 재사용 95번째 도메인 PoC (Billiards 다음 산업, 84번째 신규) 🔓 단일 클러스터 26 도메인 첫 사례 마일스톤 신기록 + 22 Sprint 연속 첫 사례 마일스톤 신기록
**Rule prefix**: ES (EScape room)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (ES-001 ~ ES-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| ES-001 | 신규 escape room session 예약 요청 시 | `escape_facilities.active_rooms < max_concurrent_rooms` (UPPERCASE fallback MAX_CONCURRENT_ROOMS_PER_FACILITY) | room 예약 허용 + escape_facilities.active_rooms 증가 | `E422-ROOM-LIMIT-EXCEEDED` |
| ES-002 | 회원 escape attempt 사용 요청 시 | `membership.daily_attempts + attempts < attemptLimit` (var-vs-var, `attemptLimit` keyword) | attempt 한도 적용 + daily_attempts 증가 | `E422-ATTEMPT-LIMIT-EXCEEDED` |
| ES-003 | room 예약 atomic 요청 시 | `escape_sessions.status = 'reserved'` | atomic: room_schedules INSERT + escape_sessions UPDATE + session_payments INSERT + hint_usage INSERT | `E404-SESSION` |
| ES-004 | session 상태 전환 (reserved → starting → playing → ended / abandoned / cancelled) | 허용 매트릭스 충족 | `escape_sessions.status` UPDATE + escape_result 갱신 (ended 시 escaped/failed) | `E404-SESSION`, `E409-SESSION` |
| ES-005 | ended session 일괄 만료 처리 | `escape_sessions.status = 'ended'` AND `reserved_at <= now` | `status='cancelled'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| ES-006 | session 환불 atomic (그룹 환불 + escape bonus 지급 정책) | `escape_sessions.status = 'cancelled'` | atomic: cancelled_session_records INSERT + session_refunds INSERT + cancelled_session_records UPDATE | `E404-CANCELLED-SESSION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `escape_facilities` | active_rooms 증가 (ES-001) | reserveRoom |
| `escape_sessions` | INSERT (ES-001), status + escape_result 갱신 (ES-003/ES-004/ES-005) | reserveRoom / processRoomBooking / transitionSessionStatus / expireEndedSessionBatch |
| `memberships` | daily_attempts 증가 (ES-002) | applyAttemptLimit |
| `room_schedules` | INSERT (ES-003) | processRoomBooking |
| `session_payments` | INSERT (ES-003) | processRoomBooking |
| `hint_usage` | INSERT (ES-003) | processRoomBooking |
| `cancelled_session_records` | INSERT + status='refunded' (ES-006) | processSessionRefund |
| `session_refunds` | INSERT (ES-006) | processSessionRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_ROOMS_PER_FACILITY = 8` (ES-001 facility별 동시 active room 한도 — 중형 방탈출 카페 8 room 기준)
- attempt 한도: basic=1회, silver=2회, gold=3회, vip=무제한 (멤버십 등급별 일일 시도 횟수, ES-002)
- escape bonus: 탈출 성공 시 다음 방문 할인 또는 환불 보너스 지급 (ES-006)
- room 테마: Horror / Mystery / Adventure / Sci-Fi / Fantasy (난이도별 가격 차등)
- 그룹 규모: 2~6인 party 동일 room 공유, group_size 기록
- session 시간: 45분 ~ 60분 (테마별 차등)
- 힌트 정책: 테마별 기본 3회, VIP 무제한
- session 상태: reserved(예약) → starting(게임 마스터 브리핑) → playing(탈출 시도 중) → ended(종료 escaped/failed) / abandoned(이탈) / cancelled(취소)
