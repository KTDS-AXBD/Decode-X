# Spec Container — REALESTATE-001 (부동산 산업 합성 도메인)

**Skill ID**: REALESTATE-001
**Domain**: Real Estate (부동산 산업 — 매물/임차/계약/만료)
**Source**: SYNTHETIC — Sprint 288 F454, withRuleId 재사용 18번째 도메인 PoC (Education 다음 산업, 7번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (RE-001 ~ RE-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| RE-001 | 매물 등록 시 | `MIN_SIZE_M2 ≤ sizeM2 ≤ MAX_SIZE_M2` (5~10,000) | `properties` INSERT (status='listed') | `E422-SZ-MIN` 또는 `E422-SZ-MAX` |
| RE-002 | 임차 한도 검증 | `tenant.status='verified'` AND `monthly_income × 0.4 ≥ monthlyRentKrw` | `canLease=true`, remainingRentLimit 반환 | `E404-TN`, `E409-ST`, `E422-LIMIT` |
| RE-003 | 계약 체결 | property status='listed' | atomic transaction (`leases` INSERT status='active' + `properties.status='leased'`) | `E404-PR`, `E409-PR` |
| RE-004 | 계약 상태 전환 (active → expiring/terminated/renewed) | 허용 매트릭스 충족 | `leases.status` UPDATE + terminated_at 조건부 | `E409-TR` |
| RE-005 | 계약 만료 자동 처리 (정기 batch) | `status='active'` AND `end_at < now` | `status='expiring'`, 마킹된 leaseIds 반환 | end_at 미도달 시 skip |
| RE-006 | 계약 취소 + 환불 | `status='active'` | atomic transaction (`status='terminated'` + `properties.status='listed'`. 시작 14일 이전 시 deposit 100% 환불, 미만 시 0원) | `E404-LS`, `E409-LS` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `properties` | INSERT (RE-001) / status 'listed' ↔ 'leased' (RE-003/006) | listProperty / signLease / cancelLeaseWithRefund |
| `leases` | INSERT (RE-003) / status 전환 (RE-004/005/006) | signLease / transitionLeaseStatus / markExpiringLeases / cancelLeaseWithRefund |
| `tenants` | (외부 verify) | (외부) |

---

## 임계값 / 상수

- `MIN_SIZE_M2 = 5` (RE-001 최소 규모)
- `MAX_SIZE_M2 = 10,000` (RE-001 최대 규모)
- `MAX_RENT_INCOME_RATIO = 0.4` (RE-002 월세/월소득 한도)
- `REFUND_DAYS_BEFORE_LEASE_START = 14` (RE-006 환불 가능 기간)

---

## 상태 머신

```
property: [listProperty] → listed
property: listed → leased (RE-003)
property: leased → listed (RE-006)
property: listed/leased → maintenance (외부)

lease: [signLease] → active
lease: active → expiring (RE-004 또는 RE-005 batch)
lease: active → terminated (RE-004 또는 RE-006)
lease: active → renewed (RE-004)
lease: expiring → terminated / renewed (RE-004)
```

---

## 권한

- **listProperty**: 본인 (소유자) 또는 ADMIN
- **checkRentAffordabilityLimit**: 임차인 본인 또는 중개인
- **signLease**: 양 당사자 (소유자 + 임차인) + 중개인
- **transitionLeaseStatus**: 소유자 또는 임차인 (사유별)
- **markExpiringLeases**: SYSTEM (정기 batch)
- **cancelLeaseWithRefund**: 본인 (양 당사자) 또는 ADMIN

---

## 관련 문서

- `rules/RE-001.md` ~ `rules/RE-006.md` — 개별 BL detail
- `runbooks/RE-001.md` ~ `runbooks/RE-006.md` — operational runbooks
- `tests/RE-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/realestate.ts` — 합성 source
