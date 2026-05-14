# Spec Container — BCT-001 (방송 합성 도메인)

**Skill ID**: BCT-001
**Domain**: Broadcast (방송 산업 — 방송국broadcast한도/viewershipdaily한도/송출batchatomic/broadcast상태전환/만료broadcast일괄/sponsor환불atomic)
**Source**: SYNTHETIC — 세션 305 후속3 F528, withRuleId 재사용 60번째 도메인 PoC (News 다음 산업, 49번째 신규) 🏆 60 Sprint round 마일스톤
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (BR-001 ~ BR-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| BR-001 | 신규 broadcast schedule 요청 시 | `station.active_broadcasts < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_ACTIVE_BROADCASTS_PER_STATION) | schedule 허용 + station.active_broadcasts 증가 | `E422-STATION-CAPACITY-EXCEEDED` (방송국 동시 active broadcast 한도 초과) |
| BR-002 | 광고주 viewership 요청 시 | `contract.viewership_used + viewership < dailyViewershipLimit` (var-vs-var, `limit` keyword 매칭) | viewership 적용 + viewership_used 증가 | `E422-DAILY-VIEWERSHIP-LIMIT-EXCEEDED` (일일 viewership 한도 초과) |
| BR-003 | broadcast 송출 atomic 요청 시 | `broadcast_schedules.status = 'scheduled'` | atomic: airings INSERT + broadcast_schedules UPDATE + sponsor_payments INSERT | `E404-SCHEDULE` |
| BR-004 | broadcast 상태 전환 (scheduled → airing → updated → archived / preempted / cancelled) | 허용 매트릭스 충족 | `broadcast_schedules.status` UPDATE | `E404-SCHEDULE`, `E409-SCHEDULE` |
| BR-005 | preempted broadcast 송출 일괄 만료 처리 | `airings.status = 'preempted'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| BR-006 | sponsor 환불 (preempted) atomic 요청 시 | `airings.status = 'preempted'` | atomic: sponsor_refund_records INSERT + sponsor_refunds INSERT + sponsor_refund_records UPDATE | `E404-PREEMPTED-AIRING` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `stations` | active_broadcasts 증가 (BR-001) | scheduleBroadcast |
| `broadcast_schedules` | INSERT (BR-001), status 갱신 (BR-003/BR-004) | scheduleBroadcast / processAiring / transitionBroadcastStatus |
| `sponsor_contracts` | viewership_used 증가 (BR-002) | applyViewershipLimit |
| `airings` | INSERT (BR-003), batch expire (BR-005) | processAiring / expirePreemptedBroadcastBatch |
| `sponsor_payments` | INSERT (BR-003) | processAiring |
| `sponsor_refund_records` | INSERT + status='refunded' (BR-006) | processSponsorRefund |
| `sponsor_refunds` | INSERT (BR-006) | processSponsorRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_ACTIVE_BROADCASTS_PER_STATION = 24` (BR-001 방송국별 동시 active broadcast 기본 한도, 24시간 편성 단위)
- `dailyViewershipLimit = sponsor_contracts.viewership_limit` (BR-002 광고주 등급별 일일 viewership 한도, 광고 reach)

---

## 상태 머신

```
broadcast_schedules: scheduled → airing (BR-003 atomic)
broadcast_schedules: airing ↔ updated (BR-004 transition, 편성 변경)
broadcast_schedules: airing|updated → archived (BR-004 transition)
broadcast_schedules: scheduled|airing → preempted (BR-004 transition, 긴급 보도/예방 취소)
broadcast_schedules: scheduled|airing → cancelled (BR-004 transition, 정상 취소)

airings: live → updated → archived (정상 종료)
airings: preempted → expired (BR-005 batch — 데이터 보관 기간 만료)
airings: live → preempted (긴급 중단, BR-006 sponsor 환불 대상)

sponsor_refund_records: pending → calculated → refunded (BR-006 atomic)
```

---

## 의존 함수 (broadcast.ts)

| BL | 함수 | detector |
|----|------|----------|
| BR-001 | `scheduleBroadcast` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| BR-002 | `applyViewershipLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| BR-003 | `processAiring` | AtomicTransaction (`db.transaction(...)`) |
| BR-004 | `transitionBroadcastStatus` | StatusTransition (matrix) |
| BR-005 | `expirePreemptedBroadcastBatch` | StatusTransition (batch) |
| BR-006 | `processSponsorRefund` | AtomicTransaction (`db.transaction(...)`) |
