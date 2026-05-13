# Spec Container — VID-001 (영상 합성 도메인)

**Skill ID**: VID-001
**Domain**: Video (영상 산업 — 채널publish한도/시청자view한도/스트림batchatomic/영상상태전환/만료영상일괄/리워드회수atomic)
**Source**: SYNTHETIC — 세션 305 F524, withRuleId 재사용 57번째 도메인 PoC (Gaming 다음 산업, 46번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (VD-001 ~ VD-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| VD-001 | 신규 영상 publish 요청 시 | `channel.active_published_videos < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_PUBLISHED_VIDEOS_PER_CHANNEL) | publish 허용 + channel.active_published_videos 증가 | `E422-CHANNEL-CAPACITY-EXCEEDED` (채널 동시 publish 영상 한도 초과) |
| VD-002 | 시청자 view 요청 시 | `contract.view_used + views < dailyViewLimit` (var-vs-var, `limit` keyword 매칭) | view 적용 + view_used 증가 | `E422-DAILY-VIEW-LIMIT-EXCEEDED` (일일 view 한도 초과) |
| VD-003 | 영상 스트림 atomic 요청 시 | `video_publishes.status = 'encoded'` | atomic: video_streams INSERT + video_publishes UPDATE + ad_payments INSERT | `E404-PUBLISH` |
| VD-004 | 영상 상태 전환 (uploaded → encoded → published → unlisted → retired/banned) | 허용 매트릭스 충족 | `video_publishes.status` UPDATE | `E404-PUBLISH`, `E409-PUBLISH` |
| VD-005 | retired 영상 스트림 일괄 만료 처리 | `video_streams.status = 'retired'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| VD-006 | 리워드 회수 (banned 스트림) atomic 요청 시 | `video_streams.status = 'banned'` | atomic: reward_clawback_records INSERT + reward_clawbacks INSERT + reward_clawback_records UPDATE | `E404-BANNED-STREAM` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `channels` | active_published_videos 증가 (VD-001) | publishVideo |
| `video_publishes` | INSERT (VD-001), status 갱신 (VD-003/VD-004) | publishVideo / processStream / transitionVideoStatus |
| `ad_contracts` | view_used 증가 (VD-002) | applyViewLimit |
| `video_streams` | INSERT (VD-003), batch expire (VD-005) | processStream / expireRetiredVideoBatch |
| `ad_payments` | INSERT (VD-003) | processStream |
| `reward_clawback_records` | INSERT + status='clawed_back' (VD-006) | processRefundClaim |
| `reward_clawbacks` | INSERT (VD-006) | processRefundClaim |

---

## 임계값 / 상수

- `MAX_CONCURRENT_PUBLISHED_VIDEOS_PER_CHANNEL = 1000` (VD-001 채널별 동시 publish 영상 기본 한도, 콘텐츠 슬롯 단위)
- `dailyViewLimit = ad_contracts.view_limit` (VD-002 시청자 등급별 일일 view 한도, 조회수)

---

## 상태 머신

```
video_publishes: uploaded → encoded (VD-004 transition)
video_publishes: encoded → published (VD-003 atomic)
video_publishes: published ↔ unlisted (VD-004 transition)
video_publishes: published|unlisted → retired (VD-004 transition)
video_publishes: published|encoded → banned (VD-004 transition)

video_streams: live → unlisted → retired (정상 종료)
video_streams: retired → expired (VD-005 batch — 데이터 보관 기간 만료)
video_streams: live → banned (정책 위반 차단, VD-006 리워드 회수 대상)

reward_clawback_records: pending → calculated → clawed_back (VD-006 atomic)
```

---

## 의존 함수 (video.ts)

| BL | 함수 | detector |
|----|------|----------|
| VD-001 | `publishVideo` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| VD-002 | `applyViewLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| VD-003 | `processStream` | AtomicTransaction (`db.transaction(...)`) |
| VD-004 | `transitionVideoStatus` | StatusTransition (matrix) |
| VD-005 | `expireRetiredVideoBatch` | StatusTransition (batch) |
| VD-006 | `processRefundClaim` | AtomicTransaction (`db.transaction(...)`) |
