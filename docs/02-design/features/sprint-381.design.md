---
id: AIF-DSGN-232
title: Sprint 381 Design — F553 WB Wedding hall 84번째 도메인
type: design
status: active
created: "2026-05-20"
updated: "2026-05-20"
author: master
sprint: 381
feature: F553
related:
  - AIF-PLAN-232 (Sprint 381 Plan)
  - AIF-DSGN-231 (Sprint 380 CV Convention Design)
---

# Sprint 381 Design — F553 WB Wedding hall 84번째 도메인

**Sprint**: 381 | **F-item**: F553 | **Domain**: WB Wedding hall (예식장 산업, 73번째 신규 산업)

---

## §1 배경

Sprint 381은 오프라인 엔터테인먼트 클러스터를 15개 도메인으로 확장한다 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+**WB**).
- **💒 단일 클러스터 15 도메인 첫 사례 마일스톤** (직전 14 CV Sprint 380)
- **11 Sprint 연속 첫 사례 마일스톤 신기록** (S370 5→S371 6→...→S380 14→S381 15)
- withRuleId 85 Sprint 정점 도전, 거울 변환 37회차
- **6축 (f) CI Guard 실감증 2회차** (S380 1회 입증 → S381 2회차 정착 검증)

WB 차별성: 단일 예식 + 시간대 슬롯 + 가족/하객 좌석 + 강한 계약금/위약금 (B2C 단일 1회성 이벤트). CV 컨벤션 다중 트랙 + KP 콘서트 좌석 등급 인접하되 wedding 특유 단일성과 계약 강도가 차별점.

---

## §2 비즈니스 룰 (WB-001~WB-006)

| ID | 함수 | detector | 설명 |
|----|------|----------|------|
| WB-001 | `reserveCeremony` | ThresholdCheck (Path A, UPPERCASE) | 예식장별 동시 active ceremony 한도 (MAX_CONCURRENT_CEREMONIES_PER_HALL) |
| WB-002 | `applyHallLimit` | ThresholdCheck (Path B, var-vs-var) | 회원 일일 hall 예약 한도 (hallLimit keyword) |
| WB-003 | `processCeremonyBooking` | AtomicTransaction | 예식 atomic — wedding_ceremonies + hall_schedules + ceremony_payments |
| WB-004 | `transitionCeremonyStatus` | StatusTransition | ceremony 상태 전환 (reserved → ongoing → ended / closed / cancelled) |
| WB-005 | `expireClosedCeremonyBatch` | StatusTransition (batch) | closed ceremony 일괄 만료 처리 |
| WB-006 | `processCeremonyRefund` | AtomicTransaction | ceremony 환불 atomic — cancelled_fee_records + ceremony_refunds (강한 계약금/위약금) |

---

## §3 합성 스키마

```sql
-- wedding_ceremonies: 예식 예약 메인 테이블
CREATE TABLE wedding_ceremonies (
  id TEXT PRIMARY KEY,
  hall_id TEXT NOT NULL,              -- 예식장 ID
  membership_id TEXT NOT NULL,        -- 회원권 ID (신랑신부 측)
  schedule_id TEXT,                   -- 홀 스케줄 ID (nullable until booked)
  payment_id TEXT,                    -- 결제 ID (nullable until paid)
  status TEXT NOT NULL,               -- reserved | ongoing | ended | closed | cancelled
  scheduled_at TEXT NOT NULL
);

-- wedding_halls: 예식장 정보
CREATE TABLE wedding_halls (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  max_concurrent_ceremonies INTEGER NOT NULL DEFAULT 3,  -- 동시 active ceremony 한도
  active_ceremonies INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL                -- active | closed | suspended
);

-- hall_memberships: 예식장 회원권 (신랑/신부 계정 기반)
CREATE TABLE hall_memberships (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  hall_id TEXT NOT NULL,
  membership_type TEXT NOT NULL,      -- standard | premium | vip
  hall_limit INTEGER NOT NULL DEFAULT 1,  -- 일일 hall 예약 한도
  hall_used INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,               -- active | paused | expired | cancelled
  expires_at TEXT NOT NULL
);

-- hall_schedules: 홀 시간대 스케줄
CREATE TABLE hall_schedules (
  id TEXT PRIMARY KEY,
  hall_id TEXT NOT NULL,
  ceremony_id TEXT NOT NULL,
  slot_time TEXT NOT NULL,            -- 예식 시간대 슬롯
  guest_count INTEGER NOT NULL,       -- 하객 수
  ceremony_type TEXT NOT NULL,        -- morning | afternoon | evening
  status TEXT NOT NULL                -- active | completed | cancelled | expired
);

-- ceremony_payments: 예식 결제
CREATE TABLE ceremony_payments (
  id TEXT PRIMARY KEY,
  ceremony_id TEXT NOT NULL,
  schedule_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,               -- paid | refunded | partial_refund
  paid_at TEXT NOT NULL
);

-- cancelled_fee_records: 취소 수수료 기록 (계약금/위약금)
CREATE TABLE cancelled_fee_records (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  ceremony_id TEXT NOT NULL,
  ceremony_cost INTEGER NOT NULL,
  cancellation_rate REAL NOT NULL,    -- 위약금 비율 (0.0~1.0)
  cancellation_amount INTEGER NOT NULL,
  status TEXT NOT NULL                -- pending | calculated | refunded
);

-- ceremony_refunds: 환불 기록
CREATE TABLE ceremony_refunds (
  id TEXT PRIMARY KEY,
  fee_record_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,               -- refunded | partial
  refunded_at TEXT NOT NULL
);
```

