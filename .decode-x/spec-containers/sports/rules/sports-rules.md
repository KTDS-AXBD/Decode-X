# Spec Container — SPORTS-001 (스포츠 산업 합성 도메인)

**Skill ID**: SPORTS-001
**Domain**: Sports (스포츠 산업 — 경기장한도/시즌권한도/티켓판매atomic/이벤트상태전환/상품교체/환불재예약atomic)
**Source**: SYNTHETIC — Sprint 307 F473, withRuleId 재사용 37번째 도메인 PoC (Defense 다음 산업, 26번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (SP-001 ~ SP-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| SP-001 | 경기장 좌석 예약 요청 시 | `totalBooked < MAX_VENUE_CAPACITY` (UPPERCASE 상수, 50000) | 예약 허용 + venue_seats INSERT | `E422-VENUE-CAPACITY-EXCEEDED` (경기장 좌석 한도 초과) |
| SP-002 | 시즌권 신청 시 | `requestedQuantity <= seasonTicketLimit` (var-vs-var, `limit` keyword 매칭) | 시즌권 승인 | `E422-SEASON-TICKET-EXCEEDED` (시즌권 한도 초과) |
| SP-003 | 티켓 판매 요청 시 | `venue_seats.status = 'held'` | atomic: `ticket_sales` INSERT + `venue_seats` UPDATE + `issued_tickets` INSERT + `ticket_sales.status` UPDATE | `E404-SEAT`, `E409-TICKET` |
| SP-004 | 이벤트 상태 전환 (scheduled → ticketing → live → completed → archived) | 허용 매트릭스 충족 | `events.status` UPDATE + 타임스탬프 기록 | `E404-EVENT`, `E409-EVENT` |
| SP-005 | 상품 일괄 동기화 처리 | `merchandise_batches.created_at <= syncedBefore` AND `status = 'pending'` | `status='synced', synced_at=NOW()` 일괄 UPDATE | 대상 없으면 syncedCount=0 |
| SP-006 | 환불 + 재예약 요청 시 | 원본 판매 존재 필수 | atomic: `refund_records` INSERT + `ticket_sales` UPDATE + `venue_seats` UPDATE + `ticket_sales` INSERT + `cancellation_logs` INSERT + `venue_seats` UPDATE | 조회 실패 시 SportsError |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `venue_seats` | INSERT (SP-001), status 갱신 (SP-003/SP-006) | bookVenueSeat / processTicketSale / processRefundRebook |
| `season_ticket_requests` | INSERT (SP-002) | applySeasonTicketTier |
| `ticket_sales` | INSERT + status 갱신 (SP-003/SP-006) | processTicketSale / processRefundRebook |
| `issued_tickets` | INSERT (SP-003) | processTicketSale |
| `events` | status + 타임스탬프 갱신 (SP-004) | transitionEventStatus |
| `merchandise_batches` | status='synced' 일괄 갱신 (SP-005) | markMerchandiseSync |
| `refund_records` | INSERT (SP-006) | processRefundRebook |
| `cancellation_logs` | INSERT (SP-006) | processRefundRebook |

---

## 임계값 / 상수

- `MAX_VENUE_CAPACITY = 50000` (SP-001 경기장 최대 좌석 한도, 좌석 수)
- `seasonTicketLimit = season_ticket_tiers.seasonTicketLimit` (SP-002 단계별 시즌권 한도)

---

## 상태 머신

```
events: scheduled → ticketing (SP-004 transition)
events: ticketing → live (SP-004 transition)
events: live → completed (SP-004 transition)
events: completed → archived (SP-004 transition)

merchandise_batches: pending → synced (SP-005 batch)

ticket_sales: initiated → payment_confirmed → issued (SP-003 atomic)
ticket_sales: issued → cancelled (SP-006 atomic cancel)
```

---

## 권한

- **bookVenueSeat**: 좌석예약 SYSTEM / 티켓팅 담당
- **applySeasonTicketTier**: 시즌권관리 SYSTEM
- **processTicketSale**: 티켓판매 SYSTEM (결제 필수)
- **transitionEventStatus**: 이벤트관리 SYSTEM / 운영관리자
- **markMerchandiseSync**: 상품관리 SYSTEM (배치)
- **processRefundRebook**: 환불재예약 SYSTEM / 고객서비스

---

## 관련 문서

- `rules/SP-001.md` ~ `rules/SP-006.md` — 개별 BL detail
- `runbooks/SP-001.md` ~ `runbooks/SP-006.md` — operational runbooks
- `tests/SP-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/sports.ts` — 합성 source
