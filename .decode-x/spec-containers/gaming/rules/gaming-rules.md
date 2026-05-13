# Spec Container — GAM-001 (게임 합성 도메인)

**Skill ID**: GAM-001
**Domain**: Gaming (게임 산업 — 스튜디오라이브한도/인앱결제한도/세션batchatomic/게임상태전환/만료게임일괄/환불atomic)
**Source**: SYNTHETIC — 세션 304 후속 F523, withRuleId 재사용 56번째 도메인 PoC (Advertising 다음 산업, 45번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (GM-001 ~ GM-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| GM-001 | 신규 게임 출시 요청 시 | `studio.active_live_games < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_LIVE_GAMES_PER_STUDIO) | 출시 허용 + studio.active_live_games 증가 | `E422-STUDIO-CAPACITY-EXCEEDED` (스튜디오 동시 라이브 게임 한도 초과) |
| GM-002 | 인앱 결제 요청 시 | `contract.fee_used + fee < inAppPaymentLimit` (var-vs-var, `limit` keyword 매칭) | 결제 적용 + fee_used 증가 | `E422-IN-APP-PAYMENT-LIMIT-EXCEEDED` (인앱 결제 한도 초과) |
| GM-003 | 게임 세션 atomic 요청 시 | `game_launches.status = 'published'` | atomic: game_sessions INSERT + game_launches UPDATE + store_payments INSERT | `E404-LAUNCH` |
| GM-004 | 게임 상태 전환 (registered → published → live → maintained → retired/banned) | 허용 매트릭스 충족 | `game_launches.status` UPDATE | `E404-LAUNCH`, `E409-LAUNCH` |
| GM-005 | retired 게임 세션 일괄 만료 처리 | `game_sessions.status = 'retired'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| GM-006 | 환불 (banned 세션) atomic 요청 시 | `game_sessions.status = 'banned'` | atomic: refund_claim_records INSERT + refund_claims INSERT + refund_claim_records UPDATE | `E404-BANNED-SESSION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `studios` | active_live_games 증가 (GM-001) | launchGame |
| `game_launches` | INSERT (GM-001), status 갱신 (GM-003/GM-004) | launchGame / processGameSession / transitionGameStatus |
| `store_contracts` | fee_used 증가 (GM-002) | applyInAppPurchase |
| `game_sessions` | INSERT (GM-003), batch expire (GM-005) | processGameSession / expireRetiredGameBatch |
| `store_payments` | INSERT (GM-003) | processGameSession |
| `refund_claim_records` | INSERT + status='refunded' (GM-006) | processRefundClaim |
| `refund_claims` | INSERT (GM-006) | processRefundClaim |

---

## 임계값 / 상수

- `MAX_CONCURRENT_LIVE_GAMES_PER_STUDIO = 250` (GM-001 스튜디오별 동시 라이브 게임 기본 한도, 타이틀 단위)
- `inAppPaymentLimit = store_contracts.fee_limit` (GM-002 플레이어 등급별 인앱 결제 한도, USD)

---

## 상태 머신

```
game_launches: registered → published (GM-004 transition)
game_launches: published → live (GM-003 atomic)
game_launches: live ↔ maintained (GM-004 transition)
game_launches: live|maintained → retired (GM-004 transition)
game_launches: live|published → banned (GM-004 transition)

game_sessions: live → maintained → retired (정상 종료)
game_sessions: retired → expired (GM-005 batch — 데이터 보관 기간 만료)
game_sessions: live → banned (위반 차단, GM-006 환불 대상)

refund_claim_records: pending → calculated → refunded (GM-006 atomic)
```

---

## 의존 함수 (gaming.ts)

| BL | 함수 | detector |
|----|------|----------|
| GM-001 | `launchGame` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| GM-002 | `applyInAppPurchase` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| GM-003 | `processGameSession` | AtomicTransaction (`db.transaction(...)`) |
| GM-004 | `transitionGameStatus` | StatusTransition (matrix) |
| GM-005 | `expireRetiredGameBatch` | StatusTransition (batch) |
| GM-006 | `processRefundClaim` | AtomicTransaction (`db.transaction(...)`) |
