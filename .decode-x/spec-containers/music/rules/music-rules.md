# Spec Container — MUS-001 (음악 스트리밍 합성 도메인)

**Skill ID**: MUS-001
**Domain**: Music streaming (음악 스트리밍 산업 — 동시스트림한도/로열티수수료한도/재생atomic/세션상태전환/플레이리스트퇴역배치/구독취소환불atomic)
**Source**: SYNTHETIC — 세션 300 F509, withRuleId 재사용 51번째 도메인 PoC (Aerospace 다음 산업, 40번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (MU-001 ~ MU-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| MU-001 | 신규 스트리밍 세션 요청 시 | `tier.active_sessions < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_SESSIONS_PER_TIER) | 세션 허용 + tier.active_sessions 증가 | `E422-STREAMING-TIER-CAPACITY-EXCEEDED` (동시 세션 정원 초과) |
| MU-002 | 로열티 수수료 사용 요청 시 | `contract.fee_used + fee < royaltyPayoutLimit` (var-vs-var, `limit` keyword 매칭) | 수수료 적용 + fee_used 증가 | `E422-ROYALTY-PAYOUT-LIMIT-EXCEEDED` (로열티 수수료 한도 초과) |
| MU-003 | 트랙 재생 atomic 요청 시 | `playback_sessions.status = 'confirmed'` | atomic: track_plays INSERT + playback_sessions UPDATE + royalty_payouts INSERT | `E404-SESSION` |
| MU-004 | 세션 상태 전환 (pending → confirmed → playing → paused → completed/aborted) | 허용 매트릭스 충족 | `playback_sessions.status` UPDATE | `E404-SESSION`, `E409-SESSION` |
| MU-005 | completed 트랙 플레이 일괄 만료 처리 | `track_plays.status = 'completed'` AND `played_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| MU-006 | 구독 취소 환불 atomic 요청 시 | `track_plays.status = 'playing'` | atomic: cancellation_refund_records INSERT + cancellation_refunds INSERT + cancellation_refund_records UPDATE | `E404-PLAYING-TRACK` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `streaming_tiers` | active_sessions 증가 (MU-001) | startStream |
| `playback_sessions` | INSERT (MU-001), status 갱신 (MU-003/MU-004) | startStream / playTrack / transitionSessionStatus |
| `royalty_contracts` | fee_used 증가 (MU-002) | applyRoyaltyTier |
| `track_plays` | INSERT (MU-003), batch expire (MU-005) | playTrack / expireTrackPlayBatch |
| `royalty_payouts` | INSERT (MU-003) | playTrack |
| `cancellation_refund_records` | INSERT + status='refunded' (MU-006) | processCancellationRefund |
| `cancellation_refunds` | INSERT (MU-006) | processCancellationRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_SESSIONS_PER_TIER = 50` (MU-001 음악 스트리밍 티어 동시 세션 정원 기본 한도, 개)
- `royaltyPayoutLimit = royalty_contracts.fee_limit` (MU-002 아티스트 등급별 로열티 수수료 한도, 원)

---

## 상태 머신

```
playback_sessions: pending → confirmed (MU-004 transition)
playback_sessions: confirmed → playing (MU-003 atomic)
playback_sessions: playing → paused (MU-004 transition)
playback_sessions: paused → playing (MU-004 resume)
playback_sessions: playing → completed (MU-004 transition)
playback_sessions: pending|confirmed → aborted (MU-004 transition)

track_plays: playing → completed (정상 종료)
track_plays: completed → expired (MU-005 batch)

cancellation_refund_records: pending → calculated → refunded (MU-006 atomic)
```

---

## 의존 함수 (music.ts)

| BL | 함수 | detector |
|----|------|----------|
| MU-001 | `startStream` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| MU-002 | `applyRoyaltyTier` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| MU-003 | `playTrack` | AtomicTransaction (`db.transaction(...)`) |
| MU-004 | `transitionSessionStatus` | StatusTransition (matrix) |
| MU-005 | `expireTrackPlayBatch` | StatusTransition (batch) |
| MU-006 | `processCancellationRefund` | AtomicTransaction (`db.transaction(...)`) |
