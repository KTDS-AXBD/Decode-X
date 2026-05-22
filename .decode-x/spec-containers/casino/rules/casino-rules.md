# Spec Container — CASINO-001 (카지노 합성 도메인)

**Skill ID**: CASINO-001
**Domain**: Casino (카지노 산업 — 동시세션한도/베팅한도/테이블예약atomic/세션상태전환/closed세션일괄만료/캐시아웃atomic)
**Source**: SYNTHETIC — 세션 388 F560, withRuleId 재사용 91번째 도메인 PoC (Laser tag 다음 산업, 80번째 신규) 🎰 단일 클러스터 22 도메인 첫 사례 마일스톤 신기록 + 18 Sprint 연속 첫 사례 마일스톤 신기록 + 🏆🏆 80 신규 산업 round 마일스톤
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (CA-001 ~ CA-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| CA-001 | 신규 casino session 등록 요청 시 | `gaming_floors.active_sessions < max_concurrent_sessions` (UPPERCASE fallback MAX_CONCURRENT_SESSIONS_PER_FLOOR) | 세션 등록 허용 + gaming_floors.active_sessions 증가 | `E422-FLOOR-SESSION-LIMIT-EXCEEDED` |
| CA-002 | 회원 베팅 요청 시 | `membership.daily_used + betAmount < bettingLimit` (var-vs-var, `limit` keyword) | 베팅 한도 적용 + daily_used 증가 | `E422-BETTING-LIMIT-EXCEEDED` |
| CA-003 | 테이블 예약 atomic 요청 시 | `casino_sessions.status = 'registered'` | atomic: table_schedules INSERT + casino_sessions UPDATE + session_payments INSERT + chip_ledger INSERT | `E404-SESSION` |
| CA-004 | session 상태 전환 (registered → seated → playing → cashout / closed / barred) | 허용 매트릭스 충족 | `casino_sessions.status` UPDATE | `E404-SESSION`, `E409-SESSION` |
| CA-005 | closed session 일괄 만료 처리 | `casino_sessions.status = 'closed'` AND `registered_at <= now` | `status='cashout'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| CA-006 | cashout atomic 요청 시 | `casino_sessions.status = 'cashout'` | atomic: cashout_records INSERT + session_refunds INSERT + cashout_records UPDATE (칩 현금 교환 + jackpot 페이아웃 정책) | `E404-CASHOUT-SESSION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `gaming_floors` | active_sessions 증가 (CA-001) | registerSession |
| `casino_sessions` | INSERT (CA-001), status 갱신 (CA-003/CA-004/CA-005) | registerSession / processTableBooking / transitionSessionStatus / expireClosedSessionBatch |
| `memberships` | daily_used 증가 (CA-002) | applyBettingLimit |
| `table_schedules` | INSERT (CA-003) | processTableBooking |
| `session_payments` | INSERT (CA-003) | processTableBooking |
| `chip_ledger` | INSERT (CA-003) | processTableBooking |
| `cashout_records` | INSERT + status='paid' (CA-006) | processCashout |
| `session_refunds` | INSERT (CA-006) | processCashout |

---

## 임계값 / 상수

- `MAX_CONCURRENT_SESSIONS_PER_FLOOR = 20` (CA-001 floor별 동시 active session 기본 한도 — 대형 카지노 floor 기준)
- 베팅 한도: basic=500000, silver=2000000, gold=10000000, vip=무제한 (멤버십 등급별 일일 베팅 가능 금액, 원 단위)
- Credit line: basic=0, silver=1000000, gold=5000000, vip=협의 (CA-002, cage 신용 한도)
- Cashout 정책: chip_amount × cashoutRate(1.0) + jackpotAmount (CA-006, jackpot 특별 페이아웃 포함)
- Responsible gaming: 일일 한도 초과 시 자동 barred 전환 (CA-004, 책임 도박 정책)
