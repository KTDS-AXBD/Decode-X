# Spec Container — TELECOM-001 (통신 산업 합성 도메인)

**Skill ID**: TELECOM-001
**Domain**: Telecom (통신 산업 — 가입한도/데이터할당량/플랜업그레이드atomic/가입상태전환/청구주기배치/번호이동atomic)
**Source**: SYNTHETIC — Sprint 296 F462, withRuleId 재사용 26번째 도메인 PoC (Government 다음 산업, 15번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (TC-001 ~ TC-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| TC-001 | 가입 회선 활성화 요청 시 | `activeLines < MAX_ACTIVE_LINES` AND 고객 기준 활성 회선 조회 | `subscriptions` INSERT + status='active' 활성화 | `E422-LINE-LIMIT` (동시 가입 회선 한도 초과) |
| TC-002 | 데이터 사용량 기록 시 | `usageBytes <= dataQuotaLimit` (var-vs-var, `limit` keyword 매칭) | `data_usages` INSERT + 사용량 누적 | `E429-DATA-QUOTA` (데이터 할당량 초과) |
| TC-003 | 플랜 업그레이드 요청 시 | `subscription.status = 'active'` | atomic: `subscriptions.plan_id` UPDATE + `billing_cycles` INSERT + `subscriptions.activated_at` 갱신 | `E404-SUBSCRIPTION`, `E409-SUBSCRIPTION` |
| TC-004 | 가입 상태 전환 (pending → active → suspended → terminated) | 허용 매트릭스 충족 | `subscriptions.status` UPDATE | `E404-SUBSCRIPTION`, `E409-SUBSCRIPTION` |
| TC-005 | 청구 주기 일괄 처리 (배치) | `billing_cycles.status = 'pending'` AND 해당 청구 월 대상 확인 | `billing_cycles.status='billed'` 일괄 UPDATE + `billed_at` 기록 | 대상 없으면 billedCount=0 |
| TC-006 | 번호이동 처리 시 | `subscription.status != 'terminated'` | atomic: `port_out_requests` INSERT + `subscriptions.status='terminated'` + `terminated_at` 기록 | `E404-SUBSCRIPTION`, `E409-SUBSCRIPTION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `subscriptions` | INSERT (TC-001) / plan_id UPDATE (TC-003) / status 전환 (TC-004/TC-006) | activateSubscription / upgradePlan / transitionSubscriptionStatus / processPortOut |
| `data_plans` | 조회 (TC-002/TC-003) | checkDataUsage / upgradePlan |
| `data_usages` | INSERT (TC-002) | checkDataUsage |
| `billing_cycles` | INSERT (TC-003) / status='billed' (TC-005) | upgradePlan / runBillingCycle |
| `port_out_requests` | INSERT (TC-006) | processPortOut |

---

## 임계값 / 상수

- `MAX_ACTIVE_LINES = 5` (TC-001 고객당 동시 가입 회선 한도)

---

## 상태 머신

```
subscriptions: [activateSubscription] → active (TC-001)
subscriptions: pending → active (TC-004 transition)
subscriptions: active → suspended (TC-004 transition)
subscriptions: suspended → active (TC-004 transition)
subscriptions: active → terminated (TC-004 / TC-006 port-out)
subscriptions: suspended → terminated (TC-004 transition)

billing_cycles: [created] → pending
billing_cycles: pending → billed (TC-005 batch / TC-003 upgrade)
billing_cycles: pending → failed (결제 오류)
billing_cycles: pending → waived (수동 면제)

port_out_requests: [created] → pending
port_out_requests: pending → completed (TC-006 atomic)
port_out_requests: pending → rejected (심사 거부)
```

---

## 권한

- **activateSubscription**: 고객 / 가입 SYSTEM
- **checkDataUsage**: 사용량 SYSTEM
- **upgradePlan**: 고객 / 플랜 SYSTEM
- **transitionSubscriptionStatus**: 상태관리 SYSTEM
- **runBillingCycle**: 청구 SYSTEM (배치)
- **processPortOut**: 번호이동 SYSTEM

---

## 관련 문서

- `rules/TC-001.md` ~ `rules/TC-006.md` — 개별 BL detail
- `runbooks/TC-001.md` ~ `runbooks/TC-006.md` — operational runbooks
- `tests/TC-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/telecom.ts` — 합성 source
