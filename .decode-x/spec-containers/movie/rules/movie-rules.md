# Spec Container — MOVIE-001 (영화관 합성 도메인)

**Skill ID**: MOVIE-001
**Domain**: Movie (영화관 산업 — 동시상영한도/회원일일티켓한도/좌석예매atomic/상영상태전환/만료closedscreening일괄/티켓환불atomic)
**Source**: SYNTHETIC — 세션 307 후속2 F544, withRuleId 재사용 76번째 도메인 PoC (Museum 다음 산업, 65번째 신규) 🎬 단일 클러스터 7 도메인 첫 사례 마일스톤
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (MV-001 ~ MV-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| MV-001 | 신규 좌석 예매 요청 시 | `theater.active_screenings < total_screening_capacity` (UPPERCASE fallback MAX_CONCURRENT_SCREENINGS_PER_THEATER) | 상영 예매 허용 + theater.active_screenings 증가 | `E422-THEATER-SCREENING-LIMIT-EXCEEDED` |
| MV-002 | 회원 티켓 구매 요청 시 | `pass.ticket_used + tickets < ticketLimit` (var-vs-var, `limit` keyword) | 티켓 적용 + ticket_used 증가 | `E422-DAILY-TICKET-LIMIT-EXCEEDED` |
| MV-003 | 좌석 입장 atomic 요청 시 | `screenings.status = 'reserved'` | atomic: theater_visits INSERT + screenings UPDATE + ticket_payments INSERT | `E404-SCREENING` |
| MV-004 | 상영 상태 전환 (reserved → watched → ended / closed / cancelled) | 허용 매트릭스 충족 | `screenings.status` UPDATE | `E404-SCREENING`, `E409-SCREENING` |
| MV-005 | closed 상영 일괄 만료 처리 | `theater_visits.status = 'closed'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| MV-006 | 티켓 환불 (closed) atomic 요청 시 | `theater_visits.status = 'closed'` | atomic: ticket_refund_records INSERT + ticket_refunds INSERT + ticket_refund_records UPDATE | `E404-CLOSED-VISIT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `theaters` | active_screenings 증가 (MV-001) | bookSeat |
| `screenings` | INSERT (MV-001), status 갱신 (MV-003/MV-004) | bookSeat / processSeatEntry / transitionScreeningStatus |
| `member_passes` | ticket_used 증가 (MV-002) | applyTicketLimit |
| `theater_visits` | INSERT (MV-003), batch expire (MV-005) | processSeatEntry / expireClosedScreeningBatch |
| `ticket_payments` | INSERT (MV-003) | processSeatEntry |
| `ticket_refund_records` | INSERT + status='refunded' (MV-006) | processTicketRefund |
| `ticket_refunds` | INSERT (MV-006) | processTicketRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_SCREENINGS_PER_THEATER = 20` (MV-001 영화관별 동시 active 상영 기본 한도, 멀티플렉스급 20개 상영관 기준)
- `ticketLimit = member_passes.ticket_limit` (MV-002 회원 등급별 일일 티켓 구매 한도, 멤버십 정책 연계)

---

## 상태 머신

```
screenings: reserved → watched (MV-003 atomic)
screenings: watched → ended (MV-004 transition, 정상 상영 종료)
screenings: reserved|watched → closed (MV-004 transition, 상영 취소/장애)
screenings: reserved|watched → cancelled (MV-004 transition)

theater_visits: watched → ended (정상 종료)
theater_visits: closed → expired (MV-005 batch — 데이터 보관 기간 만료)
theater_visits: watched → closed (상영 취소, MV-006 티켓 환불 대상)

ticket_refund_records: pending → calculated → refunded (MV-006 atomic)
```

---

## 의존 함수 (movie.ts)

| BL | 함수 | detector |
|----|------|----------|
| MV-001 | `bookSeat` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| MV-002 | `applyTicketLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| MV-003 | `processSeatEntry` | AtomicTransaction (`db.transaction(...)`) |
| MV-004 | `transitionScreeningStatus` | StatusTransition (matrix) |
| MV-005 | `expireClosedScreeningBatch` | StatusTransition (batch) |
| MV-006 | `processTicketRefund` | AtomicTransaction (`db.transaction(...)`) |
