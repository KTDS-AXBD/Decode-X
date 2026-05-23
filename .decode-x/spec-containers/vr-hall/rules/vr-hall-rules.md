# Spec Container — VRHALL-001 (VR 체험관 합성 도메인)

**Skill ID**: VRHALL-001
**Domain**: VR Experience hall (VR 체험관 산업 — pod동시한도/session한도/pod예약atomic/session상태전환/ended일괄만료/session환불atomic)
**Source**: SYNTHETIC — 세션 395 F567, withRuleId 재사용 98번째 도메인 PoC (DJ Academy 다음 산업, 87번째 신규) 🥽 단일 클러스터 29 도메인 첫 사례 마일스톤 신기록 도전 + 25 Sprint 연속 첫 사례 마일스톤 신기록 도전
**Rule prefix**: VR (VR experience hall)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (VR-001 ~ VR-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| VR-001 | 신규 VR session 예약 요청 시 | `vr_halls.active_pods < max_concurrent_pods` (UPPERCASE fallback MAX_CONCURRENT_PODS_PER_HALL) | pod 예약 허용 + vr_halls.active_pods 증가 | `E422-POD-LIMIT-EXCEEDED` |
| VR-002 | 회원 VR session 이용 요청 시 | `membership.daily_sessions + sessions < sessionLimit` (var-vs-var, `sessionLimit` keyword) | session 한도 적용 + daily_sessions 증가 | `E422-SESSION-LIMIT-EXCEEDED` |
| VR-003 | pod 예약 atomic 요청 시 | `vr_sessions.status = 'reserved'` | atomic: pod_schedules INSERT + vr_sessions UPDATE + session_payments INSERT + headset_assignment INSERT | `E404-SESSION` |
| VR-004 | session 상태 전환 (reserved → started → playing → ended / discomfort_exit / cancelled) | 허용 매트릭스 충족 | `vr_sessions.status` UPDATE | `E404-SESSION`, `E409-SESSION` |
| VR-005 | ended session 일괄 만료 처리 | `vr_sessions.status = 'playing'` AND `reserved_at <= now` | `status='ended'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| VR-006 | session 환불 atomic (motion sickness 30s 이내 환불 + content 미공급 환불 정책) | `vr_sessions.status = 'cancelled'` | atomic: cancelled_session_records INSERT + session_refunds INSERT + cancelled_session_records UPDATE (motionSicknessFee 공제) | `E404-CANCELLED-SESSION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `vr_halls` | active_pods 증가 (VR-001) | reservePod |
| `vr_sessions` | INSERT (VR-001), status + pod/schedule/payment/headset 갱신 (VR-003/VR-004/VR-005) | reservePod / processPodBooking / transitionSessionStatus / expireEndedSessionBatch |
| `vr_memberships` | daily_sessions 증가 (VR-002) | applySessionLimit |
| `pod_schedules` | INSERT (VR-003) | processPodBooking |
| `session_payments` | INSERT (VR-003) | processPodBooking |
| `headset_assignment` | INSERT (VR-003) | processPodBooking |
| `cancelled_session_records` | INSERT + status='refunded' (VR-006) | processSessionRefund |
| `session_refunds` | INSERT (VR-006) | processSessionRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_PODS_PER_HALL = 16` (VR-001 hall별 동시 active pod 한도 — VR 체험관 16 pod 기준)
- session 한도: basic=2회/일, standard=4회/일, premium=8회/일, unlimited=무제한 (멤버십 등급별 일일 이용 횟수, VR-002)
- 헤드셋 종류: standalone / tethered / mixed_reality (종류별 가격 차등, VR-003)
- 환불 정책: motion sickness 30s 이내 종료 시 전액 환불 (motionSicknessFee=0) + content 미공급 시 전액 환불 (VR-006)
- session 시간: 30분 / 60분 / 90분 (content 유형별 차등)
- session 상태: reserved(예약) → started(시작) → playing(체험 중) → ended(완료) / discomfort_exit(불편 조기 종료) / cancelled(취소)
- 헤드셋 위생: reserved→started 전환 시 hygiene_status='checked' 필수 (VR-003 headset_assignment)
- content rating: G / PG / PG-13 / R (연령 제한 콘텐츠 별도 관리)
- 그룹 이용: 최대 4인 동시 multiplayer (pod_schedules group_id 연동)
