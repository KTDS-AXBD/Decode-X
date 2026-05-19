# Spec Container — WEDDING-HALL-001 (예식장 합성 도메인)

**Skill ID**: WEDDING-HALL-001
**Domain**: Wedding hall (예식장 산업 — 동시예식한도/hall한도/예식예약atomic/예식상태전환/closed예식일괄만료/예식환불atomic)
**Source**: SYNTHETIC — 세션 309 F553, withRuleId 재사용 84번째 도메인 PoC (Convention 다음 산업, 73번째 신규) 💒 단일 클러스터 15 도메인 첫 사례 마일스톤 신기록 + 11 Sprint 연속 첫 사례 마일스톤 신기록
**Version**: 1.0.1
**Status**: active

---

## 비즈니스 룰 (WB-001 ~ WB-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| WB-001 | 신규 ceremony 예약 요청 시 | `wedding_halls.active_ceremonies < max_concurrent_ceremonies` (UPPERCASE fallback MAX_CONCURRENT_CEREMONIES_PER_HALL) | ceremony 예약 허용 + wedding_halls.active_ceremonies 증가 | `E422-HALL-CEREMONY-LIMIT-EXCEEDED` |
| WB-002 | 회원 hall 예약 요청 시 | `membership.hall_used + halls < hallLimit` (var-vs-var, `limit` keyword) | hall 한도 적용 + hall_used 증가 | `E422-HALL-LIMIT-EXCEEDED` |
| WB-003 | 예식 예약 atomic 요청 시 | `wedding_ceremonies.status = 'reserved'` | atomic: hall_schedules INSERT + wedding_ceremonies UPDATE + ceremony_payments INSERT | `E404-CEREMONY` |
| WB-004 | 예식 상태 전환 (reserved → ongoing → ended / closed / cancelled) | 허용 매트릭스 충족 | `wedding_ceremonies.status` UPDATE | `E404-CEREMONY`, `E409-CEREMONY` |
| WB-005 | closed ceremony 일괄 만료 처리 | `wedding_ceremonies.status = 'closed'` AND `scheduled_at <= now` | `status='ended'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| WB-006 | 예식 환불 atomic 요청 시 | `wedding_ceremonies.status = 'cancelled'` | atomic: cancelled_fee_records INSERT + ceremony_refunds INSERT + cancelled_fee_records UPDATE (강한 계약금/위약금) | `E404-CANCELLED-CEREMONY` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `wedding_halls` | active_ceremonies 증가 (WB-001) | reserveCeremony |
| `wedding_ceremonies` | INSERT (WB-001), status 갱신 (WB-003/WB-004/WB-005) | reserveCeremony / processCeremonyBooking / transitionCeremonyStatus / expireClosedCeremonyBatch |
| `hall_memberships` | hall_used 증가 (WB-002) | applyHallLimit |
| `hall_schedules` | INSERT (WB-003) | processCeremonyBooking |
| `ceremony_payments` | INSERT (WB-003) | processCeremonyBooking |
| `cancelled_fee_records` | INSERT + status='refunded' (WB-006) | processCeremonyRefund |
| `ceremony_refunds` | INSERT (WB-006) | processCeremonyRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_CEREMONIES_PER_HALL = 3` (WB-001 예식장별 동시 active ceremony 기본 한도 — 홀 수 기반)
- hall 한도: standard=1, premium=2, vip=3 (멤버십 등급별)
- 강한 계약금/위약금: 30일 전=10%, 7일 전=50%, 당일=100% 취소 수수료 (WB-006)
