---
id: AIF-DSGN-231
title: Sprint 380 Design — F552 CV Convention 83번째 도메인
type: design
status: active
created: "2026-05-19"
updated: "2026-05-19"
author: autopilot
sprint: 380
feature: F552
related:
  - AIF-PLAN-231 (Sprint 380 Plan)
  - AIF-PLAN-230 (Sprint 379 PL Planetarium 선례)
---

# Sprint 380 Design — F552 CV Convention 83번째 도메인

**Sprint**: 380  
**F-item**: F552  
**Domain**: CV Convention (회의/전시장 산업, 72번째 신규 산업)  
**Pattern**: 거울 변환 36회차 — planetarium.ts → convention.ts  
**Milestone**: ✏️ 단일 클러스터 14 도메인 첫 사례 + 10 Sprint 연속 첫 사례 마일스톤 신기록 도전

---

## §1 개요

CV Convention 도메인을 오프라인 엔터 클러스터(AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+**CV**)에 추가.  
PL Planetarium 거울 변환 36회차 — 6함수 패턴 (reserveSession/applyBoothLimit/processBoothBooking/transitionSessionStatus/expireClosedSessionBatch/processSessionRefund) + 3 detector 쌍 (Threshold×2 + Atomic×2 + Status×2).

---

## §2 도메인 차별성

| 항목 | PL (천문관) | MS (박물관) | EX (박람회) | CV (컨벤션) |
|------|------------|------------|------------|------------|
| 핵심 활동 | 돔 영상 시뮬레이션 | 정적 전시 관람 | 단기 박람회 | 다중 트랙 회의/컨벤션 |
| 공간 구조 | 돔 상영관 | 전시홀 | 부스 배치 | 컨벤션홀 + 부스 |
| 등록 방식 | 세션 예약 | 입장권 | 부스 임대 | 세션 + 부스 복합 등록 |
| 동시 한도 | 300 (돔 좌석) | 500 | 400 | 200 (세션별 동시 진행 한도) |
| 핵심 차별 | dome/screening | exhibit/gallery | booth/exhibitor | session/booth/concurrent |

---

## §3 비즈니스 룰

| ID | 함수 | detector | 설명 |
|----|------|----------|------|
| CV-001 | `reserveSession` | ThresholdCheck Path A (UPPERCASE) | 컨벤션별 동시 active session 한도 (MAX_CONCURRENT_SESSIONS_PER_CONVENTION) |
| CV-002 | `applyBoothLimit` | ThresholdCheck Path B (var-vs-var, boothLimit) | 회원 일일 booth 예약 한도 비교 |
| CV-003 | `processBoothBooking` | AtomicTransaction | booth 등록 atomic: convention_sessions + booth_schedules + session_payments |
| CV-004 | `transitionSessionStatus` | StatusTransition | session 상태 전환 (reserved → ongoing → ended / closed / cancelled) |
| CV-005 | `expireClosedSessionBatch` | StatusTransition (batch) | closed session 일괄 만료 처리 |
| CV-006 | `processSessionRefund` | AtomicTransaction | session 환불 atomic: cancelled_fee_records + session_refunds |

---

## §4 구현 파일 목록

### 신규 생성
1. `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/convention.ts` — 305+ lines
2. `.decode-x/spec-containers/convention/provenance.yaml`
3. `.decode-x/spec-containers/convention/rules/convention-rules.md`
4. `.decode-x/spec-containers/convention/tests/CV-001.yaml`

### 수정
5. `scripts/divergence/domain-source-map.ts` — DOMAIN_MAP 83번째 entry (convention) 추가
6. `packages/utils/src/divergence/rules-parser.ts` — BL_ID_PATTERN CV prefix 추가 (79→80)
7. `packages/utils/src/divergence/bl-detector.ts` — CV-001~006 registry 추가 (withRuleId×6)
8. `packages/utils/test/bl-detector.test.ts` — 5축 테스트 보강 (+7 tests, 681→688 PASS)

---

## §5 테이블 스키마 (합성)

```
conventions (id, name, max_concurrent_sessions, active_sessions, status)
convention_memberships (id, member_id, convention_id, membership_type, booth_limit, booth_used, status, expires_at)
convention_sessions (id, convention_id, membership_id, booth_id, payment_id, status, scheduled_at)
booth_schedules (id, convention_id, session_id, booth_no, session_type, status, started_at)
session_payments (id, session_id, booth_id, amount, status, paid_at)
cancelled_fee_records (id, member_id, session_id, session_cost, cancellation_rate, cancellation_amount, status)
session_refunds (id, fee_record_id, member_id, amount, status, refunded_at)
```

---

## §6 상태 머신

```
convention_sessions: reserved → ongoing (CV-003 atomic)
convention_sessions: ongoing → ended (CV-004)
convention_sessions: ongoing → closed (CV-004)
convention_sessions: reserved | ongoing → cancelled (CV-004)
convention_sessions: closed → ended (CV-005 batch)
cancelled_fee_records: pending → calculated → refunded (CV-006 atomic)
```

---

## §7 DoD 검증 기준 (13/13)

1. convention.ts 305+ lines + 6함수 + ConventionError
2. spec-container 3 files
3. DOMAIN_MAP 83번째 entry (6축 (f) CI Guard 외부 검증)
4. parser CV prefix (79→80)
5. REGISTRY CV-001~006 (withRuleId×6)
6. utils test 5축 보강
7. pnpm test 681→688 PASS
8. tsc --noEmit PASS
9. detect-bl 494→500/500 = 100.0%
10. Match ≥ 95%
11. PR + CI 3/3 green + domain-sprint-guard PASS
12. auto-merge
13. git show HEAD --stat | grep domain-source-map.ts PASS
