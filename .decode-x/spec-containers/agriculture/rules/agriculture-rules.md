# Spec Container — AGRICULTURE-001 (농업 산업 합성 도메인)

**Skill ID**: AGRICULTURE-001
**Domain**: Agriculture (농업 산업 — 수확량한도/살포한도/수확atomic/작물상태전환/등급배치/인증atomic)
**Source**: SYNTHETIC — Sprint 300 F466, withRuleId 재사용 30번째 도메인 PoC (Pharmacy 다음 산업, 19번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (AG-001 ~ AG-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| AG-001 | 작물 수확량 기록 시 | `yieldPerHectare < MAX_YIELD_PER_HECTARE` (UPPERCASE 상수, 10000 kg/ha) AND 작물 status='mature' or 'harvested' | 수확량 허용 + status='harvested' 전환 | `E422-YIELD-EXCEEDED` (단위 면적당 최대 수확량 초과) |
| AG-002 | 살충제 살포 요청 시 | `pesticideApplied <= pesticideQuotaLimit` (var-vs-var, `limit` keyword 매칭) | 살포 허용 + approved=true | `E422-PESTICIDE-QUOTA` (살포 한도 초과) |
| AG-003 | 수확 처리 요청 시 | `crop.status = 'mature'` AND `field.status != 'restricted'` | atomic: `harvests` INSERT + `gradings` INSERT + `crops.status='harvested'` | `E404-CROP`, `E409-CROP`, `E404-FIELD`, `E422-FIELD-RESTRICTED` |
| AG-004 | 작물 상태 전환 (planted → growing → mature → harvested → sold) | 허용 매트릭스 충족 | `crops.status` UPDATE + 타임스탬프 기록 | `E404-CROP`, `E409-CROP` |
| AG-005 | 등급 대상 수확물 일괄 처리 (배치) | `harvests.graded = 0` AND `harvested_at <= gradingCutoffDate` | `harvests.status='graded'` 일괄 UPDATE | 대상 없으면 markedCount=0 |
| AG-006 | 작물 인증 발급 시 | `crop.status = 'harvested' or 'sold'` AND `grade != 'rejected'` | atomic: `certifications` INSERT + `certification_labels` INSERT + `crops.certified=1` | `E404-CROP`, `E409-CROP`, `E422-CROP-REJECTED` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `crops` | status 전환 / yield_kg / harvested_at / sold_at / certified (AG-001/AG-003/AG-004/AG-006) | recordCropYield / processHarvest / transitionCropStatus / issueCertification |
| `fields` | — (읽기 전용, AG-001/AG-002 검증용) | |
| `harvests` | INSERT (AG-003) / status='graded' (AG-005) | processHarvest / markBatchGrading |
| `gradings` | INSERT (AG-003) | processHarvest |
| `pesticide_logs` | INSERT (AG-002) | applyPesticide |
| `certifications` | INSERT (AG-006) | issueCertification |
| `certification_labels` | INSERT (AG-006) | issueCertification |

---

## 임계값 / 상수

- `MAX_YIELD_PER_HECTARE = 10000` (AG-001 단위 면적당 최대 수확량, kg/ha)
- `pesticideQuotaLimit = 50/80/120` (AG-002 면적 카테고리별 최대 살포 허용량 — small/medium/large ha)

---

## 상태 머신

```
crops: [created] → planted (초기 상태)
crops: planted → growing (AG-004 transition)
crops: growing → mature (AG-004 transition)
crops: mature → harvested (AG-003 수확 atomic / AG-004 transition)
crops: harvested → sold (AG-004 transition)

harvests: [created] — AG-003 atomic 생성 (graded=0)
harvests: graded=0 → graded=1 / status='graded' (AG-005 batch)

certifications: [created] — AG-006 atomic 생성 (불변)
certification_labels: [created] — AG-006 atomic 생성 (불변)
pesticide_logs: [created] — AG-002 생성 (불변, approved=1)
```

---

## 권한

- **recordCropYield**: 농부 / 수확 SYSTEM
- **applyPesticide**: 농부 / 농약관리 SYSTEM
- **processHarvest**: 검사원 / 수확관리 SYSTEM
- **transitionCropStatus**: 농부 / 작물관리 SYSTEM
- **markBatchGrading**: 등급관리 SYSTEM (배치)
- **issueCertification**: 인증기관 / 인증관리 SYSTEM

---

## 관련 문서

- `rules/AG-001.md` ~ `rules/AG-006.md` — 개별 BL detail
- `runbooks/AG-001.md` ~ `runbooks/AG-006.md` — operational runbooks
- `tests/AG-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/agriculture.ts` — 합성 source
