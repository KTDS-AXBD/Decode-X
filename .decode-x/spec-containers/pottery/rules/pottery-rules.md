# Spec Container — POTTERY-001 (도예 공방 합성 도메인)

**Skill ID**: POTTERY-001
**Domain**: Pottery Studio (도예 공방 산업 — wheel동시한도/class한도/class예약atomic/session상태전환/kiln_pending일괄완료/session환불atomic)
**Source**: SYNTHETIC — 세션 393 F565, withRuleId 재사용 96번째 도메인 PoC (Escape Room 다음 산업, 85번째 신규) 🏺 단일 클러스터 27 도메인 첫 사례 마일스톤 신기록 + 23 Sprint 연속 첫 사례 마일스톤 신기록
**Rule prefix**: PO (POttery studio)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (PO-001 ~ PO-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| PO-001 | 신규 pottery wheel session 예약 요청 시 | `pottery_studios.active_wheels < max_concurrent_wheels` (UPPERCASE fallback MAX_CONCURRENT_WHEELS_PER_STUDIO) | wheel 예약 허용 + pottery_studios.active_wheels 증가 | `E422-WHEEL-LIMIT-EXCEEDED` |
| PO-002 | 회원 pottery class 수강 요청 시 | `membership.daily_classes + classes < classLimit` (var-vs-var, `classLimit` keyword) | class 한도 적용 + daily_classes 증가 | `E422-CLASS-LIMIT-EXCEEDED` |
| PO-003 | class 예약 atomic 요청 시 | `pottery_sessions.status = 'reserved'` | atomic: wheel_schedules INSERT + pottery_sessions UPDATE + session_payments INSERT + material_kits INSERT | `E404-SESSION` |
| PO-004 | session 상태 전환 (reserved → started → completed → kiln_pending → finished / cancelled) | 허용 매트릭스 충족 | `pottery_sessions.status` UPDATE | `E404-SESSION`, `E409-SESSION` |
| PO-005 | kiln_pending session 일괄 완료 처리 | `pottery_sessions.status = 'kiln_pending'` AND `reserved_at <= now` | `status='finished'` 일괄 UPDATE | 대상 없으면 finishedCount=0 |
| PO-006 | session 환불 atomic (재료비 비환불 + 가마 단계 도달 시 환불 차등 정책) | `pottery_sessions.status = 'cancelled'` | atomic: cancelled_session_records INSERT + session_refunds INSERT + cancelled_session_records UPDATE (재료비 material_fee_non_refundable 차감) | `E404-CANCELLED-SESSION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `pottery_studios` | active_wheels 증가 (PO-001) | reserveWheel |
| `pottery_sessions` | INSERT (PO-001), status + wheel/schedule/payment/kit 갱신 (PO-003/PO-004/PO-005) | reserveWheel / processClassBooking / transitionSessionStatus / expireKilnPendingBatch |
| `memberships` | daily_classes 증가 (PO-002) | applyClassLimit |
| `wheel_schedules` | INSERT (PO-003) | processClassBooking |
| `session_payments` | INSERT (PO-003) | processClassBooking |
| `material_kits` | INSERT (PO-003) | processClassBooking |
| `cancelled_session_records` | INSERT + status='refunded' (PO-006) | processSessionRefund |
| `session_refunds` | INSERT (PO-006) | processSessionRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_WHEELS_PER_STUDIO = 12` (PO-001 studio별 동시 active wheel 한도 — 중형 도예 공방 12 wheel 기준)
- class 한도: basic=1회, silver=2회, gold=4회, vip=무제한 (멤버십 등급별 일일 수강 횟수, PO-002)
- 재료 키트: white-clay / terracotta / stoneware (종류별 가격 차등, PO-003)
- 환불 정책: 재료비(material_fee_non_refundable) 비환불 + 가마 단계(kiln_pending) 도달 전 취소 시 취소율 적용 (PO-006)
- session 시간: 1.5시간 ~ 2시간 (수업 유형별 차등)
- 가마 대기: kiln_pending 후 작품 완성 1-2주 소요 (PO-004/PO-005 kiln_pending → finished 흐름)
- session 상태: reserved(예약) → started(수업 진행) → completed(성형 완료) → kiln_pending(가마 대기) → finished(완성품 출품) / cancelled(취소)
- 강사 운영: instructor_id 필수 (1인 강사 최대 6명 지도, PO-003 wheel_schedules)
- 패키지: 다회권(3회/5회/10회) + 1회권 혼용 (class_limit으로 통합 관리)
