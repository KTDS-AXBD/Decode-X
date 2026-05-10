# Spec Container — MINING-001 (광업 산업 합성 도메인)

**Skill ID**: MINING-001
**Domain**: Mining (광업 산업 — 채광한도/로열티한도/발파atomic/광석상태전환/환경점검/사고atomic)
**Source**: SYNTHETIC — Sprint 305 F471, withRuleId 재사용 35번째 도메인 PoC (Aviation 다음 산업, 24번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (MN-001 ~ MN-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| MN-001 | 채광량 기록 요청 시 | `totalExtracted < MAX_EXTRACTION_QUOTA` (UPPERCASE 상수, 50000톤) | 채광 허용 + extractions INSERT | `E422-QUOTA-EXCEEDED` (일일 채광 한도 초과) |
| MN-002 | 로열티 계산 시 | `royaltyAmount <= royaltyTierLimit` (var-vs-var, `limit` keyword 매칭) | 로열티 승인 + royalty_records INSERT | `E422-ROYALTY-EXCEEDED` (로열티 한도 초과) |
| MN-003 | 발파 작업 실행 시 | `blast_operation.status = 'planned'` | atomic: `blast_records` INSERT + `safety_clearances` INSERT + `blast_operations.status` 갱신 + `ore_batches.status` 갱신 | `E404-BLAST`, `E409-BLAST` |
| MN-004 | 광석 상태 전환 (extracted → graded → processed → shipped) | 허용 매트릭스 충족 | `ore_batches.status` UPDATE + 타임스탬프 기록 | `E404-BATCH`, `E409-BATCH` |
| MN-005 | 환경 준수 일괄 점검 | `compliance_checks.scheduled_at <= scheduledBefore` AND `status = 'pending'` | `status='checked', checked_at=NOW()` 일괄 UPDATE | 대상 없으면 checkedCount=0 |
| MN-006 | 안전 사고 처리 시 | 사고 신고 필수 | atomic: `safety_incidents` INSERT + `incident_investigations` INSERT + `corrective_actions` INSERT + `safety_incidents.filed` UPDATE | 조회 실패 시 MiningError |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `extractions` | INSERT (MN-001) | recordExtraction |
| `royalty_records` | INSERT (MN-002) | computeRoyalty |
| `blast_records` | INSERT (MN-003) | processBlastOperation |
| `safety_clearances` | INSERT (MN-003) | processBlastOperation |
| `blast_operations` | status 갱신 (MN-003) | processBlastOperation |
| `ore_batches` | status 갱신 (MN-003/MN-004) | processBlastOperation / transitionOreStatus |
| `compliance_checks` | status='checked' 일괄 갱신 (MN-005) | runComplianceBatch |
| `safety_incidents` | INSERT + filed=1 (MN-006) | processSafetyIncident |
| `incident_investigations` | INSERT (MN-006) | processSafetyIncident |
| `corrective_actions` | INSERT (MN-006) | processSafetyIncident |

---

## 임계값 / 상수

- `MAX_EXTRACTION_QUOTA = 50000` (MN-001 일일 채광량 한도, 톤)
- `royaltyTierLimit = royalty_tiers.max_royalty_limit` (MN-002 단계별 최대 로열티, 원)

---

## 상태 머신

```
ore_batches: extracted → graded (MN-004 transition)
ore_batches: graded → processed (MN-004 transition)
ore_batches: processed → shipped (MN-004 transition)

blast_operations: planned → executed (MN-003 atomic)
compliance_checks: pending → checked (MN-005 batch)

safety_incidents: [created] — MN-006 atomic 생성 (filed=1)
incident_investigations: [created] — MN-006 atomic 생성 (불변)
corrective_actions: [created] — MN-006 atomic 생성 (불변)
```

---

## 권한

- **recordExtraction**: 채광운영 SYSTEM / 현장 운영자
- **computeRoyalty**: 로열티관리 SYSTEM
- **processBlastOperation**: 발파운영 SYSTEM (operator 필수)
- **transitionOreStatus**: 광석관리 SYSTEM
- **runComplianceBatch**: 환경관리 SYSTEM (배치)
- **processSafetyIncident**: 안전관리 SYSTEM / 안전담당자

---

## 관련 문서

- `rules/MN-001.md` ~ `rules/MN-006.md` — 개별 BL detail
- `runbooks/MN-001.md` ~ `runbooks/MN-006.md` — operational runbooks
- `tests/MN-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/mining.ts` — 합성 source
