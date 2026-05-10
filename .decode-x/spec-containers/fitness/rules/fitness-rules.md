# Spec Container — FITNESS-001 (피트니스 합성 도메인)

**Skill ID**: FITNESS-001
**Domain**: Fitness (피트니스 산업 — 정원한도/PT세션한도/PT예약atomic/진행상태전환/노쇼배치/기구예약atomic)
**Source**: SYNTHETIC — Sprint 312 F478, withRuleId 재사용 42번째 도메인 PoC (Property Mgmt 다음 산업, 31번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (FT-001 ~ FT-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| FT-001 | 클래스 예약 요청 시 | `cls.booked_count < capacity` (UPPERCASE fallback MAX_CLASS_CAPACITY) | 예약 허용 + class_bookings INSERT | `E422-CLASS-CAPACITY-EXCEEDED` (정원 초과) |
| FT-002 | PT 세션 사용 요청 시 | `membership.pt_sessions_used < ptSessionLimit` (var-vs-var, `limit` keyword 매칭) | PT 세션 허용 + pt_sessions_used 증가 | `E422-PT-SESSION-LIMIT-EXCEEDED` (PT 세션 한도 초과) |
| FT-003 | PT 예약 요청 시 | `trainer_slots.status = 'available'` | atomic: pt_bookings INSERT + trainer_slots UPDATE + pt_payments INSERT | `E404-SLOT` |
| FT-004 | 진행 상태 전환 (initial → in_progress → assessment → completed) | 허용 매트릭스 충족 | `member_progress.status` UPDATE + 타임스탬프 기록 | `E404-PROGRESS`, `E409-PROGRESS` |
| FT-005 | 노쇼 클래스 예약 일괄 처리 | `fitness_classes.scheduled_at <= scheduledBefore` AND `class_bookings.status = 'booked'` | `status='no_show'` 일괄 UPDATE | 대상 없으면 markedCount=0 |
| FT-006 | 기구 예약 요청 시 | `equipment.status = 'available'` | atomic: equipment_reservations INSERT + equipment_holds INSERT + equipment UPDATE | `E404-EQUIPMENT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `class_bookings` | INSERT (FT-001), status 갱신 (FT-005) | bookClassSlot / markNoShowBatch |
| `fitness_classes` | booked_count 증가 (FT-001) | bookClassSlot |
| `memberships` | pt_sessions_used 증가 (FT-002) | usePtSession |
| `pt_bookings` | INSERT (FT-003) | bookPersonalTraining |
| `trainer_slots` | status='booked' (FT-003) | bookPersonalTraining |
| `pt_payments` | INSERT (FT-003) | bookPersonalTraining |
| `member_progress` | status 갱신 + 타임스탬프 (FT-004) | transitionProgressStatus |
| `equipment_reservations` | INSERT (FT-006) | reserveEquipment |
| `equipment_holds` | INSERT (FT-006) | reserveEquipment |
| `equipment` | status='reserved' + daily_usage_count 증가 (FT-006) | reserveEquipment |

---

## 임계값 / 상수

- `MAX_CLASS_CAPACITY = 25` (FT-001 클래스 정원 기본 한도, 인원)
- `ptSessionLimit = memberships.pt_session_limit` (FT-002 멤버십별 PT 세션 한도)

---

## 상태 머신

```
class_bookings: booked → no_show (FT-005 batch)
class_bookings: booked → confirmed → attended (운영 전환)
class_bookings: * → cancelled (운영 취소)

member_progress: initial → in_progress (FT-004 transition)
member_progress: in_progress → assessment (FT-004 transition)
member_progress: assessment → completed (FT-004 transition)

equipment: available → reserved (FT-006 atomic)
trainer_slots: available → booked (FT-003 atomic)
```

---

## 권한

- **bookClassSlot**: 예약 SYSTEM / 회원 본인
- **usePtSession**: PT관리 SYSTEM
- **bookPersonalTraining**: 예약 SYSTEM (결제 연동)
- **transitionProgressStatus**: 트레이너 / 진행관리 SYSTEM
- **markNoShowBatch**: 노쇼처리 SYSTEM (배치)
- **reserveEquipment**: 기구관리 SYSTEM / 회원 본인

---

## 관련 문서

- `rules/FT-001.md` ~ `rules/FT-006.md` — 개별 BL detail
- `runbooks/FT-001.md` ~ `runbooks/FT-006.md` — operational runbooks
- `tests/FT-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/fitness.ts` — 합성 source
