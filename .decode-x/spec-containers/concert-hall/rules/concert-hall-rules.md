# Spec Container — CONCERT-HALL-001 (클래식 콘서트홀 합성 도메인)

**Skill ID**: CONCERT-HALL-001
**Domain**: Concert hall (클래식 콘서트홀 산업 — 동시티켓한도/시즌권한도/티켓예매atomic/티켓상태전환/closed티켓일괄만료/티켓환불atomic)
**Source**: SYNTHETIC — 세션 311 F555, withRuleId 재사용 86번째 도메인 PoC (Beach club 다음 산업, 75번째 신규) 🎻 단일 클러스터 17 도메인 첫 사례 마일스톤 신기록 + 13 Sprint 연속 첫 사례 마일스톤 신기록
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (CO-001 ~ CO-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| CO-001 | 신규 concert hall 티켓 예약 요청 시 | `concert_halls.active_tickets < max_concurrent_tickets` (UPPERCASE fallback MAX_CONCURRENT_TICKETS_PER_CONCERT) | 티켓 예약 허용 + concert_halls.active_tickets 증가 | `E422-HALL-TICKET-LIMIT-EXCEEDED` |
| CO-002 | 회원 시즌권 공연 예약 요청 시 | `pass.season_used + tickets < seasonLimit` (var-vs-var, `limit` keyword) | 시즌권 한도 적용 + season_used 증가 | `E422-SEASON-LIMIT-EXCEEDED` |
| CO-003 | 티켓 예매 atomic 요청 시 | `concert_tickets.status = 'reserved'` | atomic: season_schedules INSERT + concert_tickets UPDATE + ticket_payments INSERT | `E404-TICKET` |
| CO-004 | 티켓 상태 전환 (reserved → attended → ended / closed / cancelled) | 허용 매트릭스 충족 | `concert_tickets.status` UPDATE | `E404-TICKET`, `E409-TICKET` |
| CO-005 | closed 티켓 일괄 만료 처리 | `concert_tickets.status = 'closed'` AND `reserved_at <= now` | `status='ended'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| CO-006 | 티켓 환불 atomic 요청 시 | `concert_tickets.status = 'cancelled'` | atomic: cancelled_fee_records INSERT + ticket_refunds INSERT + cancelled_fee_records UPDATE (시즌권 환불 정책) | `E404-CANCELLED-TICKET` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `concert_halls` | active_tickets 증가 (CO-001) | reserveTicket |
| `concert_tickets` | INSERT (CO-001), status 갱신 (CO-003/CO-004/CO-005) | reserveTicket / processTicketBooking / transitionTicketStatus / expireClosedTicketBatch |
| `season_passes` | season_used 증가 (CO-002) | applySeasonLimit |
| `season_schedules` | INSERT (CO-003) | processTicketBooking |
| `ticket_payments` | INSERT (CO-003) | processTicketBooking |
| `cancelled_fee_records` | INSERT + status='refunded' (CO-006) | processTicketRefund |
| `ticket_refunds` | INSERT (CO-006) | processTicketRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_TICKETS_PER_CONCERT = 1500` (CO-001 공연당 동시 active ticket 기본 한도 — 대형 클래식 콘서트홀 기반)
- 시즌권 한도: standard=4, premium=8, vip=unlimited(20) (시즌권 등급별 정기 공연 예약 횟수)
- 시즌권 환불 정책: standard=20% 취소 수수료, premium=10%, vip=0% (CO-006)
- 좌석 등급: vip > a > b > c (클래식 콘서트홀 좌석 구분)
