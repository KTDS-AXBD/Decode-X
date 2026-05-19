# Spec Container — BEACH-CLUB-001 (비치클럽 합성 도메인)

**Skill ID**: BEACH-CLUB-001
**Domain**: Beach club (비치클럽 산업 — 동시방문자한도/cabana한도/cabana예약atomic/방문상태전환/closed방문일괄만료/방문환불atomic)
**Source**: SYNTHETIC — 세션 309 F554, withRuleId 재사용 85번째 도메인 PoC (Wedding hall 다음 산업, 74번째 신규) 🏖️ 단일 클러스터 16 도메인 첫 사례 마일스톤 신기록 + 12 Sprint 연속 첫 사례 마일스톤 신기록
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (BC-001 ~ BC-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| BC-001 | 신규 beach club 종일권 예약 요청 시 | `beach_clubs.active_visitors < max_concurrent_visitors` (UPPERCASE fallback MAX_CONCURRENT_VISITORS_PER_BEACH_CLUB) | 종일권 예약 허용 + beach_clubs.active_visitors 증가 | `E422-CLUB-VISITOR-LIMIT-EXCEEDED` |
| BC-002 | 회원 cabana 예약 요청 시 | `membership.cabana_used + cabanas < cabanaLimit` (var-vs-var, `limit` keyword) | cabana 한도 적용 + cabana_used 증가 | `E422-CABANA-LIMIT-EXCEEDED` |
| BC-003 | cabana 예약 atomic 요청 시 | `beach_club_visits.status = 'reserved'` | atomic: cabana_schedules INSERT + beach_club_visits UPDATE + visit_payments INSERT | `E404-VISIT` |
| BC-004 | 방문 상태 전환 (reserved → entered → exited → ended / closed / cancelled) | 허용 매트릭스 충족 | `beach_club_visits.status` UPDATE | `E404-VISIT`, `E409-VISIT` |
| BC-005 | closed 방문 일괄 만료 처리 | `beach_club_visits.status = 'closed'` AND `visited_at <= now` | `status='ended'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| BC-006 | 방문 환불 atomic 요청 시 | `beach_club_visits.status = 'cancelled'` | atomic: cancelled_fee_records INSERT + visit_refunds INSERT + cancelled_fee_records UPDATE (VIP 환불 정책) | `E404-CANCELLED-VISIT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `beach_clubs` | active_visitors 증가 (BC-001) | reserveDayPass |
| `beach_club_visits` | INSERT (BC-001), status 갱신 (BC-003/BC-004/BC-005) | reserveDayPass / processCabanaBooking / transitionVisitStatus / expireClosedVisitBatch |
| `beach_memberships` | cabana_used 증가 (BC-002) | applyCabanaLimit |
| `cabana_schedules` | INSERT (BC-003) | processCabanaBooking |
| `visit_payments` | INSERT (BC-003) | processCabanaBooking |
| `cancelled_fee_records` | INSERT + status='refunded' (BC-006) | processVisitRefund |
| `visit_refunds` | INSERT (BC-006) | processVisitRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_VISITORS_PER_BEACH_CLUB = 500` (BC-001 비치클럽별 동시 active visitor 기본 한도 — 대규모 야외 공간 기반)
- cabana 한도: standard=1, premium=3, vip=5 (멤버십 등급별)
- VIP 환불 정책: standard=20% 취소 수수료, premium=10%, vip=0% (BC-006)
