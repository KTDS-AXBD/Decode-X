# Spec Container — ESP-001 (이스포츠 합성 도메인)

**Skill ID**: ESP-001
**Domain**: Esports (이스포츠 산업 — 조직위tournament한도/팀prizedaily한도/match batchatomic/tournament상태전환/만료match일괄/prize회수atomic)
**Source**: SYNTHETIC — 세션 305 후속4 F529, withRuleId 재사용 61번째 도메인 PoC (Broadcast 다음 산업, 50번째 신규) 🏆🏆 50 신규 산업 round 마일스톤
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (ER-001 ~ ER-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| ER-001 | 신규 tournament 등록 요청 시 | `organizer.active_tournaments < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_ACTIVE_TOURNAMENTS_PER_ORGANIZER) | 등록 허용 + organizer.active_tournaments 증가 | `E422-ORGANIZER-CAPACITY-EXCEEDED` (조직위 동시 active tournament 한도 초과) |
| ER-002 | 팀 prize 수령 요청 시 | `contract.prize_earned + prize < dailyPrizeLimit` (var-vs-var, `limit` keyword 매칭) | prize 적용 + prize_earned 증가 | `E422-DAILY-PRIZE-LIMIT-EXCEEDED` (일일 prize 한도 초과) |
| ER-003 | match 진행 atomic 요청 시 | `tournament_schedules.status = 'registered'` | atomic: matches INSERT + tournament_schedules UPDATE + prize_distributions INSERT | `E404-SCHEDULE` |
| ER-004 | tournament 상태 전환 (announced → registered → live → completed → archived / cancelled / forfeited) | 허용 매트릭스 충족 | `tournament_schedules.status` UPDATE | `E404-SCHEDULE`, `E409-SCHEDULE` |
| ER-005 | forfeited match 일괄 만료 처리 | `matches.status = 'forfeited'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| ER-006 | prize 회수 (forfeited) atomic 요청 시 | `matches.status = 'forfeited'` | atomic: prize_clawback_records INSERT + prize_clawbacks INSERT + prize_clawback_records UPDATE | `E404-FORFEITED-MATCH` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `organizers` | active_tournaments 증가 (ER-001) | registerTournament |
| `tournament_schedules` | INSERT (ER-001), status 갱신 (ER-003/ER-004) | registerTournament / processMatch / transitionTournamentStatus |
| `team_contracts` | prize_earned 증가 (ER-002) | applyPrizeLimit |
| `matches` | INSERT (ER-003), batch expire (ER-005) | processMatch / expireForfeitedMatchBatch |
| `prize_distributions` | INSERT (ER-003) | processMatch |
| `prize_clawback_records` | INSERT + status='clawed_back' (ER-006) | processPrizeClawback |
| `prize_clawbacks` | INSERT (ER-006) | processPrizeClawback |

---

## 임계값 / 상수

- `MAX_CONCURRENT_ACTIVE_TOURNAMENTS_PER_ORGANIZER = 16` (ER-001 조직위별 동시 active tournament 기본 한도, 운영 인력 한계)
- `dailyPrizeLimit = team_contracts.prize_limit` (ER-002 팀 등급별 일일 prize 한도, USD)

---

## 상태 머신

```
tournament_schedules: announced → registered (ER-004 transition, 참가 등록)
tournament_schedules: registered → live (ER-003 atomic, 경기 시작)
tournament_schedules: live → completed (ER-004 transition, 정상 종료)
tournament_schedules: completed → archived (ER-004 transition)
tournament_schedules: announced|registered → cancelled (ER-004 transition, 취소)
tournament_schedules: registered|live → forfeited (ER-004 transition, 포기/실격)

matches: live → completed → archived (정상 종료)
matches: forfeited → expired (ER-005 batch — 데이터 보관 기간 만료)
matches: live → forfeited (실격/포기, ER-006 prize 회수 대상)

prize_clawback_records: pending → calculated → clawed_back (ER-006 atomic)
```

---

## 의존 함수 (esports.ts)

| BL | 함수 | detector |
|----|------|----------|
| ER-001 | `registerTournament` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| ER-002 | `applyPrizeLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| ER-003 | `processMatch` | AtomicTransaction (`db.transaction(...)`) |
| ER-004 | `transitionTournamentStatus` | StatusTransition (matrix) |
| ER-005 | `expireForfeitedMatchBatch` | StatusTransition (batch) |
| ER-006 | `processPrizeClawback` | AtomicTransaction (`db.transaction(...)`) |
