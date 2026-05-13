# Spec Container — TXT-001 (방직/섬유 합성 도메인)

**Skill ID**: TXT-001
**Domain**: Textile (방직/섬유 산업 — 직조batch한도/염료수수료한도/염색batchatomic/발주상태전환/만료재고일괄/반품환불atomic)
**Source**: SYNTHETIC — 세션 304 후속 F521, withRuleId 재사용 54번째 도메인 PoC (Publishing 다음 산업, 43번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (TX-001 ~ TX-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| TX-001 | 신규 직조 batch 요청 시 | `mill.active_batches < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_BATCHES_PER_MILL) | 발주 허용 + mill.active_batches 증가 | `E422-MILL-CAPACITY-EXCEEDED` (방직 공장 동시 직조 한도 초과) |
| TX-002 | 염료 수수료 사용 요청 시 | `contract.fee_used + fee < dyeFeePaymentLimit` (var-vs-var, `limit` keyword 매칭) | 수수료 적용 + fee_used 증가 | `E422-DYE-FEE-PAYMENT-LIMIT-EXCEEDED` (염료 수수료 한도 초과) |
| TX-003 | 염색 batch atomic 요청 시 | `fabric_orders.status = 'woven'` | atomic: fabric_batches INSERT + fabric_orders UPDATE + dye_payments INSERT | `E404-ORDER` |
| TX-004 | 발주 상태 전환 (ordered → woven → dyed → qc → shipped/rejected) | 허용 매트릭스 충족 | `fabric_orders.status` UPDATE | `E404-ORDER`, `E409-ORDER` |
| TX-005 | rejected fabric batch 일괄 만료 처리 | `fabric_batches.status = 'rejected'` AND `woven_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| TX-006 | 반품 환불 atomic 요청 시 | `fabric_batches.status = 'rejected'` | atomic: return_refund_records INSERT + return_refunds INSERT + return_refund_records UPDATE | `E404-REJECTED-BATCH` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `mills` | active_batches 증가 (TX-001) | startWeavingBatch |
| `fabric_orders` | INSERT (TX-001), status 갱신 (TX-003/TX-004) | startWeavingBatch / processFabricBatch / transitionOrderStatus |
| `dye_contracts` | fee_used 증가 (TX-002) | applyDyeFeeTier |
| `fabric_batches` | INSERT (TX-003), batch expire (TX-005) | processFabricBatch / expireRejectedFabricBatch |
| `dye_payments` | INSERT (TX-003) | processFabricBatch |
| `return_refund_records` | INSERT + status='refunded' (TX-006) | processReturnRefund |
| `return_refunds` | INSERT (TX-006) | processReturnRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_BATCHES_PER_MILL = 300` (TX-001 방직 공장별 동시 직조 batch 기본 한도, bolt 단위)
- `dyeFeePaymentLimit = dye_contracts.fee_limit` (TX-002 구매자 등급별 염료 수수료 한도, USD)

---

## 상태 머신

```
fabric_orders: ordered → woven (TX-004 transition)
fabric_orders: woven → dyed (TX-003 atomic)
fabric_orders: dyed → qc (TX-004 transition)
fabric_orders: qc → shipped (TX-004 transition)
fabric_orders: woven|dyed|qc → rejected (TX-004 transition)

fabric_batches: dyed → shipped (정상 출하)
fabric_batches: rejected → expired (TX-005 batch — QC 거부 후 보관 만료)

return_refund_records: pending → calculated → refunded (TX-006 atomic)
```

---

## 의존 함수 (textile.ts)

| BL | 함수 | detector |
|----|------|----------|
| TX-001 | `startWeavingBatch` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| TX-002 | `applyDyeFeeTier` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| TX-003 | `processFabricBatch` | AtomicTransaction (`db.transaction(...)`) |
| TX-004 | `transitionOrderStatus` | StatusTransition (matrix) |
| TX-005 | `expireRejectedFabricBatch` | StatusTransition (batch) |
| TX-006 | `processReturnRefund` | AtomicTransaction (`db.transaction(...)`) |
