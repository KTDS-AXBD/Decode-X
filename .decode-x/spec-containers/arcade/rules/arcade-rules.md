# Spec Container — ARCADE-001 (아케이드 합성 도메인)

**Skill ID**: ARCADE-001
**Domain**: Arcade (아케이드 산업 — 동시machine한도/token한도/token충전atomic/machine상태전환/ended세션일괄만료/token환불atomic)
**Source**: SYNTHETIC — 세션 390 F562, withRuleId 재사용 93번째 도메인 PoC (Bowling 다음 산업, 82번째 신규) 🕹️ 단일 클러스터 24 도메인 첫 사례 마일스톤 신기록 + 20 Sprint 연속 첫 사례 마일스톤 신기록
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (AC-001 ~ AC-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| AC-001 | 신규 arcade session 진입 요청 시 | `arcades.active_machines < max_concurrent_machines` (UPPERCASE fallback MAX_CONCURRENT_MACHINES_PER_ARCADE) | machine 진입 허용 + arcades.active_machines 증가 | `E422-MACHINE-LIMIT-EXCEEDED` |
| AC-002 | 회원 token 사용 요청 시 | `membership.daily_used + tokenCost < tokenLimit` (var-vs-var, `tokenLimit` keyword) | token 한도 적용 + daily_used 증가 | `E422-TOKEN-LIMIT-EXCEEDED` |
| AC-003 | token 충전/사용 atomic 요청 시 | `arcade_sessions.status = 'idle'` | atomic: token_ledger INSERT + arcade_sessions UPDATE + session_payments INSERT | `E404-SESSION` |
| AC-004 | machine session 상태 전환 (idle → active → paused → ended / fault / cancelled) | 허용 매트릭스 충족 | `arcade_sessions.status` UPDATE | `E404-SESSION`, `E409-SESSION` |
| AC-005 | ended session 일괄 만료 처리 | `arcade_sessions.status = 'ended'` AND `started_at <= now` | `status='cancelled'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| AC-006 | token 환불 atomic (prize ticket redemption 정책) | `arcade_sessions.status = 'cancelled'` | atomic: cancelled_token_records INSERT + token_refunds INSERT + cancelled_token_records UPDATE | `E404-CANCELLED-SESSION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `arcades` | active_machines 증가 (AC-001) | enterMachine |
| `arcade_sessions` | INSERT (AC-001), status 갱신 (AC-003/AC-004/AC-005) | enterMachine / processTokenCharge / transitionMachineStatus / expireEndedSessionBatch |
| `memberships` | daily_used 증가 (AC-002) | applyTokenLimit |
| `token_ledger` | INSERT (AC-003) | processTokenCharge |
| `session_payments` | INSERT (AC-003) | processTokenCharge |
| `cancelled_token_records` | INSERT + status='refunded' (AC-006) | processTokenRefund |
| `token_refunds` | INSERT (AC-006) | processTokenRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_MACHINES_PER_ARCADE = 30` (AC-001 arcade별 동시 active machine 기본 한도 — 중형 아케이드 30 machine 기준)
- token 한도: basic=100, silver=300, gold=600, vip=무제한 (멤버십 등급별 일일 token 사용량, AC-002)
- prize ticket redemption: 잔여 token에서 prize_tickets 수 차감 후 환불 (AC-006)
- machine 종류: rhythm(리듬게임) / racing(레이싱) / redemption(경품기) / shooter(슈팅) / crane(크레인)
- machine fault 양보 정책: fault 발생 시 tokens_used의 50% 환불 가능 (AC-006 확장 케이스)
