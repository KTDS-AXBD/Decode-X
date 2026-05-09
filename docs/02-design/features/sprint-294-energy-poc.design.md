---
id: AIF-DSGN-092
sprint: 294
feature: F460
plan: AIF-PLAN-092
title: Energy 24번째 도메인 신규 — 에너지/유틸리티 산업 합성 도메인 Design
status: active
created: 2026-05-10
---

# F460 Design — AIF-DSGN-092

## §1 목표

Sprint 293 F459 (Retail) 패턴 복제 → Energy 24번째 도메인 신규.
13번째 신규 산업 (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + **EN**).

## §2 BL 설계 (EN-001 ~ EN-006)

| BL | 함수 | Detector | 패턴 |
|----|------|----------|------|
| EN-001 | `recordMeterReading()` | ThresholdCheck | usageKwh > MAX_METER_USAGE_KWH (var-vs-UPPERCASE) |
| EN-002 | `computeBillingTier()` | ThresholdCheck | currentUsage > tierUsageLimit (Path B, `limit` keyword) |
| EN-003 | `triggerUsageAlert()` | AtomicTransaction | 사용량 초과 + alert 발송 transaction |
| EN-004 | `transitionMeterStatus()` | StatusTransition | active → reading_due → billed → paid |
| EN-005 | `markOutageNotified()` | StatusTransition | batch pending → notified (CC-005 13번째 재사용) |
| EN-006 | `processOverdueSuspension()` | AtomicTransaction | 연체 확인 + suspend + meter lockout transaction |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 = 6 BLs (14번째 정착)

## §3 데이터 스키마 (합성)

```sql
-- meters: 전기/가스 계량기
CREATE TABLE meters (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  meter_type TEXT NOT NULL,    -- electricity | gas | water
  status TEXT NOT NULL DEFAULT 'active',  -- active | reading_due | billed | paid | suspended | locked
  last_reading_kwh REAL DEFAULT 0,
  installed_at TEXT NOT NULL
);

-- meter_readings: 계량기 검침 기록
CREATE TABLE meter_readings (
  id TEXT PRIMARY KEY,
  meter_id TEXT NOT NULL,
  usage_kwh REAL NOT NULL,
  recorded_at TEXT NOT NULL
);

-- billing_tiers: 누진 구간 정의
CREATE TABLE billing_tiers (
  id TEXT PRIMARY KEY,
  tier_level INTEGER NOT NULL,
  tier_usage_limit REAL NOT NULL,
  rate_per_kwh REAL NOT NULL
);

-- outage_records: 정전/단수 기록
CREATE TABLE outage_records (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  outage_type TEXT NOT NULL,  -- electricity | gas | water
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | notified | resolved
  occurred_at TEXT NOT NULL,
  notified_at TEXT
);

-- overdue_accounts: 연체 계정
CREATE TABLE overdue_accounts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  overdue_amount REAL NOT NULL,
  overdue_days INTEGER NOT NULL,
  suspended_at TEXT
);
```

## §4 파일 목록

### 신규 생성

| 파일 | 크기 |
|------|------|
| `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/energy.ts` | ~280 lines |
| `.decode-x/spec-containers/energy/provenance.yaml` | |
| `.decode-x/spec-containers/energy/rules/energy-rules.md` | |
| `.decode-x/spec-containers/energy/rules/EN-001.md` ~ `EN-006.md` | 6 files |
| `.decode-x/spec-containers/energy/runbooks/EN-001.md` ~ `EN-006.md` | 6 files |
| `.decode-x/spec-containers/energy/tests/EN-001.yaml` | |

### 수정

| 파일 | 변경 |
|------|------|
| `scripts/divergence/domain-source-map.ts` | energy entry 추가 (DOMAIN_MAP 24번째) |
| `packages/utils/src/divergence/rules-parser.ts` | EN prefix 추가 (BL_ID_PATTERN) |
| `packages/utils/src/divergence/bl-detector.ts` | EN-001~006 REGISTRY 추가 + 주석 |
| `packages/utils/test/bl-detector.test.ts` | 123→129 detector count + EN-001~006 expected list + describe block |

## §5 Worker 파일 매핑 (단일 구현)

모든 파일을 순차 구현 (Agent 병렬 없음 — 의존 관계 직렬).

## §6 임계값 / 상수

```typescript
const MAX_METER_USAGE_KWH = 50_000;   // EN-001: 계량기 최대 사용량
const MAX_OVERDUE_DAYS = 90;           // EN-006: 연체 최대 허용일 (초과 시 suspend)
```

## §7 상태 머신

```
meter: active → reading_due (EN-004)
meter: reading_due → billed (EN-004)
meter: billed → paid (EN-004)
meter: paid → active (EN-004, cycle reset)
meter: active → suspended (EN-006)
meter: suspended → locked (EN-006)

outage_record: pending → notified (EN-005 batch)
outage_record: notified → resolved (manual)
```

## §8 Gap 분석 기준

| 항목 | 기준 |
|------|------|
| energy.ts | 6 함수 + EnergyError 구현 |
| spec-container | 15 sub-files 생성 |
| DOMAIN_MAP | energy 24번째 entry |
| BL_ID_PATTERN | EN prefix 추가 |
| BL_DETECTOR_REGISTRY | EN-001~006 6건 추가 |
| 단위 테스트 | 123→129 (6건 추가) |
| detect-bl | 24 containers, 0 ABSENCE, coverage ≥ 88% |
