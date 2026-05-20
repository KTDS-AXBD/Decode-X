# Spec Container — KARAOKE-001 (노래방 합성 도메인)

**Skill ID**: KARAOKE-001
**Domain**: Karaoke (노래방 산업 — 동시룸한도/멤버십한도/룸예약atomic/세션상태전환/closed세션일괄만료/세션환불atomic)
**Source**: SYNTHETIC — 세션 384 F556, withRuleId 재사용 87번째 도메인 PoC (Concert hall 다음 산업, 76번째 신규) 🎤 단일 클러스터 18 도메인 첫 사례 마일스톤 신기록 + 14 Sprint 연속 첫 사례 마일스톤 신기록
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (KR-001 ~ KR-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| KR-001 | 신규 karaoke room 예약 요청 시 | `karaokes.active_rooms < max_concurrent_rooms` (UPPERCASE fallback MAX_CONCURRENT_ROOMS_PER_KARAOKE) | room 예약 허용 + karaokes.active_rooms 증가 | `E422-KARAOKE-ROOM-LIMIT-EXCEEDED` |
| KR-002 | 회원 멤버십 room 예약 요청 시 | `membership.daily_used + rooms < membershipLimit` (var-vs-var, `limit` keyword) | 멤버십 한도 적용 + daily_used 증가 | `E422-MEMBERSHIP-LIMIT-EXCEEDED` |
| KR-003 | room 예약 atomic 요청 시 | `karaoke_sessions.status = 'reserved'` | atomic: room_schedules INSERT + karaoke_sessions UPDATE + session_payments INSERT | `E404-SESSION` |
| KR-004 | session 상태 전환 (reserved → ongoing → ended / closed / cancelled) | 허용 매트릭스 충족 | `karaoke_sessions.status` UPDATE | `E404-SESSION`, `E409-SESSION` |
| KR-005 | closed session 일괄 만료 처리 | `karaoke_sessions.status = 'closed'` AND `reserved_at <= now` | `status='ended'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| KR-006 | session 환불 atomic 요청 시 | `karaoke_sessions.status = 'cancelled'` | atomic: cancelled_fee_records INSERT + session_refunds INSERT + cancelled_fee_records UPDATE (drinks/menu 환불 정책) | `E404-CANCELLED-SESSION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `karaokes` | active_rooms 증가 (KR-001) | reserveRoom |
| `karaoke_sessions` | INSERT (KR-001), status 갱신 (KR-003/KR-004/KR-005) | reserveRoom / processRoomBooking / transitionSessionStatus / expireClosedSessionBatch |
| `memberships` | daily_used 증가 (KR-002) | applyMembershipLimit |
| `room_schedules` | INSERT (KR-003) | processRoomBooking |
| `session_payments` | INSERT (KR-003) | processRoomBooking |
| `cancelled_fee_records` | INSERT + status='refunded' (KR-006) | processSessionRefund |
| `session_refunds` | INSERT (KR-006) | processSessionRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_ROOMS_PER_KARAOKE = 20` (KR-001 노래방별 동시 active room 기본 한도 — 일반 노래방 기반)
- 멤버십 한도: basic=2, premium=5, vip=unlimited(10) (멤버십 등급별 일일 room 예약 횟수)
- 환불 정책: basic=30% 취소 수수료, premium=15%, vip=0% (KR-006, drinks/menu 추가 환불 별도 처리)
- 이용 시간: 1시간 / 2시간 / 3시간 슬롯 (노래방 표준 이용 단위)
