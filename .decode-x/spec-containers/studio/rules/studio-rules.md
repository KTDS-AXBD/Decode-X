# Spec Container — STUDIO-001 (스튜디오 합성 도메인)

**Skill ID**: STUDIO-001
**Domain**: Studio (다용도 스튜디오 산업 — 동시슬롯한도/장비한도/슬롯예약atomic/슬롯상태전환/closed슬롯일괄만료/슬롯환불atomic)
**Source**: SYNTHETIC — 세션 386 F558, withRuleId 재사용 89번째 도메인 PoC (Night Club 다음 산업, 78번째 신규) 🎬 단일 클러스터 20 도메인 round 마일스톤 신기록 + 16 Sprint 연속 첫 사례 마일스톤 신기록
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (ST-001 ~ ST-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| ST-001 | 신규 studio slot 예약 요청 시 | `studios.active_slots < max_concurrent_slots` (UPPERCASE fallback MAX_CONCURRENT_SLOTS_PER_STUDIO) | 슬롯 예약 허용 + studios.active_slots 증가 | `E422-STUDIO-SLOT-LIMIT-EXCEEDED` |
| ST-002 | 회원 장비 예약 요청 시 | `membership.daily_used + equipment < equipmentLimit` (var-vs-var, `limit` keyword) | 장비 한도 적용 + daily_used 증가 | `E422-EQUIPMENT-LIMIT-EXCEEDED` |
| ST-003 | 슬롯 예약 atomic 요청 시 | `studio_slots.status = 'reserved'` | atomic: equipment_schedules INSERT + studio_slots UPDATE + slot_payments INSERT | `E404-SLOT` |
| ST-004 | slot 상태 전환 (reserved → ongoing → ended / closed / cancelled) | 허용 매트릭스 충족 | `studio_slots.status` UPDATE | `E404-SLOT`, `E409-SLOT` |
| ST-005 | closed slot 일괄 만료 처리 | `studio_slots.status = 'closed'` AND `reserved_at <= now` | `status='ended'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| ST-006 | slot 환불 atomic 요청 시 | `studio_slots.status = 'cancelled'` | atomic: cancelled_fee_records INSERT + slot_refunds INSERT + cancelled_fee_records UPDATE (패키지 환불 정책) | `E404-CANCELLED-SLOT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `studios` | active_slots 증가 (ST-001) | reserveSlot |
| `studio_slots` | INSERT (ST-001), status 갱신 (ST-003/ST-004/ST-005) | reserveSlot / processSlotBooking / transitionSlotStatus / expireClosedSlotBatch |
| `memberships` | daily_used 증가 (ST-002) | applyEquipmentLimit |
| `equipment_schedules` | INSERT (ST-003) | processSlotBooking |
| `slot_payments` | INSERT (ST-003) | processSlotBooking |
| `cancelled_fee_records` | INSERT + status='refunded' (ST-006) | processSlotRefund |
| `slot_refunds` | INSERT (ST-006) | processSlotRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_SLOTS_PER_STUDIO = 20` (ST-001 스튜디오별 동시 active slot 기본 한도 — 소형 전문 스튜디오 기반)
- 장비 한도: basic=2, professional=5, enterprise=10 (멤버십 등급별 일일 장비 예약 가능 수)
- 환불 정책: basic=50% 취소 수수료, professional=25%, enterprise=10% (ST-006, 패키지 비용 기준)
- 이용 시간: 시간제 1~8시간 패키지 (음악녹음 2h/4h, 사진촬영 2h/4h, 댄스연습 1h/2h, 동영상촬영 4h/8h)
