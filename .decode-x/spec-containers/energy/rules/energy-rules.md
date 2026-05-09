# Spec Container — ENERGY-001 (에너지/유틸리티 산업 합성 도메인)

**Skill ID**: ENERGY-001
**Domain**: Energy (에너지/유틸리티 산업 — 계량기검침/누진요금/사용량경보/계량기상태전환/정전통보배치/연체정지)
**Source**: SYNTHETIC — Sprint 294 F460, withRuleId 재사용 24번째 도메인 PoC (Retail 다음 산업, 13번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (EN-001 ~ EN-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| EN-001 | 계량기 검침 기록 시 | `usageKwh ≥ 0` AND `usageKwh ≤ MAX_METER_USAGE_KWH` AND `meter.status NOT IN (suspended, locked)` | `meter_readings` INSERT + `meters.last_reading_kwh` UPDATE | `E422-USAGE-MAX`, `E422-USAGE-NEG`, `E404-METER`, `E409-METER` |
| EN-002 | 누진 요금 구간 계산 시 | `currentUsage ≤ tierUsageLimit` (구간 탐색) | 해당 구간 요금 반환 + `meters.status='billed'` | `E404-TIER` |
| EN-003 | 사용량 경보 트리거 시 | `currentUsage > alertThresholdKwh` | atomic: `meter_readings` INSERT + `outage_records` INSERT (status='pending') | `E422-ALERT-THRESHOLD`, `E404-METER` |
| EN-004 | 계량기 상태 전환 (active → reading_due → billed → paid → active) | 허용 매트릭스 충족 | `meters.status` UPDATE | `E404-METER`, `E409-METER` |
| EN-005 | 정전 일괄 통보 처리 (시스템 배치) | `outage_records.status = 'pending'` AND 대상 계정 확인 | `outage_records.status='notified'` 일괄 UPDATE + `notified_at` 설정 | 대상 없으면 notifiedCount=0 |
| EN-006 | 연체 정지 처리 시 | `overdue_days > MAX_OVERDUE_DAYS` AND `suspended_at IS NULL` | atomic: `overdue_accounts.suspended_at` SET + `meters.status='suspended'` + `meters.status='locked'` | `E404-OVERDUE`, `E422-OVERDUE` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `meters` | last_reading_kwh UPDATE (EN-001) / status='billed' (EN-002) / status 전환 (EN-004) / status='suspended'/'locked' (EN-006) | recordMeterReading / computeBillingTier / transitionMeterStatus / processOverdueSuspension |
| `meter_readings` | INSERT (EN-001/003) | recordMeterReading / triggerUsageAlert |
| `billing_tiers` | 조회 (EN-002) | computeBillingTier |
| `outage_records` | INSERT (EN-003) / status='notified' (EN-005) | triggerUsageAlert / markOutageNotified |
| `overdue_accounts` | suspended_at SET (EN-006) | processOverdueSuspension |

---

## 임계값 / 상수

- `MAX_METER_USAGE_KWH = 50_000` (EN-001 최대 계량기 사용량)
- `MAX_OVERDUE_DAYS = 90` (EN-006 연체 최대 허용일)

---

## 상태 머신

```
meters: [recordMeterReading] → active (검침 완료)
meters: active → reading_due (EN-004 transition)
meters: reading_due → billed (EN-004 / EN-002 자동)
meters: billed → paid (EN-004 transition)
meters: paid → active (EN-004 사이클 리셋)
meters: active → suspended (EN-006 atomic)
meters: suspended → locked (EN-006 atomic)

outage_records: [triggerUsageAlert] → pending
outage_records: pending → notified (EN-005 batch)
outage_records: notified → resolved (manual)
```

---

## 권한

- **recordMeterReading**: 검침원 SYSTEM
- **computeBillingTier**: 과금 SYSTEM
- **triggerUsageAlert**: 모니터링 SYSTEM
- **transitionMeterStatus**: 계정 관리 SYSTEM
- **markOutageNotified**: 통보 SYSTEM (배치)
- **processOverdueSuspension**: 수금 SYSTEM

---

## 관련 문서

- `rules/EN-001.md` ~ `rules/EN-006.md` — 개별 BL detail
- `runbooks/EN-001.md` ~ `runbooks/EN-006.md` — operational runbooks
- `tests/EN-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/energy.ts` — 합성 source
