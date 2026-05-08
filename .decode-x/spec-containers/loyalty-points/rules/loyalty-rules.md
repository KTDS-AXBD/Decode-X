# Spec Container — LOYALTY-POINTS-001 (Loyalty Points 합성 도메인)

**Skill ID**: LOYALTY-POINTS-001
**Domain**: Loyalty Points (멤버십 포인트 일반화 합성)
**Source**: SYNTHETIC — Sprint 275 F441, withRuleId 재사용 10번째 도메인 PoC
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (LP-001 ~ LP-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| LP-001 | 포인트 적립 요청 시 | `today_earned + amount ≤ 10,000P` | 계정 balance + amount, EARN ledger insert | 일일 한도 초과 시 `E429-LIMIT` throw |
| LP-002 | 포인트 사용 가능 검증 시 | `balance ≥ amount` AND `status = 'active'` | `canUse=true` 반환 | 계정 미존재 `E404-ACCOUNT`, 잔액 부족 `E422-BAL`, 비활성 `E409-STATUS` |
| LP-003 | 사용 시 차감 | `balance ≥ amount` | atomic transaction (UPDATE balance + INSERT REDEEM ledger + 무결성 검증) | rollback on integrity fail (`E500-INTEGRITY`) |
| LP-004 | 만료 자동 소멸 (정기 batch) | `now > expires_at` AND `status = 'active'` | `status → 'expired'`, balance=0 | 만료 전 active 유지 (no-op) |
| LP-005 | 등급 승급 (누적 임계 도달) | `total_earned ≥ 50,000` (SILVER) 또는 `≥ 200,000` (GOLD) | grade BRONZE → SILVER → GOLD | 임계 미달 시 등급 유지 |
| LP-006 | 환불 시 적립 회수 | `days_since_earn ≤ 30` AND `balance ≥ earn_amount` | balance/total_earned 차감 + CLAWBACK ledger insert | `E422-WINDOW` (30일 초과) 또는 `E422-USED` (잔액 부족) |

---

## 데이터 영향

- **변경 테이블**: `loyalty_accounts` (balance/total_earned/grade/status), `loyalty_ledger_entries` (EARN/REDEEM/CLAWBACK 행)
- **이벤트 발행 (옵션)**: `PointsEarned`, `PointsRedeemed`, `PointsExpired`, `GradePromoted`, `PointsClawbacked`

## 엣지 케이스

- 일일 한도 9,999P + 동시 적립 race → LP-001 atomic SELECT/INSERT 권장
- 만료 정확히 0초 차이 → LP-004 ms 단위 검증
- redeem 중간 실패 → LP-003 transaction rollback (integrity check)
- SILVER → GOLD 동시 진입 → LP-005 GOLD 우선 승급 (early return)
- 환불 + 사용 시간차 → LP-006 잔액 검증으로 회수 거부

---

## Detector 매핑 (BL_DETECTOR_REGISTRY 10번째 도메인)

| BL ID | Detector | withRuleId |
|-------|----------|------------|
| LP-001 | ThresholdCheck | ✅ |
| LP-002 | ThresholdCheck | ✅ |
| LP-003 | AtomicTransaction | ✅ |
| LP-004 | StatusTransition | ✅ |
| LP-005 | StatusTransition | ✅ |
| LP-006 | ThresholdCheck | ✅ |

**신규 detector 0개** — Sprint 262 F429 universal detector 3종 재사용 10번째 도메인.

## 구현

- **함수**: `earnPoints`, `usePoints`, `redeemPoints`, `expirePoints`, `promoteGrade`, `clawbackOnRefund`
- **Source**: `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/loyalty.ts` (~260 lines)
- **Test**: `src/__tests__/loyalty.test.ts` (18 cases PASS)
- **Error class**: `LoyaltyError` — code-in-message 패턴 (`super(\`[\${code}] \${message}\`)`)
