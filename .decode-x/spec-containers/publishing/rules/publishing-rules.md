# Spec Container — PUB-001 (출판 합성 도메인)

**Skill ID**: PUB-001
**Domain**: Publishing (출판 산업 — 임프린트볼륨한도/저작권료한도/인쇄batchatomic/배포상태전환/만료재고일괄/저작권환불atomic)
**Source**: SYNTHETIC — 세션 304 F518, withRuleId 재사용 53번째 도메인 PoC (Shipping 다음 산업, 42번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (PB-001 ~ PB-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| PB-001 | 신규 볼륨 등록 요청 시 | `imprint.active_volumes < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_VOLUMES_PER_IMPRINT) | 등록 허용 + imprint.active_volumes 증가 | `E422-IMPRINT-VOLUME-EXCEEDED` (임프린트 동시 볼륨 한도 초과) |
| PB-002 | 저작권료 사용 요청 시 | `contract.fee_used + fee < royaltyPaymentLimit` (var-vs-var, `limit` keyword 매칭) | 저작권료 적용 + fee_used 증가 | `E422-ROYALTY-PAYMENT-LIMIT-EXCEEDED` (저작권료 한도 초과) |
| PB-003 | 인쇄 batch atomic 요청 시 | `volume_registrations.status = 'edited'` | atomic: print_batches INSERT + volume_registrations UPDATE + royalty_payments INSERT | `E404-REGISTRATION` |
| PB-004 | 볼륨 등록 상태 전환 (registered → edited → printed → distributed → sold/returned) | 허용 매트릭스 충족 | `volume_registrations.status` UPDATE | `E404-REGISTRATION`, `E409-REGISTRATION` |
| PB-005 | distributed 인쇄 batch 일괄 만료 처리 | `print_batches.status = 'distributed'` AND `printed_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| PB-006 | 저작권료 환불 atomic 요청 시 | `print_batches.status = 'returned'` | atomic: royalty_refund_records INSERT + royalty_refunds INSERT + royalty_refund_records UPDATE | `E404-RETURNED-BATCH` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `imprints` | active_volumes 증가 (PB-001) | registerVolume |
| `volume_registrations` | INSERT (PB-001), status 갱신 (PB-003/PB-004) | registerVolume / processPrintBatch / transitionRegistrationStatus |
| `royalty_contracts` | fee_used 증가 (PB-002) | applyRoyaltyTier |
| `print_batches` | INSERT (PB-003), batch expire (PB-005) | processPrintBatch / expirePrintBatchInventory |
| `royalty_payments` | INSERT (PB-003) | processPrintBatch |
| `royalty_refund_records` | INSERT + status='refunded' (PB-006) | processRoyaltyRefund |
| `royalty_refunds` | INSERT (PB-006) | processRoyaltyRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_VOLUMES_PER_IMPRINT = 500` (PB-001 임프린트별 동시 볼륨 등록 기본 한도)
- `royaltyPaymentLimit = royalty_contracts.fee_limit` (PB-002 저자 등급별 저작권료 한도, USD)

---

## 상태 머신

```
volume_registrations: registered → edited (PB-004 transition)
volume_registrations: edited → printed (PB-003 atomic)
volume_registrations: printed → distributed (PB-004 transition)
volume_registrations: distributed → sold (PB-004 transition)
volume_registrations: edited|printed|distributed → returned (PB-004 transition)

print_batches: printed → distributed → sold (정상 배포)
print_batches: distributed → expired (PB-005 batch — 장기 미판매 만료)
print_batches: distributed → returned (반품 처리)

royalty_refund_records: pending → calculated → refunded (PB-006 atomic)
```

---

## 의존 함수 (publishing.ts)

| BL | 함수 | detector |
|----|------|----------|
| PB-001 | `registerVolume` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| PB-002 | `applyRoyaltyTier` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| PB-003 | `processPrintBatch` | AtomicTransaction (`db.transaction(...)`) |
| PB-004 | `transitionRegistrationStatus` | StatusTransition (matrix) |
| PB-005 | `expirePrintBatchInventory` | StatusTransition (batch) |
| PB-006 | `processRoyaltyRefund` | AtomicTransaction (`db.transaction(...)`) |
