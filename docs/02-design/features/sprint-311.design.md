---
id: AIF-DSGN-109
sprint: 311
feature: F477
title: Property Mgmt 41번째 도메인 신규 (임대관리 산업, 30번째 신규 산업)
status: active
created: 2026-05-10
related: [AIF-PLAN-109]
---

# F477 Design — AIF-DSGN-109

## §1 개요

pet(PT) 패턴을 그대로 복제하여 property(PR) 41번째 도메인을 추가한다.  
Threshold×2 + Atomic×2 + Status×2 = 6 BLs. withRuleId 재사용, 신규 detector 0개.  
🏆 30 산업 연속 0 ABSENCE round number 마일스톤.

## §2 BL 설계

| BL | 함수 | Detector | 패턴 |
|----|------|----------|------|
| PR-001 | `computeUtilityBill()` | ThresholdCheck | Path A UPPERCASE `MAX_UTILITY_BILL_AMOUNT` |
| PR-002 | `approveMaintenance()` | ThresholdCheck | Path B var-vs-var `maintenanceBudgetLimit` keyword |
| PR-003 | `renewLease()` | AtomicTransaction | leases + deposits + lease_renewals UPDATE |
| PR-004 | `transitionLeaseStatus()` | StatusTransition | pending → active → renewed → terminated → archived |
| PR-005 | `markInspectionBatch()` | StatusTransition | batch CC-005 30번째 재사용 |
| PR-006 | `processEviction()` | AtomicTransaction | evictions + legal_proceedings + notifications + lease_closures |

## §3 데이터 스키마 (합성)

- `utility_bills` — 공과금 청구 기록 (한도 검증)
- `maintenance_budgets` — 유지보수 예산 단계별 한도
- `leases` — 임대 계약 (상태 전환)
- `lease_renewals` — 계약 갱신 이력
- `deposits` — 보증금 기록
- `property_inspections` — 정기 점검 기록
- `evictions` — 명도 처리 기록
- `legal_proceedings` — 법적 절차 기록

## §4 파일 목록

### 생성 (신규)

| 파일 | 설명 |
|------|------|
| `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/property.ts` | 6 함수 + PropertyError |
| `.decode-x/spec-containers/property/rules/property-rules.md` | BL 테이블 + 상태 머신 |
| `.decode-x/spec-containers/property/rules/PR-001.md` ~ `PR-006.md` | 개별 BL detail |
| `.decode-x/spec-containers/property/runbooks/PR-001.md` ~ `PR-006.md` | 운영 runbook |
| `.decode-x/spec-containers/property/tests/PR-001.yaml` | 대표 test 시나리오 |
| `.decode-x/spec-containers/property/provenance.yaml` | 출처 + detection 결과 |

### 수정 (기존)

| 파일 | 변경 |
|------|------|
| `scripts/divergence/domain-source-map.ts` | DOMAIN_MAP 41번째 entry 추가 |
| `packages/utils/src/divergence/rules-parser.ts` | BL_ID_PATTERN에 `PR` 추가 (PT 뒤, P 앞 — longer match first) |
| `packages/utils/src/divergence/bl-detector.ts` | PR-001~PR-006 REGISTRY 추가 + F477 comment |
| `packages/utils/test/bl-detector.test.ts` | PR-001~PR-006 describe 블록 추가, 225→231 count |

## §5 핵심 구현 상세

### PR-001 (ThresholdCheck Path A)
```typescript
const MAX_UTILITY_BILL_AMOUNT = 500000; // 공과금 한도 (원, 기본값)
if (totalBill >= MAX_UTILITY_BILL_AMOUNT) throw PropertyError('E422-UTILITY-EXCEEDED', ...)
```

### PR-002 (ThresholdCheck Path B — maintenanceBudgetLimit keyword)
```typescript
const maintenanceBudgetLimit = budget.limit_by_tier[property.tier] ?? 0;
if (requestedAmount > maintenanceBudgetLimit) throw PropertyError('E422-MAINTENANCE-EXCEEDED', ...)
```

### PR-003 (AtomicTransaction)
```typescript
db.transaction(() => {
  UPDATE leases SET status='renewed' + INSERT lease_renewals + UPDATE deposits.amount
})
```

### PR-004 (StatusTransition)
```
pending → active → renewed → terminated → archived
```

### PR-005 (StatusTransition batch)
```typescript
// CC-005 batch 30번째 재사용
for (const inspection of candidates) { UPDATE property_inspections SET status='inspected' }
```

### PR-006 (AtomicTransaction)
```typescript
db.transaction(() => {
  INSERT evictions + INSERT legal_proceedings + INSERT eviction_notifications + UPDATE leases.status='terminated'
})
```

## §6 검증

1. `pnpm --filter @ai-foundry/utils test --force` → 225→231 PASS
2. `tsx scripts/divergence/detect-bl.ts --all-domains` → 41 containers, coverage ≥ 93.2%
3. `tsx scripts/divergence/write-provenance.ts --apply` → 0 changes (PRESENCE 자동 입증)
4. prefix conflict 확인: `PR` 이 `P` 앞에 위치하는지 BL_ID_PATTERN regex 점검
