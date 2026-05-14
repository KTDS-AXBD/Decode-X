# Spec Container — SMD-001 (소셜미디어 합성 도메인)

**Skill ID**: SMD-001
**Domain**: SocialMedia (소셜미디어 산업 — 계정post한도/일일monetization한도/피드batchatomic/post상태전환/만료post일괄/크리에이터payout회수atomic)
**Source**: SYNTHETIC — 세션 305 후속 F526, withRuleId 재사용 58번째 도메인 PoC (Video 다음 산업, 47번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (SM-001 ~ SM-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| SM-001 | 신규 post 발행 요청 시 | `account.active_published_posts < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_ACTIVE_POSTS_PER_ACCOUNT) | 발행 허용 + account.active_published_posts 증가 | `E422-ACCOUNT-CAPACITY-EXCEEDED` (계정 동시 active post 한도 초과) |
| SM-002 | 크리에이터 monetization 요청 시 | `contract.monetization_used + earnings < dailyMonetizationLimit` (var-vs-var, `limit` keyword 매칭) | monetization 적용 + monetization_used 증가 | `E422-DAILY-MONETIZATION-LIMIT-EXCEEDED` (일일 monetization 한도 초과) |
| SM-003 | post 피드 atomic 요청 시 | `post_publishes.status = 'reviewed'` | atomic: post_feeds INSERT + post_publishes UPDATE + ad_distributions INSERT | `E404-PUBLISH` |
| SM-004 | post 상태 전환 (draft → reviewed → published → restricted → archived / reported → removed) | 허용 매트릭스 충족 | `post_publishes.status` UPDATE | `E404-PUBLISH`, `E409-PUBLISH` |
| SM-005 | removed post 피드 일괄 만료 처리 | `post_feeds.status = 'removed'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| SM-006 | 크리에이터 payout 회수 (removed feed) atomic 요청 시 | `post_feeds.status = 'removed'` | atomic: creator_payout_clawback_records INSERT + creator_payout_clawbacks INSERT + creator_payout_clawback_records UPDATE | `E404-REMOVED-FEED` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `accounts` | active_published_posts 증가 (SM-001) | publishPost |
| `post_publishes` | INSERT (SM-001), status 갱신 (SM-003/SM-004) | publishPost / processFeedDistribution / transitionPostStatus |
| `monetization_contracts` | monetization_used 증가 (SM-002) | applyMonetizationLimit |
| `post_feeds` | INSERT (SM-003), batch expire (SM-005) | processFeedDistribution / expireRemovedPostBatch |
| `ad_distributions` | INSERT (SM-003) | processFeedDistribution |
| `creator_payout_clawback_records` | INSERT + status='clawed_back' (SM-006) | processCreatorClawback |
| `creator_payout_clawbacks` | INSERT (SM-006) | processCreatorClawback |

---

## 임계값 / 상수

- `MAX_CONCURRENT_ACTIVE_POSTS_PER_ACCOUNT = 10000` (SM-001 계정별 동시 active post 기본 한도, UGC 운영 한도)
- `dailyMonetizationLimit = monetization_contracts.monetization_limit` (SM-002 크리에이터 등급별 일일 monetization 한도, USD)

---

## 상태 머신

```
post_publishes: draft → reviewed (SM-004 transition)
post_publishes: reviewed → published (SM-003 atomic)
post_publishes: published ↔ restricted (SM-004 transition)
post_publishes: published|restricted → archived (SM-004 transition)
post_publishes: published|reviewed → reported (SM-004 transition)
post_publishes: reported → removed (SM-004 transition, 관리자 제거)

post_feeds: live → restricted → archived (정상 종료)
post_feeds: removed → expired (SM-005 batch — 데이터 보관 기간 만료)
post_feeds: live → reported → removed (정책 위반 차단, SM-006 payout 회수 대상)

creator_payout_clawback_records: pending → calculated → clawed_back (SM-006 atomic)
```

---

## 의존 함수 (socialmedia.ts)

| BL | 함수 | detector |
|----|------|----------|
| SM-001 | `publishPost` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| SM-002 | `applyMonetizationLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| SM-003 | `processFeedDistribution` | AtomicTransaction (`db.transaction(...)`) |
| SM-004 | `transitionPostStatus` | StatusTransition (matrix) |
| SM-005 | `expireRemovedPostBatch` | StatusTransition (batch) |
| SM-006 | `processCreatorClawback` | AtomicTransaction (`db.transaction(...)`) |
