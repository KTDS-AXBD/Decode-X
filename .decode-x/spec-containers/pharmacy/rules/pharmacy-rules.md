# Spec Container — PHARMACY-001 (제약/약국 산업 합성 도메인)

**Skill ID**: PHARMACY-001
**Domain**: Pharmacy (제약/약국 산업 — 용량한도/처방잔여/조제atomic/처방상태전환/리콜배치/상호작용atomic)
**Source**: SYNTHETIC — Sprint 299 F465, withRuleId 재사용 29번째 도메인 PoC (Media 다음 산업, 18번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (PH-001 ~ PH-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| PH-001 | 처방 용량 검증 시 | `dosageAmount < MAX_DAILY_DOSE` (UPPERCASE 상수, 4000mg) AND 처방 status='issued' or 'pending' | 용량 허용 + status='pending' 전환 | `E422-DOSAGE-EXCEEDED` (일일 최대 용량 초과) |
| PH-002 | 처방 리필 요청 시 | `refillsUsed <= refillQuotaLimit` (var-vs-var, `limit` keyword 매칭) | 리필 허용 + canRefill=true | `E422-REFILL-QUOTA` (처방 잔여 횟수 초과) |
| PH-003 | 처방 조제 요청 시 | `prescription.status = 'pending'` AND `drug.status != 'recalled'` AND `stock_count > 0` | atomic: `stock_count` 차감 + `prescriptions.status='dispensed'` + `dispenses` INSERT | `E404-PRESCRIPTION`, `E409-PRESCRIPTION`, `E422-DRUG-RECALLED`, `E422-OUT-OF-STOCK` |
| PH-004 | 처방 상태 전환 (issued → pending → dispensed → completed → expired) | 허용 매트릭스 충족 | `prescriptions.status` UPDATE + 타임스탬프 기록 | `E404-PRESCRIPTION`, `E409-PRESCRIPTION` |
| PH-005 | 리콜 대상 약품 일괄 처리 (배치) | `drugs.status = 'active'` AND `recalled_at <= recallCutoffDate` | `drugs.status='recalled'` 일괄 UPDATE | 대상 없으면 markedCount=0 |
| PH-006 | 약물 상호작용 검증 시 | severe 상호작용 없으면 처방 허용 | atomic: 상호작용 검증 + 대체약 추천 + 처방 차단 (interaction_logs INSERT) | `E404-PRESCRIPTION`, `E404-DRUG`, `E409-PRESCRIPTION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `prescriptions` | status 전환 / dispensed_at / completed_at / expired_at (PH-001/PH-003/PH-004/PH-006) | validateDosage / dispensePrescription / transitionPrescriptionStatus / checkDrugInteraction |
| `drugs` | stock_count 차감 (PH-003) / status='recalled' (PH-005) | dispensePrescription / markRecalledBatches |
| `dispenses` | INSERT (PH-003) | dispensePrescription |
| `interaction_logs` | INSERT (PH-006) | checkDrugInteraction |

---

## 임계값 / 상수

- `MAX_DAILY_DOSE = 4000` (PH-001 일일 최대 용량 한도, mg 기준)
- `refillQuotaLimit = 1/3/12/6` (PH-002 처방 유형별 최대 리필 횟수 — antibiotic/painkiller/chronic/supplement)

---

## 상태 머신

```
prescriptions: [created] → issued (초기 상태)
prescriptions: issued → pending (PH-001 용량 검증 통과 / PH-004 transition)
prescriptions: pending → dispensed (PH-003 조제 atomic / PH-004 transition)
prescriptions: dispensed → completed (PH-004 transition)
prescriptions: issued/pending/dispensed → expired (PH-004 transition)
prescriptions: completed → expired (PH-004 transition)

drugs: [created] → active (초기 상태)
drugs: active → recalled (PH-005 batch)
drugs: active → discontinued (운영 처리)

dispenses: [created] — PH-003 atomic 생성 (불변)
interaction_logs: [created] — PH-006 atomic 생성 (불변, blocked=0/1)
```

---

## 권한

- **validateDosage**: 약사 / 조제 SYSTEM
- **checkRefillQuota**: 약사 / 처방 SYSTEM
- **dispensePrescription**: 약사 / 조제 SYSTEM
- **transitionPrescriptionStatus**: 약사 / 처방관리 SYSTEM
- **markRecalledBatches**: 리콜관리 SYSTEM (배치)
- **checkDrugInteraction**: 약사 / 약물안전 SYSTEM

---

## 관련 문서

- `rules/PH-001.md` ~ `rules/PH-006.md` — 개별 BL detail
- `runbooks/PH-001.md` ~ `runbooks/PH-006.md` — operational runbooks
- `tests/PH-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/pharmacy.ts` — 합성 source
