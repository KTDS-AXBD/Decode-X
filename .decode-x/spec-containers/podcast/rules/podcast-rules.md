# Spec Container — PDC-001 (팟캐스트 합성 도메인)

**Skill ID**: PDC-001
**Domain**: Podcast (팟캐스트 산업 — 호스트episode한도/청취자daily한도/배포batchatomic/episode상태전환/만료episode일괄/청취자환불atomic)
**Source**: SYNTHETIC — 세션 305 후속5 F530, withRuleId 재사용 62번째 도메인 PoC (Esports 다음 산업, 51번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (PC-001 ~ PC-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| PC-001 | 신규 episode 발행 요청 시 | `host.active_published_episodes < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_PUBLISHED_EPISODES_PER_HOST) | 발행 허용 + host.active_published_episodes 증가 | `E422-HOST-CAPACITY-EXCEEDED` (호스트 동시 published episode 한도 초과) |
| PC-002 | 청취자 listen 요청 시 | `contract.listen_used + listens < dailyListenLimit` (var-vs-var, `limit` keyword 매칭) | listen 적용 + listen_used 증가 | `E422-DAILY-LISTEN-LIMIT-EXCEEDED` (일일 listen 한도 초과) |
| PC-003 | episode 배포 atomic 요청 시 | `episode_publishes.status = 'edited'` | atomic: episode_distributions INSERT + episode_publishes UPDATE + ad_insertions INSERT | `E404-PUBLISH` |
| PC-004 | episode 상태 전환 (recorded → edited → published → updated → archived / removed) | 허용 매트릭스 충족 | `episode_publishes.status` UPDATE | `E404-PUBLISH`, `E409-PUBLISH` |
| PC-005 | removed episode 배포 일괄 만료 처리 | `episode_distributions.status = 'removed'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| PC-006 | 청취자 환불 (removed) atomic 요청 시 | `episode_distributions.status = 'removed'` | atomic: listener_refund_records INSERT + listener_refunds INSERT + listener_refund_records UPDATE | `E404-REMOVED-DISTRIBUTION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `hosts` | active_published_episodes 증가 (PC-001) | publishEpisode |
| `episode_publishes` | INSERT (PC-001), status 갱신 (PC-003/PC-004) | publishEpisode / processDistribution / transitionEpisodeStatus |
| `listener_contracts` | listen_used 증가 (PC-002) | applyListenLimit |
| `episode_distributions` | INSERT (PC-003), batch expire (PC-005) | processDistribution / expireRemovedEpisodeBatch |
| `ad_insertions` | INSERT (PC-003) | processDistribution |
| `listener_refund_records` | INSERT + status='refunded' (PC-006) | processListenerRefund |
| `listener_refunds` | INSERT (PC-006) | processListenerRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_PUBLISHED_EPISODES_PER_HOST = 5000` (PC-001 호스트별 동시 published episode 기본 한도)
- `dailyListenLimit = listener_contracts.listen_limit` (PC-002 청취자 등급별 일일 listen 한도, 회수)

---

## 상태 머신

```
episode_publishes: recorded → edited (PC-004 transition)
episode_publishes: edited → published (PC-003 atomic)
episode_publishes: published ↔ updated (PC-004 transition, 에피소드 수정)
episode_publishes: published|updated → archived (PC-004 transition)
episode_publishes: published|updated → removed (PC-004 transition, 콘텐츠 정책 위반)

episode_distributions: live → updated → archived (정상 종료)
episode_distributions: removed → expired (PC-005 batch — 데이터 보관 기간 만료)
episode_distributions: live → removed (정책 위반 차단, PC-006 환불 대상)

listener_refund_records: pending → calculated → refunded (PC-006 atomic)
```

---

## 의존 함수 (podcast.ts)

| BL | 함수 | detector |
|----|------|----------|
| PC-001 | `publishEpisode` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| PC-002 | `applyListenLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| PC-003 | `processDistribution` | AtomicTransaction (`db.transaction(...)`) |
| PC-004 | `transitionEpisodeStatus` | StatusTransition (matrix) |
| PC-005 | `expireRemovedEpisodeBatch` | StatusTransition (batch) |
| PC-006 | `processListenerRefund` | AtomicTransaction (`db.transaction(...)`) |
