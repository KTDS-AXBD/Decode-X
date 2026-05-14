# Spec Container — RAD-001 (라디오 합성 도메인)

**Skill ID**: RAD-001
**Domain**: Radio (라디오 산업 — 채널program한도/listenershipdaily한도/송출batchatomic/program상태전환/만료broadcast일괄/sponsor환불atomic)
**Source**: SYNTHETIC — 세션 305 후속6 F531, withRuleId 재사용 63번째 도메인 PoC (Podcast 다음 산업, 52번째 신규) 🏆🏆 1세션 9 Sprint 신기록
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (RA-001 ~ RA-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| RA-001 | 신규 program schedule 요청 시 | `channel.active_programs < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_ACTIVE_PROGRAMS_PER_CHANNEL) | schedule 허용 + channel.active_programs 증가 | `E422-CHANNEL-CAPACITY-EXCEEDED` |
| RA-002 | 광고주 listenership 요청 시 | `contract.listenership_used + listenership < dailyListenershipLimit` (var-vs-var, `limit` keyword) | listenership 적용 + listenership_used 증가 | `E422-DAILY-LISTENERSHIP-LIMIT-EXCEEDED` |
| RA-003 | program 송출 atomic 요청 시 | `program_schedules.status = 'scheduled'` | atomic: broadcasts INSERT + program_schedules UPDATE + sponsor_payments INSERT | `E404-SCHEDULE` |
| RA-004 | program 상태 전환 (scheduled → airing → updated → archived / preempted / cancelled) | 허용 매트릭스 충족 | `program_schedules.status` UPDATE | `E404-SCHEDULE`, `E409-SCHEDULE` |
| RA-005 | preempted broadcast 일괄 만료 처리 | `broadcasts.status = 'preempted'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| RA-006 | sponsor 환불 (preempted) atomic 요청 시 | `broadcasts.status = 'preempted'` | atomic: sponsor_refund_records INSERT + sponsor_refunds INSERT + sponsor_refund_records UPDATE | `E404-PREEMPTED-BROADCAST` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `channels` | active_programs 증가 (RA-001) | scheduleProgram |
| `program_schedules` | INSERT (RA-001), status 갱신 (RA-003/RA-004) | scheduleProgram / processBroadcast / transitionProgramStatus |
| `sponsor_contracts` | listenership_used 증가 (RA-002) | applyListenershipLimit |
| `broadcasts` | INSERT (RA-003), batch expire (RA-005) | processBroadcast / expirePreemptedBroadcastBatch |
| `sponsor_payments` | INSERT (RA-003) | processBroadcast |
| `sponsor_refund_records` | INSERT + status='refunded' (RA-006) | processSponsorRefund |
| `sponsor_refunds` | INSERT (RA-006) | processSponsorRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_ACTIVE_PROGRAMS_PER_CHANNEL = 48` (RA-001 채널별 동시 active program 기본 한도, 30분 슬롯 24시간 × 2)
- `dailyListenershipLimit = sponsor_contracts.listenership_limit` (RA-002 광고주 등급별 일일 listenership 한도, 청취자수)

---

## 상태 머신

```
program_schedules: scheduled → airing (RA-003 atomic)
program_schedules: airing ↔ updated (RA-004 transition, 편성 변경)
program_schedules: airing|updated → archived (RA-004 transition)
program_schedules: scheduled|airing → preempted (RA-004 transition, 긴급 보도/예방 취소)
program_schedules: scheduled|airing → cancelled (RA-004 transition)

broadcasts: live → updated → archived (정상 종료)
broadcasts: preempted → expired (RA-005 batch — 데이터 보관 기간 만료)
broadcasts: live → preempted (긴급 중단, RA-006 sponsor 환불 대상)

sponsor_refund_records: pending → calculated → refunded (RA-006 atomic)
```

---

## 의존 함수 (radio.ts)

| BL | 함수 | detector |
|----|------|----------|
| RA-001 | `scheduleProgram` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| RA-002 | `applyListenershipLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| RA-003 | `processBroadcast` | AtomicTransaction (`db.transaction(...)`) |
| RA-004 | `transitionProgramStatus` | StatusTransition (matrix) |
| RA-005 | `expirePreemptedBroadcastBatch` | StatusTransition (batch) |
| RA-006 | `processSponsorRefund` | AtomicTransaction (`db.transaction(...)`) |
