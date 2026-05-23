---
id: AIF-DSGN-390
sprint: 390
f_items: [F562]
status: DONE
created: "2026-05-23"
---

# Sprint 390 Design — F562 AC Arcade

## 도메인 특성
AC Arcade (아케이드 게임센터) — token 기반 prepaid + machine 다양성 (rhythm/racing/redemption) + machine fault event + prize ticket system + redemption shop + family-friendly variety. B2C 가족/청소년 30분~수시간 + token 단위 사용 + 상품 교환 + machine 장애 양보 정책.

동시 한도: 30 (arcade별 동시 active machine, 중형 아케이드 30 machine 기준)

## 함수-파일 매핑

| 함수 | BL | 탐지기 |
|------|----|--------|
| `enterMachine` | AC-001 | ThresholdCheck (active_machines >= MAX_CONCURRENT_MACHINES_PER_ARCADE) |
| `applyTokenLimit` | AC-002 | ThresholdCheck (daily_used + tokenCost >= tokenLimit, var-vs-var) |
| `processTokenCharge` | AC-003 | AtomicTransaction (arcade_sessions+token_ledger+session_payments) |
| `transitionMachineStatus` | AC-004 | StatusTransition (idle→active→paused→ended/fault/cancelled) |
| `expireEndedSessionBatch` | AC-005 | StatusTransition batch (ended→completed) |
| `processTokenRefund` | AC-006 | AtomicTransaction (cancelled_token_records+token_refunds) |

## 스키마
- `arcades`: id, name, max_concurrent_machines, active_machines, status
- `memberships`: id, member_id, arcade_id, membership_type, token_limit, daily_used, status
- `arcade_sessions`: id, arcade_id, membership_id, machine_id, payment_id, status, started_at
- `token_ledger`: id, member_id, session_id, machine_id, tokens_used, tokens_remaining, recorded_at
- `session_payments`: id, session_id, machine_id, amount, status, paid_at
- `cancelled_token_records`: id, member_id, session_id, token_balance, prize_tickets, refund_tokens, status
- `token_refunds`: id, fee_record_id, member_id, tokens, status, refunded_at

## BL_ID_PATTERN 확장
89 prefix → 90 prefix: `AC` 추가 (AB-006 없음 → AD-001 앞에 위치)
