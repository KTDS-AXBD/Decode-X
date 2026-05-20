# Spec Container — LASERTAG-001 (레이저태그 합성 도메인)

**Skill ID**: LASERTAG-001
**Domain**: Laser tag (레이저태그 산업 — 동시세션한도/장비한도/세션예약atomic/세션상태전환/closed세션일괄만료/세션환불atomic)
**Source**: SYNTHETIC — 세션 387 F559, withRuleId 재사용 90번째 도메인 PoC (Studio 다음 산업, 79번째 신규) 🔫 단일 클러스터 21 도메인 첫 사례 마일스톤 신기록 + 17 Sprint 연속 첫 사례 마일스톤 신기록 + 🏆🏆🏆 90번째 도메인 = 18배 round 마일스톤
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (LS-001 ~ LS-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| LS-001 | 신규 lasertag session 예약 요청 시 | `arenas.active_sessions < max_concurrent_sessions` (UPPERCASE fallback MAX_CONCURRENT_SESSIONS_PER_ARENA) | 세션 예약 허용 + arenas.active_sessions 증가 | `E422-ARENA-SESSION-LIMIT-EXCEEDED` |
| LS-002 | 회원 장비 예약 요청 시 | `membership.daily_used + equipment < equipmentLimit` (var-vs-var, `limit` keyword) | 장비 한도 적용 + daily_used 증가 | `E422-EQUIPMENT-LIMIT-EXCEEDED` |
| LS-003 | 세션 예약 atomic 요청 시 | `lasertag_sessions.status = 'reserved'` | atomic: equipment_schedules INSERT + lasertag_sessions UPDATE + session_payments INSERT | `E404-SESSION` |
| LS-004 | session 상태 전환 (reserved → ongoing → ended / closed / cancelled) | 허용 매트릭스 충족 | `lasertag_sessions.status` UPDATE | `E404-SESSION`, `E409-SESSION` |
| LS-005 | closed session 일괄 만료 처리 | `lasertag_sessions.status = 'closed'` AND `reserved_at <= now` | `status='ended'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| LS-006 | session 환불 atomic 요청 시 | `lasertag_sessions.status = 'cancelled'` | atomic: cancelled_fee_records INSERT + session_refunds INSERT + cancelled_fee_records UPDATE (그룹 환불 정책) | `E404-CANCELLED-SESSION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `arenas` | active_sessions 증가 (LS-001) | reserveSession |
| `lasertag_sessions` | INSERT (LS-001), status 갱신 (LS-003/LS-004/LS-005) | reserveSession / processSessionBooking / transitionSessionStatus / expireClosedSessionBatch |
| `memberships` | daily_used 증가 (LS-002) | applyEquipmentLimit |
| `equipment_schedules` | INSERT (LS-003) | processSessionBooking |
| `session_payments` | INSERT (LS-003) | processSessionBooking |
| `cancelled_fee_records` | INSERT + status='refunded' (LS-006) | processSessionRefund |
| `session_refunds` | INSERT (LS-006) | processSessionRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_SESSIONS_PER_ARENA = 10` (LS-001 아레나별 동시 active session 기본 한도 — 소형 레이저태그 아레나 기반)
- 장비 한도: basic=2, silver=4, gold=8 (멤버십 등급별 일일 장비 예약 가능 수)
- 환불 정책: basic=50% 취소 수수료, silver=25%, gold=10% (LS-006, 그룹 예약 기준)
- 이용 시간: 시간제 30분/60분 패키지 (개인전/팀전/VIP 맵 포함, map_level: beginner/advanced/expert)
