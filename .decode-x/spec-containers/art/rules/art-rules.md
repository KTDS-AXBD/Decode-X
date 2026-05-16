# Spec Container — ART-001 (예술/갤러리 합성 도메인)

**Skill ID**: ART-001
**Domain**: Art (예술/갤러리 산업 — 갤러리artwork한도/acquisitiondaily한도/거래batchatomic/artwork상태전환/만료withdrawnartwork일괄/commission환불atomic)
**Source**: SYNTHETIC — 세션 306 F532, withRuleId 재사용 64번째 도메인 PoC (Radio 다음 산업, 53번째 신규) 🏆 64번째 도메인 마일스톤
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (AR-001 ~ AR-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| AR-001 | 신규 artwork 등록 요청 시 | `gallery.active_artworks < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_ACTIVE_ARTWORKS_PER_GALLERY) | artwork 등록 허용 + gallery.active_artworks 증가 | `E422-GALLERY-CAPACITY-EXCEEDED` |
| AR-002 | 컬렉터 acquisition 요청 시 | `contract.acquisition_used + acquisition < dailyAcquisitionLimit` (var-vs-var, `limit` keyword) | acquisition 적용 + acquisition_used 증가 | `E422-DAILY-ACQUISITION-LIMIT-EXCEEDED` |
| AR-003 | artwork 거래 atomic 요청 시 | `exhibition_schedules.status = 'registered'` | atomic: artworks INSERT + exhibition_schedules UPDATE + commission_payments INSERT | `E404-SCHEDULE` |
| AR-004 | artwork 상태 전환 (registered → exhibited → updated → archived / withdrawn / cancelled) | 허용 매트릭스 충족 | `exhibition_schedules.status` UPDATE | `E404-SCHEDULE`, `E409-SCHEDULE` |
| AR-005 | withdrawn artwork 일괄 만료 처리 | `artworks.status = 'withdrawn'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| AR-006 | commission 환불 (withdrawn) atomic 요청 시 | `artworks.status = 'withdrawn'` | atomic: commission_refund_records INSERT + commission_refunds INSERT + commission_refund_records UPDATE | `E404-WITHDRAWN-ARTWORK` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `galleries` | active_artworks 증가 (AR-001) | registerArtwork |
| `exhibition_schedules` | INSERT (AR-001), status 갱신 (AR-003/AR-004) | registerArtwork / processArtworkTransaction / transitionArtworkStatus |
| `collector_contracts` | acquisition_used 증가 (AR-002) | applyAcquisitionLimit |
| `artworks` | INSERT (AR-003), batch expire (AR-005) | processArtworkTransaction / expireWithdrawnArtworkBatch |
| `commission_payments` | INSERT (AR-003) | processArtworkTransaction |
| `commission_refund_records` | INSERT + status='refunded' (AR-006) | processCommissionRefund |
| `commission_refunds` | INSERT (AR-006) | processCommissionRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_ACTIVE_ARTWORKS_PER_GALLERY = 60` (AR-001 갤러리별 동시 active artwork 기본 한도, 일반 갤러리 공간 동시 전시 가능 작품 수)
- `dailyAcquisitionLimit = collector_contracts.acquisition_limit` (AR-002 컬렉터 등급별 일일 acquisition 한도, 작품 수)

---

## 상태 머신

```
exhibition_schedules: registered → exhibited (AR-003 atomic)
exhibition_schedules: exhibited ↔ updated (AR-004 transition, 작품 정보 갱신)
exhibition_schedules: exhibited|updated → archived (AR-004 transition)
exhibition_schedules: registered|exhibited → withdrawn (AR-004 transition, 컬렉터/갤러리 취소)
exhibition_schedules: registered|exhibited → cancelled (AR-004 transition)

artworks: exhibited → updated → archived (정상 종료)
artworks: withdrawn → expired (AR-005 batch — 데이터 보관 기간 만료)
artworks: exhibited → withdrawn (긴급 취소, AR-006 commission 환불 대상)

commission_refund_records: pending → calculated → refunded (AR-006 atomic)
```

---

## 의존 함수 (art.ts)

| BL | 함수 | detector |
|----|------|----------|
| AR-001 | `registerArtwork` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| AR-002 | `applyAcquisitionLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| AR-003 | `processArtworkTransaction` | AtomicTransaction (`db.transaction(...)`) |
| AR-004 | `transitionArtworkStatus` | StatusTransition (matrix) |
| AR-005 | `expireWithdrawnArtworkBatch` | StatusTransition (batch) |
| AR-006 | `processCommissionRefund` | AtomicTransaction (`db.transaction(...)`) |
