# Spec Container — GENERIC-VOUCHER-001 (Generic Voucher 합성 도메인)

**Skill ID**: GENERIC-VOUCHER-001
**Domain**: Generic Voucher (LPON pattern 일반화 합성)
**Source**: SYNTHETIC — Sprint 274 F440, withRuleId 재사용 9번째 도메인 PoC
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (V-001 ~ V-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| V-001 | 바우처 발행 요청 시 | issuer당 일일 발행 카운트 < 1,000 | INSERT vouchers (status=active, balance=amount, expires_at=issued_at+365일) | 한도 도달 시 `E429-LIMIT` throw |
| V-002 | 바우처 사용 가능 검증 시 | `now ≤ expires_at` AND `status = 'active'` | `canUse=true` + daysLeft 반환 | 만료 시 `E410-EXPIRED`, 비활성 시 `E409-STATUS` |
| V-003 | 바우처 사용 시 잔액 차감 | `balance ≥ amount` | atomic transaction (UPDATE balance + INSERT ledger + 무결성 검증) | 잔액 부족 시 `E422-BAL`, integrity fail 시 rollback `E500-INTEGRITY` |
| V-004 | 정기 batch 또는 redeem 후 trigger | `balance ≤ 1,000` AND `status = 'active'` | `status → 'destroyed'` + balance=0 | 미달 시 active 유지 (no-op) |
| V-005 | 환불 요청 시 | `used_count = 0` AND `days_since_issue ≤ 7` | `status → 'refunded'` + balance=0 + (옵션) 결제 환불 호출 | 사용 1건+ `E422-USED`, 7일 초과 `E422-WINDOW` |
| V-006 | 양도 요청 시 | `transferred_count = 0` AND `status = 'active'` | owner_id 변경 + transferred_count+=1 + `status → 'transferred'` | 이미 양도 시 `E423-LOCKED`, 비활성 시 `E409-STATUS` |

---

## 데이터 영향

- **변경 테이블**: `vouchers` (status/balance/owner_id/transferred_count/used_count), `voucher_ledger_entries` (DEBIT_REDEEM 행)
- **이벤트 발행 (옵션)**: `VoucherIssued`, `VoucherRedeemed`, `VoucherDestroyed`, `VoucherRefunded`, `VoucherTransferred`

## 엣지 케이스

- 한도 초과 직전 (999건) + 동시 요청 race → V-001 atomic count + check 권장
- 만료 정확히 0초 차이 → V-002 ms 단위 검증
- redeem 중간 실패 → V-003 transaction rollback 검증 (integrity check)
- balance=1000 경계값 → V-004 destroy 트리거
- 환불 + 양도 충돌 → V-005/V-006 status 전이 mutual exclusion

---

## Detector 매핑 (BL_DETECTOR_REGISTRY)

| BL ID | Detector | withRuleId |
|-------|----------|------------|
| V-001 | ThresholdCheck | ✅ |
| V-002 | ThresholdCheck | ✅ |
| V-003 | AtomicTransaction | ✅ |
| V-004 | StatusTransition | ✅ |
| V-005 | ThresholdCheck | ✅ |
| V-006 | StatusTransition | ✅ |

**신규 detector 0개** — Sprint 262 F429 universal detector 3종 (Threshold/Status/Atomic) 재사용 9번째 도메인.

## 구현

- **함수**: `issueVoucher`, `useVoucher`, `redeemVoucher`, `autoDestroyVoucher`, `refundVoucher`, `transferVoucher`
- **Source**: `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/voucher.ts` (~220 lines)
- **Test**: `src/__tests__/voucher.test.ts` (19 cases PASS)
