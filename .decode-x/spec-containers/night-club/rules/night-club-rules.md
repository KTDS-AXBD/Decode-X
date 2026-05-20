# Spec Container — NIGHTCLUB-001 (나이트클럽 합성 도메인)

**Skill ID**: NIGHTCLUB-001
**Domain**: Night Club (나이트클럽 산업 — 동시게스트한도/VIP테이블한도/VIP예약atomic/방문상태전환/closed방문일괄만료/방문환불atomic)
**Source**: SYNTHETIC — 세션 385 F557, withRuleId 재사용 88번째 도메인 PoC (Karaoke 다음 산업, 77번째 신규) 🌃 단일 클러스터 19 도메인 첫 사례 마일스톤 신기록 + 15 Sprint 연속 첫 사례 마일스톤 신기록
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (NC-001 ~ NC-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| NC-001 | 신규 night club 입장 예약 요청 시 | `night_clubs.active_guests < max_concurrent_guests` (UPPERCASE fallback MAX_CONCURRENT_GUESTS_PER_CLUB) | 입장 예약 허용 + night_clubs.active_guests 증가 | `E422-CLUB-GUEST-LIMIT-EXCEEDED` |
| NC-002 | 회원 VIP 테이블 예약 요청 시 | `membership.daily_used + tables < vipTableLimit` (var-vs-var, `limit` keyword) | VIP 테이블 한도 적용 + daily_used 증가 | `E422-VIP-TABLE-LIMIT-EXCEEDED` |
| NC-003 | VIP 테이블 예약 atomic 요청 시 | `night_club_visits.status = 'reserved'` | atomic: vip_table_schedules INSERT + night_club_visits UPDATE + visit_payments INSERT | `E404-VISIT` |
| NC-004 | visit 상태 전환 (reserved → entered → exited → ended / closed / cancelled) | 허용 매트릭스 충족 | `night_club_visits.status` UPDATE | `E404-VISIT`, `E409-VISIT` |
| NC-005 | closed visit 일괄 만료 처리 | `night_club_visits.status = 'closed'` AND `reserved_at <= now` | `status='ended'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| NC-006 | visit 환불 atomic 요청 시 | `night_club_visits.status = 'cancelled'` | atomic: cancelled_fee_records INSERT + visit_refunds INSERT + cancelled_fee_records UPDATE (입장료 환불 정책) | `E404-CANCELLED-VISIT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `night_clubs` | active_guests 증가 (NC-001) | reserveEntry |
| `night_club_visits` | INSERT (NC-001), status 갱신 (NC-003/NC-004/NC-005) | reserveEntry / processVipBooking / transitionVisitStatus / expireClosedVisitBatch |
| `memberships` | daily_used 증가 (NC-002) | applyVipTableLimit |
| `vip_table_schedules` | INSERT (NC-003) | processVipBooking |
| `visit_payments` | INSERT (NC-003) | processVipBooking |
| `cancelled_fee_records` | INSERT + status='refunded' (NC-006) | processVisitRefund |
| `visit_refunds` | INSERT (NC-006) | processVisitRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_GUESTS_PER_CLUB = 500` (NC-001 나이트클럽별 동시 active guest 기본 한도 — 대형 클럽 기반)
- VIP 테이블 한도: basic=0, premium=1, vip=3 (멤버십 등급별 일일 VIP 테이블 예약 가능 수)
- 환불 정책: basic=50% 취소 수수료, premium=25%, vip=10% (NC-006, 입장료 기준)
- 이용 시간: 입장권 유효 시간 종일권 없음 — 당일 23:00~06:00 야간 영업 (나이트클럽 표준 운영)
