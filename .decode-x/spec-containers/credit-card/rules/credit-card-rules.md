# Spec Container — CREDIT-CARD-001 (신용카드 산업 합성 도메인)

**Skill ID**: CREDIT-CARD-001
**Domain**: Credit Card (신용카드 산업 — 발급/결제/취소/연체)
**Source**: SYNTHETIC — Sprint 278 F444, withRuleId 재사용 12번째 도메인 PoC (LPON 외 첫 산업)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (CC-001 ~ CC-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| CC-001 | 카드 발급 신청 시 | `creditScore ≥ 600` AND `annualIncome ≥ 24,000,000` | `credit_cards` INSERT (status='active'), 한도 = min(requested, 연소득×30% + scoreBonus) | `E422-CS` (점수 미달) 또는 `E422-IN` (소득 미달) |
| CC-002 | 결제 승인 전 한도 검증 시 | `card.status = 'active'` AND `credit_limit - used_amount ≥ amount` | `canPay=true`, remainingLimit 반환 | `E404-CARD`, `E409-ST` (비활성), `E422-LIMIT` (한도 초과) |
| CC-003 | 결제 승인 시 | 한도 검증 통과 | atomic transaction (`used_amount += amount` + `card_transactions` INSERT status='approved') | rollback on integrity fail |
| CC-004 | 카드 상태 전환 (active → blocked/expired/cancelled) | `previousStatus = 'active'` | `credit_cards.status` UPDATE, previousStatus 반환 | `E409-TR` (active 아닌 상태에서 전환 불가) |
| CC-005 | 연체 자동 마킹 (정기 batch) | `status='active'` AND `used_amount > 0` AND `last_payment_at < now - 30days` | `status → 'delinquent'`, `delinquent_since = now` | 결제 이력 있거나 미사용 시 marking 제외 |
| CC-006 | 결제 취소 (가맹점/사용자) | `transaction.status = 'approved'` | atomic transaction (`card_transactions.status='cancelled'` + `used_amount -= amount` 한도 복구) | `E404-TX`, `E409-TX` (이미 cancelled/refunded) |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `credit_cards` | INSERT (CC-001) / used_amount 증감 (CC-003/006) / status 전환 (CC-004/005) | issueCard / approvePayment / transitionCardStatus / markDelinquentCards / cancelTransaction |
| `card_transactions` | INSERT (CC-003) / status='cancelled' (CC-006) | approvePayment / cancelTransaction |
| `card_payments` | (외부) 결제일 기록 — CC-005 cutoff 판정 입력 | (외부 시스템) |

---

## 임계값 / 상수

- `MIN_CREDIT_SCORE = 600` (CC-001 발급 최소 신용점수)
- `MIN_INCOME_KRW = 24,000,000` (CC-001 연소득 최소)
- `DELINQUENT_DAYS = 30` (CC-005 연체 마킹 기준)
- 한도 산정: `baseLimit = annualIncome × 0.3` + `scoreBonus` (≥ 750: +5M, ≥ 700: +2M, else: 0)

---

## 상태 머신

```
[issueCard] → active
active → blocked (CC-004, manual)
active → expired (CC-004, expires_at 도달)
active → cancelled (CC-004, user 요청)
active → delinquent (CC-005, 30일 미결제 batch)
```

---

## 권한

- **issueCard**: 본인 신청 또는 관리자 ADMIN
- **transitionCardStatus(blocked)**: ADMIN 또는 사고 신고 시스템
- **markDelinquentCards**: SYSTEM (정기 batch)
- **cancelTransaction**: 가맹점 시스템 또는 본인 (`transaction.user_id = userId`)

---

## 관련 문서

- `rules/CC-001.md` ~ `rules/CC-006.md` — 개별 BL detail
- `runbooks/CC-001.md` ~ `runbooks/CC-006.md` — operational runbooks
- `tests/CC-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/credit-card.ts` — 합성 source
