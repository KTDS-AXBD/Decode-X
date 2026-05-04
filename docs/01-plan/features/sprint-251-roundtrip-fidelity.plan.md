---
id: AIF-PLAN-048
title: Sprint 251 — F359 round-trip 신뢰도 91.7% → 95%+ 회복
type: plan
status: active
sprint: 251
created: 2026-05-04
---

# AIF-PLAN-048: F359 round-trip 신뢰도 회복

## 목표
`scripts/roundtrip-verify/` 하네스의 comparator 허점(8 keys silent PASS) + domain 미구현(BL-024/025/028/029) + 하드코딩(rfndPsbltyYn)을 수정하여 implementedRate 91.7% → ≥95%로 회복.

## 베이스라인
- total: 28 / implementedTotal: 12 / implementedPassed: 11 → **91.7%**
- 유일 실패: TC-REFUND-002 (UNUSED_FULL 10일 → BL-024 미구현)

## 4 Sub-task 의존성 (실행 순서)

```
(b) rfndPsbltyYn TD-23
    └─ (d) BL-020 종합 (BL-024/025/029)
           └─ (c) BL-028 cashback 인프라
                  └─ (a) comparator 8 keys
```

- **(b) TD-23**: `refund.ts:RefundResult`에 `rfndPsbltyYn` 추가 → runner 하드코딩 제거 (선행)
- **(d) BL-020**: BL-024(7일) + BL-025(60% 사용) + BL-029(만료) → TC-REFUND-002 PASS 전환
- **(c) BL-028**: `cashback_amount` 컬럼 migration + exclusionAmount 산출 → TC-REFUND-006 실 PASS
- **(a) comparator**: 3 real keys 실 검증 + 5 stub keys 명시화

## cashback 데이터 모델 결정

| 위치 | 장점 | 단점 | 결정 |
|---|---|---|---|
| `vouchers.cashback_amount` | 단순, 현 스키마 확장 | 충전 이력 비추적 | **선택** |
| `charge_transactions`별 컬럼 | 이력 추적 | 조인 필요 | 미선택 |
| 신규 `cashback_records` 테이블 | 정규화 완벽 | 과도한 복잡도 | 미선택 |

이유: PoC 범위에서 단순성 우선. 전수 검증(F356-B) 전 스키마 변경 비용 최소화.

## exclusion 산출 공식 (BL-028)

`exclusion_amount = cashback_amount × 1.1` (캐시백 + 10% 취급수수료)

검증: cashbackUsed=5000 → exclusion=5500 → deposit=50000-5500=44500 ✓ (TC-REFUND-006 계약값 일치)

## DoD
- [ ] implementedRate ≥95% (목표 12/12 = 100%)
- [ ] 8 keys silent PASS 0건 (3 real keys 실 검증, 5 stubs 명시화)
- [ ] TD-22 + TD-23 SPEC §8 ✅ 마킹
- [ ] BL-028 cashback migration 적용 + working-version typecheck pass
- [ ] Match Rate ≥90%

## 변경 파일 목록

| 파일 | 변경 유형 | Sub-task |
|---|---|---|
| `반제품-스펙/.../migrations/0002_cashback.sql` | NEW | (c) |
| `반제품-스펙/.../domain/refund.ts` | MOD | (b)(c)(d) |
| `scripts/roundtrip-verify/fixtures.ts` | MOD | (a)(c) |
| `scripts/roundtrip-verify/runner.ts` | MOD | (a)(b) |
| `scripts/roundtrip-verify/comparator.ts` | MOD | (a) |
| `scripts/roundtrip-verify/types.ts` | MOD | (a) |
