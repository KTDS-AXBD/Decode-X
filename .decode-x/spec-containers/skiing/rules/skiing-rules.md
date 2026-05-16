# Spec Container — SKI-001 (스키 리조트 합성 도메인)

**Skill ID**: SKI-001
**Domain**: Skiing (스키 리조트 산업 — 리조트pass한도/skierdailyride한도/탑승batchatomic/pass상태전환/만료suspendedpass일괄/slope환불atomic)
**Source**: SYNTHETIC — 세션 306 후속4 F536, withRuleId 재사용 68번째 도메인 PoC (Theater 다음 산업, 57번째 신규) 🏆 68번째 도메인 마일스톤
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (SK-001 ~ SK-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| SK-001 | 신규 pass 예약 요청 시 | `resort.active_passes < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_ACTIVE_PASSES_PER_RESORT) | pass 예약 허용 + resort.active_passes 증가 | `E422-RESORT-CAPACITY-EXCEEDED` |
| SK-002 | 스키어 ride 요청 시 | `contract.ride_used + ride < dailyRideLimit` (var-vs-var, `limit` keyword) | ride 적용 + ride_used 증가 | `E422-DAILY-RIDE-LIMIT-EXCEEDED` |
| SK-003 | 리프트 탑승 atomic 요청 시 | `lift_schedules.status = 'reserved'` | atomic: passes INSERT + lift_schedules UPDATE + pass_payments INSERT | `E404-SCHEDULE` |
| SK-004 | pass 상태 전환 (reserved → boarded → updated → completed / suspended / cancelled) | 허용 매트릭스 충족 | `lift_schedules.status` UPDATE | `E404-SCHEDULE`, `E409-SCHEDULE` |
| SK-005 | suspended pass 일괄 만료 처리 | `passes.status = 'suspended'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| SK-006 | slope 환불 (suspended) atomic 요청 시 | `passes.status = 'suspended'` | atomic: pass_refund_records INSERT + pass_refunds INSERT + pass_refund_records UPDATE | `E404-SUSPENDED-PASS` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `resorts` | active_passes 증가 (SK-001) | reservePass |
| `lift_schedules` | INSERT (SK-001), status 갱신 (SK-003/SK-004) | reservePass / processLiftBoarding / transitionPassStatus |
| `skier_contracts` | ride_used 증가 (SK-002) | applyRideLimit |
| `passes` | INSERT (SK-003), batch expire (SK-005) | processLiftBoarding / expireSuspendedPassBatch |
| `pass_payments` | INSERT (SK-003) | processLiftBoarding |
| `pass_refund_records` | INSERT + status='refunded' (SK-006) | processSlopeRefund |
| `pass_refunds` | INSERT (SK-006) | processSlopeRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_ACTIVE_PASSES_PER_RESORT = 8000` (SK-001 리조트별 동시 active pass 기본 한도, 대형 스키 리조트 동시 이용 가능 인원)
- `dailyRideLimit = skier_contracts.ride_limit` (SK-002 스키어 등급별 일일 ride 한도, 시즌권자 정책 연계)

---

## 상태 머신

```
lift_schedules: reserved → boarded (SK-003 atomic)
lift_schedules: boarded ↔ updated (SK-004 transition, 슬로프 변경)
lift_schedules: boarded|updated → completed (SK-004 transition, 정상 이용 종료)
lift_schedules: reserved|boarded → suspended (SK-004 transition, 기상악화/슬로프 폐쇄)
lift_schedules: reserved|boarded → cancelled (SK-004 transition)

passes: boarded → updated → completed (정상 종료)
passes: suspended → expired (SK-005 batch — 데이터 보관 기간 만료)
passes: boarded → suspended (기상악화/슬로프 긴급 폐쇄, SK-006 slope 환불 대상)

pass_refund_records: pending → calculated → refunded (SK-006 atomic)
```

---

## 의존 함수 (skiing.ts)

| BL | 함수 | detector |
|----|------|----------|
| SK-001 | `reservePass` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| SK-002 | `applyRideLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| SK-003 | `processLiftBoarding` | AtomicTransaction (`db.transaction(...)`) |
| SK-004 | `transitionPassStatus` | StatusTransition (matrix) |
| SK-005 | `expireSuspendedPassBatch` | StatusTransition (batch) |
| SK-006 | `processSlopeRefund` | AtomicTransaction (`db.transaction(...)`) |
