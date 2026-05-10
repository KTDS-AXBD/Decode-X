---
id: AIF-DSGN-103
sprint: 305
feature: F471
title: Mining 35번째 도메인 신규 (광업 산업, 24번째 신규 산업)
status: active
created: 2026-05-10
related: [AIF-PLAN-103]
---

# F471 Design — AIF-DSGN-103

## §1 개요

aviation(AV) 패턴을 그대로 복제하여 mining(MN) 35번째 도메인을 추가한다.  
Threshold×2 + Atomic×2 + Status×2 = 6 BLs. withRuleId 재사용, 신규 detector 0개.

## §2 BL 설계

| BL | 함수 | Detector | 패턴 |
|----|------|----------|------|
| MN-001 | `recordExtraction()` | ThresholdCheck | Path A UPPERCASE `MAX_EXTRACTION_QUOTA` |
| MN-002 | `computeRoyalty()` | ThresholdCheck | Path B var-vs-var `royaltyTierLimit` keyword |
| MN-003 | `processBlastOperation()` | AtomicTransaction | blast_records + safety_clearances + operations UPDATE |
| MN-004 | `transitionOreStatus()` | StatusTransition | extracted→graded→processed→shipped |
| MN-005 | `runComplianceBatch()` | StatusTransition | batch CC-005 24번째 재사용 |
| MN-006 | `processSafetyIncident()` | AtomicTransaction | incidents + investigations + corrective_actions |

## §3 데이터 스키마 (합성)

- `extractions` — 채광 기록 (quota 검증)
- `royalty_tiers` — 로열티 단계별 한도
- `blast_operations` — 발파 작업 기록
- `ore_batches` — 광석 배치 (상태 전환)
- `compliance_checks` — 환경 준수 점검
- `safety_incidents` — 안전 사고 기록

## §4 파일 목록

### 생성 (신규)

| 파일 | 설명 |
|------|------|
| `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/mining.ts` | 6 함수 + MiningError |
| `.decode-x/spec-containers/mining/rules/mining-rules.md` | BL 테이블 + 상태 머신 |
| `.decode-x/spec-containers/mining/rules/MN-001.md` ~ `MN-006.md` | 개별 BL detail |
| `.decode-x/spec-containers/mining/runbooks/MN-001.md` ~ `MN-006.md` | 운영 runbook |
| `.decode-x/spec-containers/mining/tests/MN-001.yaml` | 대표 test 시나리오 |
| `.decode-x/spec-containers/mining/provenance.yaml` | 출처 + detection 결과 |

### 수정 (기존)

| 파일 | 변경 |
|------|------|
| `scripts/divergence/domain-source-map.ts` | DOMAIN_MAP 35번째 entry 추가 |
| `packages/utils/src/divergence/rules-parser.ts` | BL_ID_PATTERN에 `MN` 추가 |
| `packages/utils/src/divergence/bl-detector.ts` | MN-001~MN-006 REGISTRY 추가 + F471 comment |
| `packages/utils/test/bl-detector.test.ts` | MN-001~MN-006 describe 블록 추가 |

## §5 핵심 구현 상세

### MN-001 (ThresholdCheck Path A)
```typescript
const MAX_EXTRACTION_QUOTA = 50000; // 일일 채광량 한도 (톤)
if (totalExtracted >= MAX_EXTRACTION_QUOTA) throw MiningError('E422-QUOTA-EXCEEDED', ...)
```

### MN-002 (ThresholdCheck Path B — royaltyTierLimit keyword)
```typescript
const royaltyTierLimit = royaltyLimitByTier[ore.tier] ?? 0;
if (royaltyAmount > royaltyTierLimit) throw MiningError('E422-ROYALTY-EXCEEDED', ...)
```

### MN-003 (AtomicTransaction)
```typescript
db.transaction(() => {
  INSERT blast_records + INSERT safety_clearances + UPDATE blast_operations.status + UPDATE ore_batches
})
```

### MN-004 (StatusTransition)
```
extracted → graded → processed → shipped
```

### MN-005 (StatusTransition batch)
```typescript
// CC-005 batch 24번째 재사용
for (const check of candidates) { UPDATE compliance_checks SET status='checked' }
```

### MN-006 (AtomicTransaction)
```typescript
db.transaction(() => {
  INSERT safety_incidents + INSERT incident_investigations + INSERT corrective_actions + UPDATE safety_incidents.filed
})
```

## §6 검증

1. `pnpm --filter @ai-foundry/utils test --force` → 189→195 PASS
2. `tsx scripts/divergence/detect-bl.ts --all-domains` → 35 containers, coverage ≥ 92%
3. `tsx scripts/divergence/write-provenance.ts --apply` → 0 changes (PRESENCE 자동 입증)
