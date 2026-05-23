# Design: F563 BL Billiards — 94번째 도메인

## §1 개요

BL Billiards (당구장) 합성 도메인. Rule prefix: **BI** (BIlliards).

**주의**: SPEC의 "BL-001~006" 표기는 "BL" = lpon reserved 충돌로 "BI-001~006"으로 구현.

---

## §2 BI-001~006 비즈니스 룰 매트릭스

| ID | Rule | Type | Detector | Function |
|----|------|------|----------|----------|
| BI-001 | 동시 active table 한도 | Threshold (Path A) | detectThresholdCheck | reserveTable |
| BI-002 | 일일 hour 한도 (var-vs-var, hourLimit) | Threshold (Path B) | detectThresholdCheck | applyHourLimit |
| BI-003 | table 예약 atomic | AtomicTransaction | detectAtomicTransaction | processTableBooking |
| BI-004 | session 상태 전환 | StatusTransition | detectStatusTransition | transitionSessionStatus |
| BI-005 | ended session batch expire | StatusTransition (batch) | detectStatusTransition | expireEndedSessionBatch |
| BI-006 | session 환불 atomic (cue 파손 변상) | AtomicTransaction | detectAtomicTransaction | processSessionRefund |

---

## §3 합성 스키마

```
billiard_halls: id, name, max_concurrent_tables, active_tables, status
memberships: id, member_id, hall_id, membership_type, hour_limit, daily_used, status
billiards_sessions: id, hall_id, membership_id, table_id, schedule_id, payment_id, status, reserved_at
table_schedules: id, hall_id, session_id, table_number, party_size, start_time, end_time, status
session_payments: id, session_id, schedule_id, amount, status, paid_at
cue_inventory: id, hall_id, session_id, cue_count, damage_count, recorded_at
cancelled_session_records: id, member_id, session_id, session_cost, cue_damage_fee, cancellation_rate, cancellation_amount, status
session_refunds: id, fee_record_id, member_id, amount, status, refunded_at
```

---

## §4 상태 전환 매트릭스 (BI-004)

```
reserved → started (table 점유 시작)
started  → playing (게임 시작)
playing  → ended (정상 종료)
playing  → abandoned (이탈 처리)
reserved/started/playing → cancelled (취소)
```

---

## §5 파일 매핑

| 파일 | 변경 | 내용 |
|------|------|------|
| `반제품-스펙/.../domain/billiards.ts` | CREATE | 305 lines, 6 함수 + BilliardsError |
| `.decode-x/spec-containers/billiards/provenance.yaml` | CREATE | provenance |
| `.decode-x/spec-containers/billiards/rules/billiards-rules.md` | CREATE | BI-001~006 markdown table |
| `.decode-x/spec-containers/billiards/tests/BI-001.yaml` | CREATE | ThresholdCheck 시나리오 |
| `scripts/divergence/domain-source-map.ts` | MODIFY | 94번째 entry 추가 |
| `packages/utils/src/divergence/rules-parser.ts` | MODIFY | BI prefix 추가 (line 98) |
| `packages/utils/src/divergence/bl-detector.ts` | MODIFY | BI-001~006 등록 |
| `packages/utils/test/bl-detector.test.ts` | MODIFY | 428→434, sorted keys, tests |
