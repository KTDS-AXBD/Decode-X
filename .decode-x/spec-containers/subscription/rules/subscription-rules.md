# Spec Container — SUBSCRIPTION-001 (SaaS 구독 산업 합성 도메인)

**Skill ID**: SUBSCRIPTION-001
**Domain**: Subscription (SaaS 구독 산업 — 생성/갱신/상태/만료/환불)
**Source**: SYNTHETIC — Sprint 284 F450, withRuleId 재사용 14번째 도메인 PoC (Delivery 다음 산업)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (SB-001 ~ SB-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| SB-001 | 구독 생성 시 | `priceKrw ≥ MIN_PRICE_KRW` AND `MIN_CYCLE_DAYS ≤ cycleDays ≤ MAX_CYCLE_DAYS` | `subscriptions` INSERT (status='active', cycle_count=0, next_charge_at = now + cycleDays) | `E422-PR` (가격 미달), `E422-CY-MIN` (주기 미달), `E422-CY-MAX` (주기 초과) |
| SB-002 | 자동결제 직전 한도 검증 | `sub.status='active'` AND `auto_charge_limit ≥ price_krw` | `canCharge=true`, remainingHeadroom 반환 | `E404-SB`, `E409-ST` (비활성), `E422-LIMIT` (한도 미달) |
| SB-003 | 자동 갱신 트리거 | `next_charge_at ≤ now` AND `status='active'` | atomic transaction (`subscription_payments` INSERT status='success' + cycle_index++ + UPDATE next_charge_at = now + cycle_days) | `E404-SB` 또는 `E409-ST` |
| SB-004 | 상태 전환 (active ↔ paused, active → cancelled, paused → cancelled) | 허용 매트릭스 충족 | `status` UPDATE + cancelled_at 조건부 설정 | `E409-TR` (불허 전환) |
| SB-005 | 만료 자동 처리 (정기 batch) | `status='active'` AND `expires_at IS NOT NULL` AND `expires_at < now` | `status='expired'`, 마킹된 subscriptionIds 반환 | 만료 안 됐거나 expires_at NULL 시 제외 |
| SB-006 | 취소 + 환불 처리 | `status NOT IN {cancelled, expired}` | atomic transaction (`status='cancelled'` + `cancelled_at=now` + `subscription_payments` INSERT status='refunded' if elapsedDays ≤ MAX_REFUND_DAYS) | `E404-SB`, `E409-SB` (이미 종료) |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `subscriptions` | INSERT (SB-001) / cycle_count++ (SB-003) / status 전환 (SB-004/005/006) | createSubscription / autoRenew / transitionSubscriptionStatus / markExpiredSubscriptions / cancelWithRefund |
| `subscription_payments` | INSERT success (SB-003) / refunded (SB-006) | autoRenew / cancelWithRefund |
| `subscription_events` | (외부) 상태 변경 audit 기록 | 모든 lifecycle 변경 시 (Out of Scope) |

---

## 임계값 / 상수

- `MIN_PRICE_KRW = 1,000` (SB-001 최소 가격)
- `MIN_CYCLE_DAYS = 7` (SB-001 최소 주기)
- `MAX_CYCLE_DAYS = 365` (SB-001 최대 주기)
- `MAX_REFUND_DAYS = 14` (SB-006 환불 가능 기간 — 14일 이내 100%, 초과 시 0원)
- 환불 금액: `elapsedDays ≤ 14 ? price_krw : 0`

---

## 상태 머신

```
[createSubscription] → active
active → paused (SB-004, 사용자 일시 중지)
active → cancelled (SB-004 또는 SB-006, 사용자 취소)
active → expired (SB-005, expires_at 도달 batch)
paused → active (SB-004, 재개)
paused → cancelled (SB-004 또는 SB-006, 일시 중지 중 취소)
```

---

## 권한

- **createSubscription**: 본인 신청 (자체 결제 등록)
- **autoRenew**: SYSTEM (정기 cron, 사용자 권한 무관)
- **transitionSubscriptionStatus(paused/active)**: 본인 또는 ADMIN
- **transitionSubscriptionStatus(cancelled)**: 본인 또는 ADMIN
- **markExpiredSubscriptions**: SYSTEM (정기 batch)
- **cancelWithRefund**: 본인 또는 ADMIN (환불 자동 적용)

---

## 관련 문서

- `rules/SB-001.md` ~ `rules/SB-006.md` — 개별 BL detail
- `runbooks/SB-001.md` ~ `runbooks/SB-006.md` — operational runbooks
- `tests/SB-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/subscription.ts` — 합성 source
