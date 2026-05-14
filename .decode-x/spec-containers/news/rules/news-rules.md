# Spec Container — NWS-001 (뉴스 합성 도메인)

**Skill ID**: NWS-001
**Domain**: News (뉴스 산업 — 퍼블리셔article한도/구독자daily한도/신디케이션batchatomic/article상태전환/만료article일괄/구독료환불atomic)
**Source**: SYNTHETIC — 세션 305 후속2 F527, withRuleId 재사용 59번째 도메인 PoC (SocialMedia 다음 산업, 48번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (NW-001 ~ NW-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| NW-001 | 신규 article 발행 요청 시 | `publisher.active_published_articles < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_PUBLISHED_ARTICLES_PER_PUBLISHER) | 발행 허용 + publisher.active_published_articles 증가 | `E422-PUBLISHER-CAPACITY-EXCEEDED` (퍼블리셔 동시 published article 한도 초과) |
| NW-002 | 구독자 article view 요청 시 | `contract.article_used + articles < dailyArticleLimit` (var-vs-var, `limit` keyword 매칭) | view 적용 + article_used 증가 | `E422-DAILY-ARTICLE-LIMIT-EXCEEDED` (일일 article 한도 초과) |
| NW-003 | article 신디케이션 atomic 요청 시 | `article_publishes.status = 'edited'` | atomic: article_syndications INSERT + article_publishes UPDATE + subscription_charges INSERT | `E404-PUBLISH` |
| NW-004 | article 상태 전환 (drafted → edited → published → updated → archived / retracted) | 허용 매트릭스 충족 | `article_publishes.status` UPDATE | `E404-PUBLISH`, `E409-PUBLISH` |
| NW-005 | retracted article 신디케이션 일괄 만료 처리 | `article_syndications.status = 'retracted'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| NW-006 | 구독료 환불 (retracted) atomic 요청 시 | `article_syndications.status = 'retracted'` | atomic: subscription_refund_records INSERT + subscription_refunds INSERT + subscription_refund_records UPDATE | `E404-RETRACTED-SYNDICATION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `publishers` | active_published_articles 증가 (NW-001) | publishArticle |
| `article_publishes` | INSERT (NW-001), status 갱신 (NW-003/NW-004) | publishArticle / processSyndication / transitionArticleStatus |
| `subscription_contracts` | article_used 증가 (NW-002) | applyArticleQuotaLimit |
| `article_syndications` | INSERT (NW-003), batch expire (NW-005) | processSyndication / expireRetractedArticleBatch |
| `subscription_charges` | INSERT (NW-003) | processSyndication |
| `subscription_refund_records` | INSERT + status='refunded' (NW-006) | processSubscriptionRefund |
| `subscription_refunds` | INSERT (NW-006) | processSubscriptionRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_PUBLISHED_ARTICLES_PER_PUBLISHER = 50000` (NW-001 퍼블리셔별 동시 published article 기본 한도, 콘텐츠 슬롯)
- `dailyArticleLimit = subscription_contracts.article_limit` (NW-002 구독자 등급별 일일 article 한도, 무료 등급 표준 paywall)

---

## 상태 머신

```
article_publishes: drafted → edited (NW-004 transition)
article_publishes: edited → published (NW-003 atomic)
article_publishes: published ↔ updated (NW-004 transition, 정정 보도)
article_publishes: published|updated → archived (NW-004 transition)
article_publishes: published|updated → retracted (NW-004 transition, 철회)

article_syndications: live → updated → archived (정상 종료)
article_syndications: retracted → expired (NW-005 batch — 데이터 보관 기간 만료)
article_syndications: live → retracted (정정 보도, NW-006 환불 대상)

subscription_refund_records: pending → calculated → refunded (NW-006 atomic)
```

---

## 의존 함수 (news.ts)

| BL | 함수 | detector |
|----|------|----------|
| NW-001 | `publishArticle` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| NW-002 | `applyArticleQuotaLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| NW-003 | `processSyndication` | AtomicTransaction (`db.transaction(...)`) |
| NW-004 | `transitionArticleStatus` | StatusTransition (matrix) |
| NW-005 | `expireRetractedArticleBatch` | StatusTransition (batch) |
| NW-006 | `processSubscriptionRefund` | AtomicTransaction (`db.transaction(...)`) |
