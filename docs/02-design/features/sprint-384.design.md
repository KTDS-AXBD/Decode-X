---
id: AIF-DSGN-235
title: Sprint 384 Design — F556 KR Karaoke 87번째 도메인
type: design
status: active
created: "2026-05-20"
updated: "2026-05-20"
author: autopilot
sprint: 384
feature: F556
related:
  - AIF-PLAN-235 (Sprint 384 Plan)
  - AIF-DSGN-234 (Sprint 383 CO Concert hall)
---

# Sprint 384 Design — F556 KR Karaoke 87번째 도메인

**Sprint**: 384  
**F-item**: F556  
**Domain**: KR Karaoke (노래방 산업, 76번째 신규 산업)  
**Session**: 세션 384 (Sprint WT autopilot 14회차)

---

## §1 도메인 개요

노래방(Karaoke) 산업 합성 도메인. **프라이빗 룸 + 시간제 + drinks/menu + 그룹 예약 + 점주별 운영** 모델.

CO 클래식 콘서트홀(시즌권 + 정기 공연) / KP K-pop(1회성 단일 콘서트) 인접하되:
- **B2C 짧은 1-3시간 룸 단위** + 음식료 옵션 + 시간 연장 차별
- 프라이빗 룸 슬롯 예약 + 멤버십 한도 + drinks/menu 환불 정책

🎤 **AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR 오프라인 엔터 18-클러스터**

---

## §2 비즈니스 룰 (KR-001 ~ KR-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| KR-001 | 노래방 room 예약 요청 시 | `karaokes.active_rooms < max_concurrent_rooms` (UPPERCASE fallback MAX_CONCURRENT_ROOMS_PER_KARAOKE) | 예약 허용 + active_rooms 증가 | `E422-KARAOKE-ROOM-LIMIT-EXCEEDED` |
| KR-002 | 회원 일일 membership 한도 확인 시 | `membership.daily_used + rooms < membershipLimit` (var-vs-var, `limit` keyword) | 한도 적용 + daily_used 증가 | `E422-MEMBERSHIP-LIMIT-EXCEEDED` |
| KR-003 | room 예약 atomic 요청 시 | `karaoke_sessions.status = 'reserved'` | atomic: room_schedules INSERT + karaoke_sessions UPDATE + session_payments INSERT | `E404-SESSION` |
| KR-004 | session 상태 전환 (reserved → ongoing → ended / closed / cancelled) | 허용 매트릭스 충족 | `karaoke_sessions.status` UPDATE | `E404-SESSION`, `E409-SESSION` |
| KR-005 | closed session 일괄 만료 처리 | `karaoke_sessions.status = 'closed'` AND `reserved_at <= now` | `status='ended'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| KR-006 | session 환불 atomic 요청 시 | `karaoke_sessions.status = 'cancelled'` | atomic: cancelled_fee_records INSERT + session_refunds INSERT + cancelled_fee_records UPDATE (drinks/menu 환불 정책) | `E404-CANCELLED-SESSION` |

---

## §3 스키마

```sql
-- 노래방별 동시 room 한도 관리
CREATE TABLE karaokes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  max_concurrent_rooms INTEGER NOT NULL DEFAULT 20,
  active_rooms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' -- active | closed | suspended
);

-- 회원 멤버십 한도
CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  karaoke_id TEXT NOT NULL,
  membership_type TEXT NOT NULL, -- basic | premium | vip
  membership_limit INTEGER NOT NULL,
  daily_used INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' -- active | paused | expired | cancelled
);

-- 노래방 세션 (room 예약 단위)
CREATE TABLE karaoke_sessions (
  id TEXT PRIMARY KEY,
  karaoke_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  schedule_id TEXT,
  payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'reserved', -- reserved | ongoing | ended | closed | cancelled
  reserved_at TEXT NOT NULL
);

-- room 일정 (시간대 슬롯)
CREATE TABLE room_schedules (
  id TEXT PRIMARY KEY,
  karaoke_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  room_number TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  group_size INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'confirmed' -- confirmed | ongoing | completed | cancelled | expired
);

-- 취소 수수료 기록
CREATE TABLE cancelled_fee_records (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  session_cost NUMBER NOT NULL,
  cancellation_rate NUMBER NOT NULL,
  cancellation_amount NUMBER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' -- pending | calculated | refunded
);
```

---

## §4 구현 파일 목록

### 신규
| 파일 | 설명 |
|------|------|
| `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/karaoke.ts` | 노래방 도메인 (305+ lines, KR-001~KR-006) |
| `.decode-x/spec-containers/karaoke/provenance.yaml` | 도메인 출처 메타 |
| `.decode-x/spec-containers/karaoke/rules/karaoke-rules.md` | BL markdown table |
| `.decode-x/spec-containers/karaoke/tests/KR-001.yaml` | 시나리오 테스트 |

### 수정
| 파일 | 변경 내용 |
|------|----------|
| `scripts/divergence/domain-source-map.ts` | DOMAIN_MAP 87번째 entry 추가 (karaoke) |
| `packages/utils/src/divergence/rules-parser.ts` | KR prefix BL_ID_PATTERN 추가 (83→84) |
| `packages/utils/src/divergence/bl-detector.ts` | KR-001~006 registry 추가 (withRuleId × 6) |
| `packages/utils/test/bl-detector.test.ts` | 5축 utils test 보강 |

---

## §5 함수 매핑

| 함수 | BL | detector |
|------|----|---------|
| `reserveRoom` | KR-001 | ThresholdCheck (Path A, UPPERCASE) |
| `applyMembershipLimit` | KR-002 | ThresholdCheck (Path B, var-vs-var) |
| `processRoomBooking` | KR-003 | AtomicTransaction |
| `transitionSessionStatus` | KR-004 | StatusTransition |
| `expireClosedSessionBatch` | KR-005 | StatusTransition (batch) |
| `processSessionRefund` | KR-006 | AtomicTransaction |

---

## §6 DoD Checklist

- [ ] karaoke.ts 305+ lines + KaraokeError code-in-message
- [ ] spec-container 3 files
- [ ] DOMAIN_MAP 87번째 entry (자체 + 6축(f) CI Guard 이중 검증)
- [ ] KR prefix BL_ID_PATTERN (83→84)
- [ ] KR-001~006 registry (withRuleId × 6)
- [ ] utils test 5축 (a) count 386→392 (b) sorted keys KR-001~006 (c) registered block (d) PRESENCE block (e) findDomainMapping
- [ ] `pnpm test --run` utils PASS (709→716 +7)
- [ ] `npx tsc --noEmit` PASS
- [ ] detect-bl 518→524/524 = 100.0%
- [ ] Match ≥ 95%
- [ ] PR + CI 3/3 green + domain-sprint-guard PASS
- [ ] `git show HEAD --stat | grep domain-source-map.ts` 자체 검증
