# Sprint 389 Design — F561 BW Bowling

## §1 개요

볼링(Bowling) 산업 도메인 부트스트래핑. CA Casino 패턴 복제 기반.

**볼링 차별성**: lane 단위 시간제 + frame/game 단위 점수 + 신발·공 임대 + 리그/토너먼트 + 단체 그룹 예약 + 멤버십 등급제 (B2C 단체 가족/친구 1-2시간 게임 + frame 누적 점수 + 장비 임대 차별).

## §2 비즈니스 룰 (BW-001 ~ BW-006)

| ID | condition | criteria | outcome | exception |
|----|-----------|----------|---------|-----------|
| BW-001 | 신규 bowling session 예약 요청 시 | `bowling_centers.active_lanes < max_concurrent_lanes` (UPPERCASE fallback MAX_CONCURRENT_LANES_PER_CENTER) | lane 예약 허용 + active_lanes 증가 | `E422-CENTER-LANE-LIMIT-EXCEEDED` |
| BW-002 | 회원 game 요청 시 | `membership.daily_used + gameCount < gameLimit` (var-vs-var, `limit` keyword) | game 한도 적용 + daily_used 증가 | `E422-GAME-LIMIT-EXCEEDED` |
| BW-003 | lane 예약 atomic 요청 시 | `bowling_sessions.status = 'reserved'` | atomic: lane_schedules INSERT + bowling_sessions UPDATE + session_payments INSERT + frame_scores INSERT | `E404-SESSION` |
| BW-004 | session 상태 전환 (reserved → started → completed / closed / cancelled) | 허용 매트릭스 충족 | `bowling_sessions.status` UPDATE | `E404-SESSION`, `E409-SESSION` |
| BW-005 | closed session 일괄 만료 처리 | `bowling_sessions.status = 'closed'` AND `reserved_at <= now` | `status='completed'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| BW-006 | session 환불 atomic (리그/단체 환불 정책) | `bowling_sessions.status = 'cancelled'` | atomic: cancelled_fee_records INSERT + session_refunds INSERT + cancelled_fee_records UPDATE | `E404-CANCELLED-SESSION` |

## §3 스키마 (합성)

```
bowling_centers: id, name, max_concurrent_lanes, active_lanes, status
memberships: id, member_id, center_id, membership_type, game_limit, daily_used, status
bowling_sessions: id, center_id, membership_id, schedule_id, payment_id, status, reserved_at
lane_schedules: id, center_id, session_id, lane_number, game_count, shoe_size, start_time, end_time, status
session_payments: id, session_id, schedule_id, amount, status, paid_at
frame_scores: id, session_id, lane_number, frame_number, score, created_at
cancelled_fee_records: id, member_id, session_id, session_cost, cancellation_rate, cancellation_amount, status
session_refunds: id, fee_record_id, member_id, amount, status, refunded_at
```

## §4 함수 설계

| 함수 | 룰 | 패턴 |
|------|-----|------|
| `reserveLane` | BW-001 | ThresholdCheck (UPPERCASE) |
| `applyGameLimit` | BW-002 | ThresholdCheck (var-vs-var, gameLimit) |
| `processLaneBooking` | BW-003 | AtomicTransaction |
| `transitionSessionStatus` | BW-004 | StatusTransition |
| `expireClosedSessionBatch` | BW-005 | StatusTransition (batch) |
| `processSessionRefund` | BW-006 | AtomicTransaction |

## §5 파일 매핑

| 파일 | 작업 |
|------|------|
| `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/bowling.ts` | 신규 생성 (305 lines) |
| `.decode-x/spec-containers/bowling/provenance.yaml` | 신규 생성 |
| `.decode-x/spec-containers/bowling/rules/bowling-rules.md` | 신규 생성 (markdown table) |
| `.decode-x/spec-containers/bowling/tests/BW-001.yaml` | 신규 생성 |
| `scripts/divergence/domain-source-map.ts` | DOMAIN_MAP 92번째 entry 추가 |
| `packages/utils/src/divergence/rules-parser.ts` | BW prefix 추가 |
| `packages/utils/src/divergence/bl-detector.ts` | BW-001~006 REGISTRY 추가 |
| `packages/utils/test/bl-detector.test.ts` | utils test 5축 보강 |
