# Spec Container — GAM-001 (카지노/베팅 합성 도메인)

**Skill ID**: GAM-001
**Domain**: Gambling (카지노/베팅 산업 — 카지노bet한도/playerdailybet한도/정산batchatomic/bet상태전환/만료voidedbet일괄/wager환불atomic)
**Source**: SYNTHETIC — 세션 306 후속 F533, withRuleId 재사용 65번째 도메인 PoC (Art 다음 산업, 54번째 신규) 🏆 65번째 도메인 마일스톤
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (GA-001 ~ GA-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| GA-001 | 신규 bet 요청 시 | `casino.active_bets < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_ACTIVE_BETS_PER_CASINO) | bet 등록 허용 + casino.active_bets 증가 | `E422-CASINO-CAPACITY-EXCEEDED` |
| GA-002 | 플레이어 bet 요청 시 | `contract.bet_used + bet < dailyBetLimit` (var-vs-var, `limit` keyword) | bet 적용 + bet_used 증가 | `E422-DAILY-BET-LIMIT-EXCEEDED` |
| GA-003 | bet 정산 atomic 요청 시 | `game_schedules.status = 'placed'` | atomic: bets INSERT + game_schedules UPDATE + wager_payments INSERT | `E404-SCHEDULE` |
| GA-004 | bet 상태 전환 (placed → active → updated → settled / voided / cancelled) | 허용 매트릭스 충족 | `game_schedules.status` UPDATE | `E404-SCHEDULE`, `E409-SCHEDULE` |
| GA-005 | voided bet 일괄 만료 처리 | `bets.status = 'voided'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| GA-006 | wager 환불 (voided) atomic 요청 시 | `bets.status = 'voided'` | atomic: wager_refund_records INSERT + wager_refunds INSERT + wager_refund_records UPDATE | `E404-VOIDED-BET` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `casinos` | active_bets 증가 (GA-001) | placeBet |
| `game_schedules` | INSERT (GA-001), status 갱신 (GA-003/GA-004) | placeBet / processBetSettlement / transitionBetStatus |
| `player_contracts` | bet_used 증가 (GA-002) | applyBetLimit |
| `bets` | INSERT (GA-003), batch expire (GA-005) | processBetSettlement / expireVoidedBetBatch |
| `wager_payments` | INSERT (GA-003) | processBetSettlement |
| `wager_refund_records` | INSERT + status='refunded' (GA-006) | processWagerRefund |
| `wager_refunds` | INSERT (GA-006) | processWagerRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_ACTIVE_BETS_PER_CASINO = 200` (GA-001 카지노별 동시 active bet 기본 한도, 일반 카지노 테이블/슬롯 동시 진행 가능 베팅 수)
- `dailyBetLimit = player_contracts.bet_limit` (GA-002 플레이어 등급별 일일 bet 한도, 책임도박 정책 연계)

---

## 상태 머신

```
game_schedules: placed → active (GA-003 atomic)
game_schedules: active ↔ updated (GA-004 transition, 베팅 수정)
game_schedules: active|updated → settled (GA-004 transition, 정산 종료)
game_schedules: placed|active → voided (GA-004 transition, 책임도박/디스퓨트)
game_schedules: placed|active → cancelled (GA-004 transition)

bets: active → updated → settled (정상 종료)
bets: voided → expired (GA-005 batch — 데이터 보관 기간 만료)
bets: active → voided (책임도박/디스퓨트, GA-006 wager 환불 대상)

wager_refund_records: pending → calculated → refunded (GA-006 atomic)
```

---

## 의존 함수 (gambling.ts)

| BL | 함수 | detector |
|----|------|----------|
| GA-001 | `placeBet` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| GA-002 | `applyBetLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| GA-003 | `processBetSettlement` | AtomicTransaction (`db.transaction(...)`) |
| GA-004 | `transitionBetStatus` | StatusTransition (matrix) |
| GA-005 | `expireVoidedBetBatch` | StatusTransition (batch) |
| GA-006 | `processWagerRefund` | AtomicTransaction (`db.transaction(...)`) |
