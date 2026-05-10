# Spec Container — VETERINARY-001 (동물병원 진료 합성 도메인)

**Skill ID**: VETERINARY-001
**Domain**: Veterinary (동물병원 진료 산업 — 슬롯정원/백신한도/진료atomic/상태전환/의무기록만료배치/정산atomic)
**Source**: SYNTHETIC — Sprint 319 F485, withRuleId 재사용 45번째 도메인 PoC (Telemedicine 다음 산업, 34번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (VT-001 ~ VT-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| VT-001 | 진료 슬롯 예약 요청 시 | `slot.booked_count < capacity` (UPPERCASE fallback MAX_APPOINTMENT_CAPACITY) | 예약 허용 + slot_bookings INSERT | `E422-SLOT-CAPACITY-EXCEEDED` (정원 초과) |
| VT-002 | 백신 한도 적용 요청 시 | `subscription.vaccine_usage < vaccineLimit` (var-vs-var, `limit` keyword 매칭) | 백신 허용 + vaccine_usage 증가 | `E422-VACCINE-LIMIT-EXCEEDED` (백신 한도 초과) |
| VT-003 | 진료 예약 확정 요청 시 | `veterinarians.status = 'available'` | atomic: appointments INSERT + veterinarians UPDATE + appointment_payments INSERT | `E404-VETERINARIAN` |
| VT-004 | 진료 상태 전환 (scheduled → in_progress → completed → billed → reviewed) | 허용 매트릭스 충족 | `appointments.status` UPDATE | `E404-APPOINTMENT`, `E409-APPOINTMENT` |
| VT-005 | 의무기록 만료 일괄 처리 | `medical_records.status = 'active'` AND `archive_eligible_at <= expiredBefore` | `status='archived'` 일괄 UPDATE | 대상 없으면 markedCount=0 |
| VT-006 | 동물병원 정산 요청 시 | `appointments.status = 'completed'` | atomic: vet_billing_records INSERT + vet_payouts INSERT + vet_billing_records UPDATE | `E404-COMPLETED-APPOINTMENT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `slot_bookings` | INSERT (VT-001) | bookAppointmentSlot |
| `appointment_slots` | booked_count 증가 (VT-001) | bookAppointmentSlot |
| `pet_subscriptions` | vaccine_usage 증가 (VT-002) | applyVaccineLimit |
| `appointments` | INSERT (VT-003), status 갱신 (VT-004) | confirmAppointment / transitionAppointmentStatus |
| `veterinarians` | status='busy' (VT-003) | confirmAppointment |
| `appointment_payments` | INSERT (VT-003) | confirmAppointment |
| `medical_records` | status='archived' (VT-005) | markMedicalRecordArchiveBatch |
| `vet_billing_records` | INSERT + status='settled' (VT-006) | processVeterinaryBilling |
| `vet_payouts` | INSERT (VT-006) | processVeterinaryBilling |

---

## 임계값 / 상수

- `MAX_APPOINTMENT_CAPACITY = 20` (VT-001 진료 예약 슬롯 정원 기본 한도, 인원)
- `vaccineLimit = pet_subscriptions.vaccine_limit` (VT-002 구독 등급별 백신 한도)

---

## 상태 머신

```
slot_bookings: scheduled → confirmed → in_progress → completed (운영 전환)
slot_bookings: * → cancelled (운영 취소)

appointments: scheduled → in_progress (VT-004 transition)
appointments: in_progress → completed (VT-004 transition)
appointments: completed → billed (VT-004 transition)
appointments: billed → reviewed (VT-004 transition)

medical_records: active → archived (VT-005 batch)
medical_records: active → purged (보존 기한 만료)
vet_billing_records: pending → calculated → settled (VT-006 atomic)
veterinarians: available → busy (VT-003 atomic)
```

---

## 의존 함수 (veterinary.ts)

| BL | 함수 | detector |
|----|------|----------|
| VT-001 | `bookAppointmentSlot` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| VT-002 | `applyVaccineLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| VT-003 | `confirmAppointment` | AtomicTransaction (`db.transaction(...)`) |
| VT-004 | `transitionAppointmentStatus` | StatusTransition (matrix) |
| VT-005 | `markMedicalRecordArchiveBatch` | StatusTransition (batch) |
| VT-006 | `processVeterinaryBilling` | AtomicTransaction (`db.transaction(...)`) |
