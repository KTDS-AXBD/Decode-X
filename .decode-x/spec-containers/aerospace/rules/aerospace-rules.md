# Spec Container — ASP-001 (항공우주 합성 도메인)

**Skill ID**: ASP-001
**Domain**: Aerospace (항공우주 산업 — 발사대정원/궤도수수료한도/미션atomic/미션상태전환/위성퇴역배치/abort환불atomic)
**Source**: SYNTHETIC — 세션 299 F506, withRuleId 재사용 50번째 도메인 PoC (Fast Food 다음 산업, 39번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (AS-001 ~ AS-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| AS-001 | 신규 발사 일정 요청 시 | `pad.active_launches < total_capacity` (UPPERCASE fallback MAX_DAILY_LAUNCHES_PER_PAD) | 발사 허용 + pad.active_launches 증가 | `E422-LAUNCH-PAD-CAPACITY-EXCEEDED` (발사대 일일 정원 초과) |
| AS-002 | 궤도 수수료 사용 요청 시 | `orbit.fee_used + fee < orbitFeeLimit` (var-vs-var, `limit` keyword 매칭) | 수수료 적용 + fee_used 증가 | `E422-ORBIT-FEE-LIMIT-EXCEEDED` (궤도 수수료 한도 초과) |
| AS-003 | 미션 실행 atomic 요청 시 | `missions.status = 'confirmed'` | atomic: payloads INSERT + missions UPDATE + mission_payments INSERT | `E404-MISSION` |
| AS-004 | 미션 상태 전환 (pending → confirmed → launching → inOrbit → aborted) | 허용 매트릭스 충족 | `missions.status` UPDATE | `E404-MISSION`, `E409-MISSION` |
| AS-005 | inOrbit 위성 일괄 퇴역 처리 | `payloads.status = 'inOrbit'` AND `deployed_at <= now` | `status='retired'` 일괄 UPDATE | 대상 없으면 retiredCount=0 |
| AS-006 | 미션 abort 환불 atomic 요청 시 | `payloads.status = 'launching'` | atomic: abort_refund_records INSERT + abort_refunds INSERT + abort_refund_records UPDATE | `E404-LAUNCHING-PAYLOAD` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `launch_pad_pool` | active_launches 증가 (AS-001) | scheduleLaunch |
| `missions` | INSERT (AS-001), status 갱신 (AS-003/AS-004) | scheduleLaunch / executeMission / transitionMissionStatus |
| `contractor_orbits` | fee_used 증가 (AS-002) | applyOrbitFeeTier |
| `payloads` | INSERT (AS-003), batch retire (AS-005) | executeMission / retireSatelliteBatch |
| `mission_payments` | INSERT (AS-003) | executeMission |
| `abort_refund_records` | INSERT + status='refunded' (AS-006) | processAbortRefund |
| `abort_refunds` | INSERT (AS-006) | processAbortRefund |

---

## 임계값 / 상수

- `MAX_DAILY_LAUNCHES_PER_PAD = 24` (AS-001 발사대 일일 발사 정원 기본 한도, 건)
- `orbitFeeLimit = contractor_orbits.fee_limit` (AS-002 계약자 등급별 궤도 수수료 한도, 원)

---

## 상태 머신

```
missions: pending → confirmed (AS-004 transition)
missions: confirmed → launching (AS-003 atomic)
missions: launching → inOrbit (AS-004 transition)
missions: pending|confirmed → aborted (AS-004 transition)

payloads: launching → inOrbit (정상 궤도 진입)
payloads: inOrbit → retired (AS-005 batch)

abort_refund_records: pending → calculated → refunded (AS-006 atomic)
```

---

## 의존 함수 (aerospace.ts)

| BL | 함수 | detector |
|----|------|----------|
| AS-001 | `scheduleLaunch` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| AS-002 | `applyOrbitFeeTier` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| AS-003 | `executeMission` | AtomicTransaction (`db.transaction(...)`) |
| AS-004 | `transitionMissionStatus` | StatusTransition (matrix) |
| AS-005 | `retireSatelliteBatch` | StatusTransition (batch) |
| AS-006 | `processAbortRefund` | AtomicTransaction (`db.transaction(...)`) |