---

## §4 E2E 시나리오

| # | 시나리오 | 결과 |
|---|---------|------|
| E1 | reserveCeremony — 한도 내 예약 성공 | PASS |
| E2 | reserveCeremony — MAX_CONCURRENT_CEREMONIES_PER_HALL 초과 → WeddingHallError E422 | FAIL |
| E3 | applyHallLimit — hallLimit 내 예약 | PASS |
| E4 | processCeremonyBooking — atomic INSERT/UPDATE | PASS |
| E5 | transitionCeremonyStatus — reserved → ongoing | PASS |
| E6 | transitionCeremonyStatus — cancelled → reserved (역행 차단) | FAIL |
| E7 | expireClosedCeremonyBatch — closed 1건 만료 | PASS |
| E8 | processCeremonyRefund — 위약금 계산 + atomic 환불 | PASS |

---

## §5 Worker 파일 매핑 (단일 구현)

| 파일 | 작업 | 우선순위 |
|------|------|---------|
| `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/wedding-hall.ts` | 신규 생성 305+ lines | P0 |
| `.decode-x/spec-containers/wedding-hall/provenance.yaml` | 신규 생성 | P0 |
| `.decode-x/spec-containers/wedding-hall/rules/wedding-hall-rules.md` | 신규 생성 | P0 |
| `.decode-x/spec-containers/wedding-hall/tests/WB-001.yaml` | 신규 생성 | P0 |
| `scripts/divergence/domain-source-map.ts` | DOMAIN_MAP 84번째 entry 추가 | P0 |
| `packages/utils/src/divergence/rules-parser.ts` | WB prefix 추가 (80→81) | P0 |
| `packages/utils/src/divergence/bl-detector.ts` | WB-001~006 registry 추가 | P0 |
| `packages/utils/test/bl-detector.test.ts` | 5축 test 추가 (+7 tests) | P0 |

---

## §6 DoD 체크리스트

- [ ] wedding-hall.ts 305+ lines + 6 함수 + WeddingHallError
- [ ] spec-container 3 files
- [ ] DOMAIN_MAP 84번째 entry (wedding-hall)
- [ ] WB prefix 추가 (rules-parser.ts, 80→81)
- [ ] REGISTRY WB-001~006 (withRuleId × 6)
- [ ] utils test: exposes 368→374 + sorted WB + registered + PRESENCE + findDomainMapping
- [ ] `pnpm test --run` 689→696 PASS (+7)
- [ ] `npx tsc --noEmit` PASS
- [ ] detect-bl 500→506/506 = 100.0%
- [ ] Match ≥ 95%
- [ ] PR + CI 3/3 green + domain-sprint-guard PASS (6축 (f) 실감증 2회차)
- [ ] git show HEAD --stat | grep domain-source-map.ts (자체 검증)
