# Spec Container — BOWLING-001 (볼링 합성 도메인)

**Skill ID**: BOWLING-001
**Domain**: Bowling (볼링 산업 — 동시레인한도/게임한도/레인예약atomic/세션상태전환/closed세션일괄만료/환불atomic)
**Source**: SYNTHETIC — 세션 389 F561, withRuleId 재사용 92번째 도메인 PoC (Casino 다음 산업, 81번째 신규) 🎳 단일 클러스터 23 도메인 첫 사례 마일스톤 신기록 도전 + 19 Sprint 연속 첫 사례 마일스톤 신기록 도전
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (BW-001 ~ BW-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| BW-001 | 신규 bowling session 예약 요청 시 | `bowling_centers.active_lanes < max_concurrent_lanes` (UPPERCASE fallback MAX_CONCURRENT_LANES_PER_CENTER) | lane 예약 허용 + bowling_centers.active_lanes 증가 | `E422-CENTER-LANE-LIMIT-EXCEEDED` |
| BW-002 | 회원 game 요청 시 | `membership.daily_used + gameCount < gameLimit` (var-vs-var, `limit` keyword) | game 한도 적용 + daily_used 증가 | `E422-GAME-LIMIT-EXCEEDED` |
| BW-003 | lane 예약 atomic 요청 시 | `bowling_sessions.status = 'reserved'` | atomic: lane_schedules INSERT + bowling_sessions UPDATE + session_payments INSERT + frame_scores INSERT | `E404-SESSION` |
| BW-004 | session 상태 전환 (reserved → started → completed / closed / cancelled) | 허용 매트릭스 충족 | `bowling_sessions.status` UPDATE | `E404-SESSION`, `E409-SESSION` |
| BW-005 | closed session 일괄 만료 처리 | `bowling_sessions.status = 'closed'` AND `reserved_at <= now` | `status='completed'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| BW-006 | session 환불 atomic (리그/단체 환불 정책) | `bowling_sessions.status = 'cancelled'` | atomic: cancelled_fee_records INSERT + session_refunds INSERT + cancelled_fee_records UPDATE | `E404-CANCELLED-SESSION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `bowling_centers` | active_lanes 증가 (BW-001) | reserveLane |
| `bowling_sessions` | INSERT (BW-001), status 갱신 (BW-003/BW-004/BW-005) | reserveLane / processLaneBooking / transitionSessionStatus / expireClosedSessionBatch |
| `memberships` | daily_used 증가 (BW-002) | applyGameLimit |
| `lane_schedules` | INSERT (BW-003) | processLaneBooking |
| `session_payments` | INSERT (BW-003) | processLaneBooking |
| `frame_scores` | INSERT (BW-003) | processLaneBooking |
| `cancelled_fee_records` | INSERT + status='refunded' (BW-006) | processSessionRefund |
| `session_refunds` | INSERT (BW-006) | processSessionRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_LANES_PER_CENTER = 24` (BW-001 center별 동시 active lane 기본 한도 — 중형 볼링 센터 24 lane 기준)
- game 한도: basic=3, silver=6, gold=12, vip=무제한 (멤버십 등급별 일일 game 횟수, BW-002)
- 취소 수수료율: 48h 이전=0%, 24h 이전=20%, 당일=50%, 1h 이내=80% (BW-006, 리그/단체 환불 정책)
- frame 점수: 0~300점 (게임당 10 frame, 볼링 표준 스코어링, BW-003 frame_scores 초기화)
- 장비 임대: 신발(shoe_size별) + 볼(ball weight별) — lane_schedules.shoe_size 필드로 관리
