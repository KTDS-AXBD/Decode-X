---
id: AIF-DESIGN-395
title: Sprint 395 F567 — VR Experience hall Design
status: approved
sprint: 395
f_items: [F567]
created: "2026-05-23"
---

# Sprint 395 Design — F567 VR Experience hall

## §1 개요

VR Experience hall (VR 체험관) 합성 도메인 부트스트래핑.
Rule prefix: VR. 98번째 도메인, 87번째 신규 산업.

## §2 데이터 모델

### 테이블 구조
```
vr_halls          — id, name, max_concurrent_pods, active_pods, status
vr_memberships    — id, member_id, hall_id, membership_type, session_limit, daily_sessions, status
vr_sessions       — id, hall_id, membership_id, pod_id, schedule_id, payment_id, headset_id, status, reserved_at
pod_schedules     — id, hall_id, session_id, content_id, start_time, end_time, status
session_payments  — id, session_id, schedule_id, amount, status, paid_at
headset_assignment — id, hall_id, session_id, headset_id, headset_type, hygiene_status, assigned_at
cancelled_session_records — id, member_id, session_id, session_cost, refund_reason, refund_amount, status
session_refunds   — id, fee_record_id, member_id, amount, status, refunded_at
```

## §3 비즈니스 룰 매핑

| Rule | 함수 | Detector | 핵심 조건 |
|------|------|----------|---------|
| VR-001 | reservePod | ThresholdCheck (UPPERCASE) | `active_pods >= MAX_CONCURRENT_PODS_PER_HALL` |
| VR-002 | applySessionLimit | ThresholdCheck (var-vs-var) | `daily_sessions + sessions >= sessionLimit` |
| VR-003 | processPodBooking | AtomicTransaction | db.transaction() 4-table |
| VR-004 | transitionSessionStatus | StatusTransition | reserved→started→playing→ended/discomfort_exit/cancelled |
| VR-005 | expireEndedSessionBatch | StatusTransition (batch) | playing→ended (시간 초과 batch) |
| VR-006 | processSessionRefund | AtomicTransaction | db.transaction() 환불 atomic |

## §4 E2E 시나리오

1. VR-001: pod 한도 초과 시 E422-POD-LIMIT-EXCEEDED
2. VR-002: 일일 session 한도 초과 시 E422-SESSION-LIMIT-EXCEEDED
3. VR-003: atomic 예약 — 4 테이블 동시 insert/update
4. VR-004: 상태 전환 매트릭스 검증
5. VR-005: batch expire — playing → ended
6. VR-006: motion sickness 30s 환불 + content 미공급 환불

## §5 Worker 파일 매핑

단일 구현 (Agent 병렬 불필요):

| 파일 | 작업 내용 |
|------|---------|
| `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/vr-hall.ts` | 6 함수 + VrHallError 신규 생성 |
| `.decode-x/spec-containers/vr-hall/provenance.yaml` | 신규 생성 |
| `.decode-x/spec-containers/vr-hall/rules/vr-hall-rules.md` | 신규 생성 (table 형식 필수) |
| `.decode-x/spec-containers/vr-hall/tests/VR-001.yaml` | 신규 생성 |
| `scripts/divergence/domain-source-map.ts` | 98번째 entry 추가 |
| `packages/utils/src/divergence/bl-detector.ts` | VR-001~006 registry 추가 |
| `packages/utils/src/divergence/rules-parser.ts` | BL_ID_PATTERN VR prefix 추가 |
| `packages/utils/test/bl-detector.test.ts` | 5축 테스트 보강 (+7) |

## §6 주요 설계 결정

- MAX_CONCURRENT_PODS_PER_HALL = 16 (VR 체험관 표준 16 pod 기준)
- session_limit 멤버십 등급별: basic=2회/일, standard=4회/일, premium=8회/일, unlimited=무제한
- motion sickness 환불: 30초 이내 종료 시 전액 환불 (VR-006 motionSicknessRefund)
- content 미공급 환불: content_id 미배정 또는 license_expired 시 환불
- headset 위생 점검: reserved→started 전환 시 hygiene_status='checked' 필수
- VrHallError code-in-message 패턴 (S275 표준)
