# Spec Container — AMU-001 (놀이공원/테마파크 합성 도메인)

**Skill ID**: AMU-001
**Domain**: Amusement (놀이공원/테마파크 산업 — 파크ticket한도/visitordailyvisit한도/입장batchatomic/ticket상태전환/만료revokedticket일괄/ticket환불atomic)
**Source**: SYNTHETIC — 세션 306 후속2 F534, withRuleId 재사용 66번째 도메인 PoC (Gambling 다음 산업, 55번째 신규) 🏆 66번째 도메인 마일스톤
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (AM-001 ~ AM-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| AM-001 | 신규 ticket 예약 요청 시 | `park.active_tickets < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_ACTIVE_TICKETS_PER_PARK) | ticket 예약 허용 + park.active_tickets 증가 | `E422-PARK-CAPACITY-EXCEEDED` |
| AM-002 | 방문객 visit 요청 시 | `contract.visit_used + visit < dailyVisitLimit` (var-vs-var, `limit` keyword) | visit 적용 + visit_used 증가 | `E422-DAILY-VISIT-LIMIT-EXCEEDED` |
| AM-003 | 놀이기구 입장 atomic 요청 시 | `ride_schedules.status = 'reserved'` | atomic: tickets INSERT + ride_schedules UPDATE + ticket_payments INSERT | `E404-SCHEDULE` |
| AM-004 | ticket 상태 전환 (reserved → admitted → updated → completed / revoked / cancelled) | 허용 매트릭스 충족 | `ride_schedules.status` UPDATE | `E404-SCHEDULE`, `E409-SCHEDULE` |
| AM-005 | revoked ticket 일괄 만료 처리 | `tickets.status = 'revoked'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| AM-006 | ticket 환불 (revoked) atomic 요청 시 | `tickets.status = 'revoked'` | atomic: ticket_refund_records INSERT + ticket_refunds INSERT + ticket_refund_records UPDATE | `E404-REVOKED-TICKET` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `parks` | active_tickets 증가 (AM-001) | reserveTicket |
| `ride_schedules` | INSERT (AM-001), status 갱신 (AM-003/AM-004) | reserveTicket / processRideAdmission / transitionTicketStatus |
| `visitor_contracts` | visit_used 증가 (AM-002) | applyVisitLimit |
| `tickets` | INSERT (AM-003), batch expire (AM-005) | processRideAdmission / expireRevokedTicketBatch |
| `ticket_payments` | INSERT (AM-003) | processRideAdmission |
| `ticket_refund_records` | INSERT + status='refunded' (AM-006) | processTicketRefund |
| `ticket_refunds` | INSERT (AM-006) | processTicketRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_ACTIVE_TICKETS_PER_PARK = 5000` (AM-001 테마파크별 동시 active ticket 기본 한도, 일반 테마파크 일일 동시 이용 가능 방문객 수)
- `dailyVisitLimit = visitor_contracts.visit_limit` (AM-002 방문객 등급별 일일 visit 한도, 시즌권자 정책 연계)

---

## 상태 머신

```
ride_schedules: reserved → admitted (AM-003 atomic)
ride_schedules: admitted ↔ updated (AM-004 transition, 어트랙션 변경)
ride_schedules: admitted|updated → completed (AM-004 transition, 정상 종료)
ride_schedules: reserved|admitted → revoked (AM-004 transition, 어트랙션 운영중단/안전)
ride_schedules: reserved|admitted → cancelled (AM-004 transition)

tickets: admitted → updated → completed (정상 종료)
tickets: revoked → expired (AM-005 batch — 데이터 보관 기간 만료)
tickets: admitted → revoked (어트랙션 긴급 중단, AM-006 ticket 환불 대상)

ticket_refund_records: pending → calculated → refunded (AM-006 atomic)
```

---

## 의존 함수 (amusement.ts)

| BL | 함수 | detector |
|----|------|----------|
| AM-001 | `reserveTicket` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| AM-002 | `applyVisitLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| AM-003 | `processRideAdmission` | AtomicTransaction (`db.transaction(...)`) |
| AM-004 | `transitionTicketStatus` | StatusTransition (matrix) |
| AM-005 | `expireRevokedTicketBatch` | StatusTransition (batch) |
| AM-006 | `processTicketRefund` | AtomicTransaction (`db.transaction(...)`) |
