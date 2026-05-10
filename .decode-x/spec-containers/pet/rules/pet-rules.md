# Spec Container — PET-001 (반려동물 서비스 합성 도메인)

**Skill ID**: PET-001
**Domain**: Pet Services (반려동물 산업 — 정원한도/백신한도/그루밍atomic/케어상태전환/건강기록배치/응급atomic)
**Source**: SYNTHETIC — Sprint 310 F476, withRuleId 재사용 40번째 도메인 PoC (Wellness 다음 산업, 29번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (PT-001 ~ PT-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| PT-001 | 펫호텔 예약 요청 시 | `facility.booked_count < capacity` (UPPERCASE fallback MAX_BOARDING_CAPACITY) | 예약 허용 + boardings INSERT | `E422-BOARDING-CAPACITY-EXCEEDED` (정원 초과) |
| PT-002 | 백신 접종 요청 시 | `vaccine.administered_count < vaccinationLimit` (var-vs-var, `limit` keyword 매칭) | 접종 허용 + administered_count 증가 | `E422-VACCINATION-QUOTA-EXCEEDED` (백신 한도 초과) |
| PT-003 | 그루밍 예약 확정 요청 시 | `groomings.status = 'booked'` | atomic: groomings UPDATE + grooming_payments INSERT + grooming_owner_matches INSERT + groomers UPDATE | `E404-GROOMING` |
| PT-004 | 케어 상태 전환 (booked → checked_in → in_care → checked_out → reviewed) | 허용 매트릭스 충족 | `care_records.status` UPDATE | `E404-CARE-RECORD`, `E409-CARE-RECORD` |
| PT-005 | 건강 기록 일괄 처리 | `health_records.visit_date <= visitBefore` AND `health_records.status = 'pending'` | `status='processed'` 일괄 UPDATE | 대상 없으면 markedCount=0 |
| PT-006 | 응급 처치 요청 시 | 반려동물 존재 확인 | atomic: emergencies INSERT + emergency_treatments INSERT + owner_notifications INSERT + pets UPDATE | `E404-PET` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `boardings` | INSERT (PT-001) | bookBoarding |
| `boarding_facilities` | booked_count 증가 (PT-001) | bookBoarding |
| `vaccines` | administered_count 증가 (PT-002) | applyVaccination |
| `groomings` | status 갱신 (PT-003/004/005/006) | processGrooming / transitionCareStatus |
| `grooming_payments` | INSERT (PT-003) | processGrooming |
| `grooming_owner_matches` | INSERT (PT-003) | processGrooming |
| `groomers` | status='booked' (PT-003) | processGrooming |
| `care_records` | status 갱신 (PT-004) | transitionCareStatus |
| `health_records` | status='processed' (PT-005) | markHealthRecordBatch |
| `emergencies` | INSERT (PT-006) | processEmergency |
| `emergency_treatments` | INSERT (PT-006) | processEmergency |
| `owner_notifications` | INSERT (PT-006) | processEmergency |
| `pets` | last_emergency_at 갱신 (PT-006) | processEmergency |

---

## 임계값 / 상수

- `MAX_BOARDING_CAPACITY = 30` (PT-001 펫호텔 정원 기본 한도, 마리)
- `vaccinationLimit = vaccines.vaccinationLimit` (PT-002 백신별 접종 한도)

---

## 상태 머신

```
care_records: booked → checked_in (PT-004 transition)
care_records: checked_in → in_care (PT-004 transition)
care_records: in_care → checked_out (PT-004 transition)
care_records: checked_out → reviewed (PT-004 transition)

health_records: pending → processed (PT-005 batch)

emergencies: * → treating (PT-006 atomic)
groomings: booked → confirmed (PT-003 atomic)
groomers: available → booked (PT-003 atomic)
```

---

## 권한

- **bookBoarding**: 예약 SYSTEM / 보호자 본인
- **applyVaccination**: 접종관리 SYSTEM (수의사)
- **processGrooming**: 그루밍관리 SYSTEM (결제 연동)
- **transitionCareStatus**: 케어관리 SYSTEM / 담당 직원
- **markHealthRecordBatch**: 건강기록관리 SYSTEM (배치)
- **processEmergency**: 응급처리 SYSTEM (수의사 + 알림)

---

## 관련 문서

- `rules/PT-001.md` ~ `rules/PT-006.md` — 개별 BL detail
- `runbooks/PT-001.md` ~ `runbooks/PT-006.md` — operational runbooks
- `tests/PT-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/pet.ts` — 합성 source
