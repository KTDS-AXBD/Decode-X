# Spec Container — BILLIARDS-001 (당구장 합성 도메인)

**Skill ID**: BILLIARDS-001
**Domain**: Billiards (당구장 산업 — 동시table한도/hour한도/table예약atomic/session상태전환/ended세션일괄만료/session환불atomic)
**Source**: SYNTHETIC — 세션 391 F563, withRuleId 재사용 94번째 도메인 PoC (Arcade 다음 산업, 83번째 신규) 🎱 단일 클러스터 25 도메인 첫 사례 마일스톤 신기록 + 21 Sprint 연속 첫 사례 마일스톤 신기록
**Rule prefix**: BI (BIlliards) — "BL" reserved for lpon business logic rules (BL-001~042)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (BI-001 ~ BI-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| BI-001 | 신규 billiards session 예약 요청 시 | `billiard_halls.active_tables < max_concurrent_tables` (UPPERCASE fallback MAX_CONCURRENT_TABLES_PER_HALL) | table 예약 허용 + billiard_halls.active_tables 증가 | `E422-TABLE-LIMIT-EXCEEDED` |
| BI-002 | 회원 hour 사용 요청 시 | `membership.daily_used + hours < hourLimit` (var-vs-var, `hourLimit` keyword) | hour 한도 적용 + daily_used 증가 | `E422-HOUR-LIMIT-EXCEEDED` |
| BI-003 | table 예약 atomic 요청 시 | `billiards_sessions.status = 'reserved'` | atomic: table_schedules INSERT + billiards_sessions UPDATE + session_payments INSERT + cue_inventory INSERT | `E404-SESSION` |
| BI-004 | session 상태 전환 (reserved → started → playing → ended / abandoned / cancelled) | 허용 매트릭스 충족 | `billiards_sessions.status` UPDATE | `E404-SESSION`, `E409-SESSION` |
| BI-005 | ended session 일괄 만료 처리 | `billiards_sessions.status = 'ended'` AND `reserved_at <= now` | `status='cancelled'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| BI-006 | session 환불 atomic (cue 파손 변상 정책) | `billiards_sessions.status = 'cancelled'` | atomic: cancelled_session_records INSERT + session_refunds INSERT + cancelled_session_records UPDATE | `E404-CANCELLED-SESSION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `billiard_halls` | active_tables 증가 (BI-001) | reserveTable |
| `billiards_sessions` | INSERT (BI-001), status 갱신 (BI-003/BI-004/BI-005) | reserveTable / processTableBooking / transitionSessionStatus / expireEndedSessionBatch |
| `memberships` | daily_used 증가 (BI-002) | applyHourLimit |
| `table_schedules` | INSERT (BI-003) | processTableBooking |
| `session_payments` | INSERT (BI-003) | processTableBooking |
| `cue_inventory` | INSERT (BI-003) | processTableBooking |
| `cancelled_session_records` | INSERT + status='refunded' (BI-006) | processSessionRefund |
| `session_refunds` | INSERT (BI-006) | processSessionRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_TABLES_PER_HALL = 20` (BI-001 hall별 동시 active table 기본 한도 — 중형 당구장 20 table 기준)
- hour 한도: basic=3h, silver=5h, gold=8h, vip=무제한 (멤버십 등급별 일일 이용 시간, BI-002)
- cue 파손 변상: 파손 cue당 변상 요금 차감 후 환불 (BI-006)
- table 종류: 4구(Four-ball) / 3구(Carom/3-cushion) / 포켓볼(Pocket billiards) / 스누커(Snooker)
- 단체 이용: 2~4인 party 동일 table 공유, party_size 기록
- session 상태: reserved(예약) → started(table 점유) → playing(게임 시작) → ended(정상 종료) / abandoned(이탈) / cancelled(취소)
