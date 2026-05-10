# Spec Container — WELLNESS-001 (웰니스/스파 합성 도메인)

**Skill ID**: WELLNESS-001
**Domain**: Wellness (웰니스 산업 — 정원한도/패키지한도/예약atomic/예약상태전환/노쇼배치/취소환불atomic)
**Source**: SYNTHETIC — Sprint 309 F475, withRuleId 재사용 39번째 도메인 PoC (Charity 다음 산업, 28번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (WL-001 ~ WL-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| WL-001 | 세션 예약 요청 시 | `session.booked_count < capacity` (UPPERCASE fallback MAX_SESSION_CAPACITY) | 예약 허용 + appointments INSERT | `E422-SESSION-CAPACITY-EXCEEDED` (정원 초과) |
| WL-002 | 패키지 세션 사용 요청 시 | `pkg.used_count < packageUsageLimit` (var-vs-var, `limit` keyword 매칭) | 패키지 사용 허용 + used_count 증가 | `E422-PACKAGE-USAGE-EXCEEDED` (패키지 한도 초과) |
| WL-003 | 예약 확정 요청 시 | `appointments.status = 'booked'` | atomic: appointments UPDATE + appointment_payments INSERT + appointment_resources INSERT + resources UPDATE | `E404-APPOINTMENT` |
| WL-004 | 예약 상태 전환 (booked → confirmed → in_session → completed → reviewed) | 허용 매트릭스 충족 | `appointments.status` UPDATE | `E404-APPOINTMENT`, `E409-APPOINTMENT` |
| WL-005 | 노쇼 세션 일괄 처리 | `sessions.scheduled_date <= scheduledBefore` AND `appointments.status = 'confirmed'` | `status='no_show'` 일괄 UPDATE | 대상 없으면 markedCount=0 |
| WL-006 | 예약 취소 요청 시 | 예약 내역 존재 + 미취소 상태 | atomic: appointments UPDATE + cancellation_logs INSERT + refund_records INSERT + sessions.booked_count UPDATE | `E404-APPOINTMENT`, `E409-ALREADY-CANCELLED` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `appointments` | INSERT (WL-001), status 갱신 (WL-003/004/005/006) | bookSession / confirmAppointment / transitionAppointmentStatus / markNoShowSessions / processCancellationFee |
| `sessions` | booked_count 증감 (WL-001/006) | bookSession / processCancellationFee |
| `session_packages` | used_count 증가 (WL-002) | usePackageSession |
| `appointment_payments` | INSERT (WL-003) | confirmAppointment |
| `appointment_resources` | INSERT (WL-003) | confirmAppointment |
| `resources` | status='held' (WL-003) | confirmAppointment |
| `cancellation_logs` | INSERT (WL-006) | processCancellationFee |
| `refund_records` | INSERT (WL-006) | processCancellationFee |

---

## 임계값 / 상수

- `MAX_SESSION_CAPACITY = 20` (WL-001 세션 정원 기본 한도, 인원)
- `packageUsageLimit = session_packages.packageUsageLimit` (WL-002 패키지별 사용 한도)

---

## 상태 머신

```
appointments: booked → confirmed (WL-004 transition)
appointments: confirmed → in_session (WL-004 transition)
appointments: in_session → completed (WL-004 transition)
appointments: completed → reviewed (WL-004 transition)

appointments: confirmed → no_show (WL-005 batch)
appointments: * → cancelled (WL-006 atomic)

resources: available → held (WL-003 atomic)
```

---

## 권한

- **bookSession**: 예약 SYSTEM / 회원 본인
- **usePackageSession**: 패키지관리 SYSTEM
- **confirmAppointment**: 예약확정 SYSTEM (결제 연동)
- **transitionAppointmentStatus**: 세션관리 SYSTEM / 치료사
- **markNoShowSessions**: 노쇼처리 SYSTEM (배치)
- **processCancellationFee**: 취소관리 SYSTEM / 회원 본인

---

## 관련 문서

- `rules/WL-001.md` ~ `rules/WL-006.md` — 개별 BL detail
- `runbooks/WL-001.md` ~ `runbooks/WL-006.md` — operational runbooks
- `tests/WL-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/wellness.ts` — 합성 source
