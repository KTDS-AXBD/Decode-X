# Spec Container — INSURANCE-001 (보험 산업 합성 도메인)

**Skill ID**: INSURANCE-001
**Domain**: Insurance (보험 산업 — 가입/청구/상태/만료/환불)
**Source**: SYNTHETIC — Sprint 285 F451, withRuleId 재사용 15번째 도메인 PoC (Subscription 다음 산업, 4번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (IN-001 ~ IN-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| IN-001 | 보험 가입 시 | `premiumKrw ≥ MIN_PREMIUM_KRW` AND `MIN_INSURED_AGE ≤ insuredAge ≤ MAX_INSURED_AGE` | `policies` INSERT (status='active', reserved_amount=0, expires_at = +1년) | `E422-PR` (premium 미달), `E422-AGE-MIN` / `E422-AGE-MAX` |
| IN-002 | 청구 한도 검증 시 | `policy.status='active'` AND `coverage_limit - reserved_amount ≥ claim_amount` | `canClaim=true`, remainingCoverage 반환 | `E404-PO`, `E409-ST` (비활성), `E422-LIMIT` (한도 초과) |
| IN-003 | 청구 승인 시 | claim pending + policy active + 한도 충분 | atomic transaction (`claims.status='approved'` + `policies.reserved_amount += claim_amount`) | `E404-CL`, `E409-CL`, `E409-PO`, `E422-LIMIT` |
| IN-004 | 정책 상태 전환 (active ↔ suspended, → cancelled) | 허용 매트릭스 충족 | `policies.status` UPDATE + cancelled_at 조건부 | `E409-TR` (불허 전환) |
| IN-005 | 만료 자동 처리 (정기 batch) | `status='active'` AND `expires_at IS NOT NULL` AND `expires_at < now` | `status='expired'`, 마킹된 policyIds 반환 | 만료 안 됐거나 expires_at NULL 시 제외 |
| IN-006 | 청구 거절 + 환불 처리 | claim pending | atomic transaction (`claims.status='rejected'` + 30일 이내 시 `claim_payments` INSERT type='refund' amount=premium_krw) | `E404-CL`, `E409-CL` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `policies` | INSERT (IN-001) / reserved_amount UPDATE (IN-003) / status 전환 (IN-004/005) | issuePolicy / approveClaim / transitionPolicyStatus / markExpiredPolicies |
| `claims` | INSERT (외부) / status 전환 approved (IN-003) / rejected (IN-006) | (외부 fileClaim) / approveClaim / rejectClaimWithRefund |
| `claim_payments` | INSERT (IN-006 환불) | rejectClaimWithRefund |

---

## 임계값 / 상수

- `MIN_PREMIUM_KRW = 10,000` (IN-001 최소 월 보험료)
- `MIN_INSURED_AGE = 18` (IN-001 최소 가입 연령)
- `MAX_INSURED_AGE = 80` (IN-001 최대 가입 연령)
- `REFUND_GRACE_DAYS = 30` (IN-006 환불 가능 기간)
- 가입 시 expires_at 자동 산정: `now + 365일`

---

## 상태 머신

```
[issuePolicy] → active
active → suspended (IN-004, 사용자/관리자 일시 중지)
active → cancelled (IN-004, 사용자 해약)
active → expired (IN-005, expires_at 도달 batch)
suspended → active (IN-004, 재개)
suspended → cancelled (IN-004, 일시 중지 중 해약)

claim:
[fileClaim 외부] → pending
pending → approved (IN-003, 심사 통과)
pending → rejected (IN-006, 심사 거절)
```

---

## 권한

- **issuePolicy**: 본인 신청 또는 ADMIN
- **approveClaim**: ADMIN (심사관)
- **transitionPolicyStatus**: 본인 또는 ADMIN
- **markExpiredPolicies**: SYSTEM (정기 batch)
- **rejectClaimWithRefund**: ADMIN (심사관)

---

## 관련 문서

- `rules/IN-001.md` ~ `rules/IN-006.md` — 개별 BL detail
- `runbooks/IN-001.md` ~ `runbooks/IN-006.md` — operational runbooks
- `tests/IN-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/insurance.ts` — 합성 source
