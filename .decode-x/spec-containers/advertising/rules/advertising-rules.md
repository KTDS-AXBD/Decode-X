# Spec Container — ADV-001 (광고 합성 도메인)

**Skill ID**: ADV-001
**Domain**: Advertising (광고 산업 — 에이전시캠페인한도/미디어수수료한도/노출batchatomic/캠페인상태전환/만료캠페인일괄/환불atomic)
**Source**: SYNTHETIC — 세션 304 후속 F522, withRuleId 재사용 55번째 도메인 PoC (Textile 다음 산업, 44번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (AD-001 ~ AD-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| AD-001 | 신규 캠페인 예약 요청 시 | `agency.active_campaigns < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_CAMPAIGNS_PER_AGENCY) | 예약 허용 + agency.active_campaigns 증가 | `E422-AGENCY-CAPACITY-EXCEEDED` (에이전시 동시 캠페인 한도 초과) |
| AD-002 | 미디어 수수료 사용 요청 시 | `contract.fee_used + fee < mediaFeePaymentLimit` (var-vs-var, `limit` keyword 매칭) | 수수료 적용 + fee_used 증가 | `E422-MEDIA-FEE-PAYMENT-LIMIT-EXCEEDED` (미디어 수수료 한도 초과) |
| AD-003 | 노출 batch atomic 요청 시 | `campaign_bookings.status = 'approved'` | atomic: impression_batches INSERT + campaign_bookings UPDATE + media_payments INSERT | `E404-BOOKING` |
| AD-004 | 캠페인 상태 전환 (proposed → approved → live → paused → ended/canceled) | 허용 매트릭스 충족 | `campaign_bookings.status` UPDATE | `E404-BOOKING`, `E409-BOOKING` |
| AD-005 | ended 캠페인 batch 일괄 만료 처리 | `impression_batches.status = 'ended'` AND `served_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| AD-006 | 환불 (chargeback) atomic 요청 시 | `impression_batches.status = 'canceled'` | atomic: chargeback_refund_records INSERT + chargeback_refunds INSERT + chargeback_refund_records UPDATE | `E404-CANCELED-BATCH` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `agencies` | active_campaigns 증가 (AD-001) | bookCampaign |
| `campaign_bookings` | INSERT (AD-001), status 갱신 (AD-003/AD-004) | bookCampaign / processImpressionBatch / transitionCampaignStatus |
| `media_contracts` | fee_used 증가 (AD-002) | applyMediaFeeTier |
| `impression_batches` | INSERT (AD-003), batch expire (AD-005) | processImpressionBatch / expireEndedCampaignBatch |
| `media_payments` | INSERT (AD-003) | processImpressionBatch |
| `chargeback_refund_records` | INSERT + status='refunded' (AD-006) | processChargebackRefund |
| `chargeback_refunds` | INSERT (AD-006) | processChargebackRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_CAMPAIGNS_PER_AGENCY = 400` (AD-001 에이전시별 동시 캠페인 batch 기본 한도, 캠페인 단위)
- `mediaFeePaymentLimit = media_contracts.fee_limit` (AD-002 광고주 등급별 미디어 수수료 한도, USD)

---

## 상태 머신

```
campaign_bookings: proposed → approved (AD-004 transition)
campaign_bookings: approved → live (AD-003 atomic)
campaign_bookings: live ↔ paused (AD-004 transition)
campaign_bookings: live|paused → ended (AD-004 transition)
campaign_bookings: proposed|approved → canceled (AD-004 transition)

impression_batches: live → paused → ended (정상 종료)
impression_batches: ended → expired (AD-005 batch — 보관 기간 만료)
impression_batches: live → canceled (광고주 요청 취소, AD-006 환불 대상)

chargeback_refund_records: pending → calculated → refunded (AD-006 atomic)
```

---

## 의존 함수 (advertising.ts)

| BL | 함수 | detector |
|----|------|----------|
| AD-001 | `bookCampaign` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| AD-002 | `applyMediaFeeTier` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| AD-003 | `processImpressionBatch` | AtomicTransaction (`db.transaction(...)`) |
| AD-004 | `transitionCampaignStatus` | StatusTransition (matrix) |
| AD-005 | `expireEndedCampaignBatch` | StatusTransition (batch) |
| AD-006 | `processChargebackRefund` | AtomicTransaction (`db.transaction(...)`) |
