# Spec Container — TELEMEDICINE-001 (원격진료 합성 도메인)

**Skill ID**: TELEMEDICINE-001
**Domain**: Telemedicine (원격진료 산업 — 슬롯정원/처방한도/진료atomic/상태전환/처방만료배치/정산atomic)
**Source**: SYNTHETIC — Sprint 318 F484, withRuleId 재사용 44번째 도메인 PoC (Beauty 다음 산업, 33번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (TM-001 ~ TM-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| TM-001 | 진료 슬롯 예약 요청 시 | `slot.booked_count < capacity` (UPPERCASE fallback MAX_SLOT_CAPACITY) | 예약 허용 + slot_bookings INSERT | `E422-SLOT-CAPACITY-EXCEEDED` (정원 초과) |
| TM-002 | 처방 한도 적용 요청 시 | `subscription.prescription_usage < prescriptionLimit` (var-vs-var, `limit` keyword 매칭) | 처방 허용 + prescription_usage 증가 | `E422-PRESCRIPTION-LIMIT-EXCEEDED` (처방 한도 초과) |
| TM-003 | 원격진료 예약 확정 요청 시 | `doctors.status = 'available'` | atomic: consultations INSERT + doctors UPDATE + consultation_payments INSERT | `E404-DOCTOR` |
| TM-004 | 진료 상태 전환 (booked → in_progress → completed → prescribed → reviewed) | 허용 매트릭스 충족 | `consultations.status` UPDATE | `E404-CONSULTATION`, `E409-CONSULTATION` |
| TM-005 | 처방전 만료 일괄 처리 | `prescriptions.status = 'active'` AND `valid_until <= expiredBefore` | `status='expired'` 일괄 UPDATE | 대상 없으면 markedCount=0 |
| TM-006 | 진료비 정산 요청 시 | `consultations.status = 'completed'` | atomic: billing_records INSERT + payouts INSERT + billing_records UPDATE | `E404-COMPLETED-CONSULTATION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `slot_bookings` | INSERT (TM-001) | bookConsultationSlot |
| `consultation_slots` | booked_count 증가 (TM-001) | bookConsultationSlot |
| `patient_subscriptions` | prescription_usage 증가 (TM-002) | applyPrescriptionLimit |
| `consultations` | INSERT (TM-003), status 갱신 (TM-004) | confirmConsultation / transitionConsultationStatus |
| `doctors` | status='busy' (TM-003) | confirmConsultation |
| `consultation_payments` | INSERT (TM-003) | confirmConsultation |
| `prescriptions` | status='expired' (TM-005) | markPrescriptionExpiryBatch |
| `billing_records` | INSERT + status='settled' (TM-006) | processBilling |
| `payouts` | INSERT (TM-006) | processBilling |

---

## 임계값 / 상수

- `MAX_SLOT_CAPACITY = 30` (TM-001 진료 슬롯 정원 기본 한도, 인원)
- `prescriptionLimit = patient_subscriptions.prescription_limit` (TM-002 구독 등급별 처방 한도)

---

## 상태 머신

```
slot_bookings: booked → confirmed → in_progress → completed (운영 전환)
slot_bookings: * → cancelled (운영 취소)

consultations: booked → in_progress (TM-004 transition)
consultations: in_progress → completed (TM-004 transition)
consultations: completed → prescribed (TM-004 transition)
consultations: prescribed → reviewed (TM-004 transition)

prescriptions: active → expired (TM-005 batch)
prescriptions: active → filled (외부 약국 fulfillment)
billing_records: pending → calculated → settled (TM-006 atomic)
doctors: available → busy (TM-003 atomic)
```

---

## 의존 함수 (telemedicine.ts)

| BL | 함수 | detector |
|----|------|----------|
| TM-001 | `bookConsultationSlot` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| TM-002 | `applyPrescriptionLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| TM-003 | `confirmConsultation` | AtomicTransaction (`db.transaction(...)`) |
| TM-004 | `transitionConsultationStatus` | StatusTransition (matrix) |
| TM-005 | `markPrescriptionExpiryBatch` | StatusTransition (batch) |
| TM-006 | `processBilling` | AtomicTransaction (`db.transaction(...)`) |
