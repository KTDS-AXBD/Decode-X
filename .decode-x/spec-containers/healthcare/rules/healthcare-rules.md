# Spec Container — HEALTHCARE-001 (의료 산업 합성 도메인)

**Skill ID**: HEALTHCARE-001
**Domain**: Healthcare (의료 산업 — 환자/처방/예약/약제)
**Source**: SYNTHETIC — Sprint 286 F452, withRuleId 재사용 16번째 도메인 PoC (Insurance 다음 산업, 5번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (HC-001 ~ HC-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| HC-001 | 환자 등록 시 | `MIN_PATIENT_AGE ≤ patientAge ≤ MAX_PATIENT_AGE` (0~130) | `patients` INSERT (status='active') | `E422-AGE-MIN` (음수) 또는 `E422-AGE-MAX` (초과) |
| HC-002 | 처방 일일 한도 검증 | `patient.status='active'` AND `MAX_DAILY_DOSAGE_MG - activeDosage ≥ requestedDosageMg` | `canPrescribe=true`, remainingHeadroom 반환 | `E404-PT`, `E409-ST` (비활성), `E422-LIMIT` (한도 초과) |
| HC-003 | 예약 잡기 | slot status='available' | atomic transaction (`appointments` INSERT status='booked' + `slots` UPDATE status='reserved') | `E404-SL`, `E409-SL` |
| HC-004 | 예약 상태 전환 (booked → checked_in/cancelled/no_show, checked_in → completed/cancelled) | 허용 매트릭스 충족 | `appointments.status` UPDATE + cancelled_at 조건부 | `E409-TR` |
| HC-005 | 약제 만료 자동 처리 (정기 batch) | `status='active'` AND `expires_at < now` | `status='expired'`, 마킹된 prescriptionIds 반환 | 만료 안 됐을 시 제외 |
| HC-006 | 예약 취소 + 환불 처리 | `status ∈ {booked, checked_in}` | atomic transaction (`status='cancelled'` + `slots` 해제. 24시간 이전 시 100% 환불, 미만 시 0원) | `E404-AP`, `E409-AP` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `patients` | INSERT (HC-001) | registerPatient |
| `prescriptions` | (외부 prescribe) / status 전환 expired (HC-005) | markExpiredPrescriptions |
| `appointments` | INSERT (HC-003) / status 전환 (HC-004/006) | bookAppointment / transitionAppointmentStatus / cancelAppointmentWithRefund |
| `slots` | reserved (HC-003) / available (HC-006) | bookAppointment / cancelAppointmentWithRefund |

---

## 임계값 / 상수

- `MIN_PATIENT_AGE = 0` (HC-001 최소 연령)
- `MAX_PATIENT_AGE = 130` (HC-001 최대 연령)
- `MAX_DAILY_DOSAGE_MG = 5,000` (HC-002 일일 dosage 안전 한도)
- `PRESCRIPTION_VALIDITY_DAYS = 30` (처방 유효 기간, HC-005 입력)
- `REFUND_HOURS_BEFORE = 24` (HC-006 환불 가능 시간)

---

## 상태 머신

```
patient: [registerPatient] → active
patient: active → inactive / deceased (외부)

appointment: [bookAppointment] → booked
appointment: booked → checked_in (HC-004)
appointment: booked → cancelled (HC-004 또는 HC-006)
appointment: booked → no_show (HC-004)
appointment: checked_in → completed (HC-004)
appointment: checked_in → cancelled (HC-004 또는 HC-006)

prescription: active → expired (HC-005, batch)
prescription: active → dispensed (외부)
```

---

## 권한

- **registerPatient**: 본인 또는 ADMIN
- **checkDosageLimit**: 의사 (`doctor` role)
- **bookAppointment**: 본인 또는 ADMIN
- **transitionAppointmentStatus**: 의료진 또는 시스템
- **markExpiredPrescriptions**: SYSTEM (정기 batch)
- **cancelAppointmentWithRefund**: 본인 또는 ADMIN

---

## 관련 문서

- `rules/HC-001.md` ~ `rules/HC-006.md` — 개별 BL detail
- `runbooks/HC-001.md` ~ `runbooks/HC-006.md` — operational runbooks
- `tests/HC-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/healthcare.ts` — 합성 source
