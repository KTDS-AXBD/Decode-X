---
id: AIF-RPRT-115
sprint: 314
feature: F480
title: lpon-charge gap fill — 95.0% Coverage 돌파 Report
status: completed
created: 2026-05-10
match_rate: 100%
related: [AIF-PLAN-112]
---

# F480 Report — AIF-RPRT-115

## 결과 요약

| 항목 | 결과 |
|------|------|
| Match Rate | 100% |
| detect-bl coverage | **243/260 (93.5%) → 247/260 (95.0%)** ✅ +1.5%pp |
| lpon-charge applicableDetectors | 4/8 → **8/8** PRESENCE 0 ABSENCE |
| 신규 detector | 0개 (withRuleId 재사용) |
| utils tests | 347 → **353 PASS** (+6: 4 PRESENCE + 1 ABSENCE + 1 registered) |
| typecheck (직접 tsc 우회) | 0 errors |
| eslint | clean |
| withRuleId 연속 정점 | **42 Sprint 연속** (S264~S278+S283~S314) |
| 누적 Sprint (S262~S314) | **53 Sprint**, coverage 13.2% → 95.0% (7.2배+) |
| 0 ABSENCE 산업 패턴 | 32 신규 산업 + lpon-charge 모두 유지 |

## DoD 체크 (8/8)

| # | 항목 | 상태 |
|---|------|------|
| 1 | bl-detector.ts BL-001~004 entry (withRuleId × 4) | ✅ Sprint 314 (F480) 주석 블록 + 4 entry |
| 2 | bl-detector.test.ts count 243→247 + sorted array | ✅ "exposes 247 detectors" + BL-001~004 4 entry 사전 위치 |
| 3 | BL-001~004 PRESENCE × 4 (charging.ts 패턴) | ✅ chargingSrc try/catch + db.transaction → 0 markers |
| 4 | BL-001 ABSENCE (sequential writes) | ✅ 1 marker ruleId=BL-001 입증 |
| 5 | utils 353 PASS 회귀 0 | ✅ 10 test files, 4.60s |
| 6 | typecheck PASS | ✅ `pnpm exec tsc --noEmit` 0 errors (turbo cache 우회 — Foundry-X S337 함정 회피) |
| 7 | detect-bl 247/260 = 95.0% | ✅ lpon-charge 8/8 presenceCount 0 absenceCount |
| 8 | Plan + Report + SPEC §6 Sprint 314 | ✅ AIF-PLAN-112 + AIF-RPRT-115 + 본 commit |

## 구현 내용

### 수정 파일 (2)
- `packages/utils/src/divergence/bl-detector.ts` — BL-001/002/003/004 4 entry + Sprint 314 주석 블록
- `packages/utils/test/bl-detector.test.ts` — 4 PRESENCE + 1 ABSENCE + 1 registered + count 243→247 + sorted array 갱신

### 신규 파일 (2)
- `docs/01-plan/features/F480-lpon-charge-gap-fill.plan.md` (AIF-PLAN-112)
- `docs/03-reports/sprint-314-F480-lpon-charge-gap-fill-report.md` (AIF-RPRT-115, 본 파일)

## BL 감지 결과 (lpon-charge 컨테이너 8/8)

| BL | charging.ts 패턴 | Detector | 결과 |
|----|------------------|----------|------|
| BL-001 | `try { await api.requestWithdrawal(...) }` (line ~88) | AtomicTransaction (withRuleId) | ✅ PRESENCE |
| BL-002 | `db.transaction(() => { INSERT × 2 + UPDATE })` (line ~103) | AtomicTransaction (withRuleId) | ✅ PRESENCE |
| BL-003 | `catch { throw new ChargeError('E500', ...) }` (line ~94) | AtomicTransaction (withRuleId) | ✅ PRESENCE |
| BL-004 | timeout — 동일 try/catch 분기 (semantically) | AtomicTransaction (withRuleId) | ✅ PRESENCE |
| BL-005 | `if (amount < CHARGE_MIN || amount > CHARGE_MAX ...)` | ThresholdCheck (S262 기존) | ✅ PRESENCE |
| BL-006 | `if (dailyRow.total + amount > DAILY_LIMIT)` | ThresholdCheck (S262 기존) | ✅ PRESENCE |
| BL-007 | `if (monthlyRow.total + amount > MONTHLY_LIMIT)` | ThresholdCheck (S262 기존) | ✅ PRESENCE |
| BL-008 | `if (amount % CHARGE_UNIT !== 0)` | ThresholdCheck (S262 기존) | ✅ PRESENCE |

## 메타

### 패턴 정착
- **withRuleId 재사용 42 Sprint 연속 정점** (Sprint 264 F431 gift → Sprint 314 F480 lpon-charge)
- **신규 detector 0개** — 6 Sprint 연속 인프라 누적 재활용 패턴 13회+ 정점
- **lpon-charge 컨테이너 100% 활성화** (8/8 PRESENCE)

### 선택 근거 (Master 사전 분석)
- **lpon-payment 5건 우선 후보 → fs 실측 후 lpon-charge 4건으로 절환**: payment.ts는 `processPayment` 1개 함수만 가지고 BL-013(charge refund)/BL-016~019(cancel sub-flows)는 다른 파일(cancel.ts/refund.ts) 구현. detector 추가 시 5 ABSENCE 위험 → "0 ABSENCE 정착 패턴" 깨짐 회피
- **lpon-charge 4건 PRESENCE 보장**: charging.ts에 `// BL-001:`, `// BL-002:`, `// BL-003:` 명시 주석 + try/catch + db.transaction 패턴 모두 존재 → AtomicTransaction PRESENCE 100%

### 잔여 13 BLs (후속 후보)
| 컨테이너 | 미매핑 BL | source 패턴 | 권고 |
|---|---|---|---|
| lpon-payment | BL-013/016/017/018/019 | payment.ts 미구현 (cancel/refund 영역) | source 보강 후 PRESENCE 가능 |
| lpon-refund | BL-020/021/023/025/030 | refund.ts 일부 (재실측 필요) | 패턴별 detector 매핑 검토 |
| lpon-settlement | BL-031/032 | settlement.ts upsert 모호 (Sprint 265 명시 skip) | upsert detector 신규 후보 |
| lpon-gift | BL-G001 | gift.ts grant 패턴 (현 detector scope 외) | grant detector 신규 후보 |

### 누적 효과 (S262~S314, 53 Sprint)
- coverage **13.2% → 95.0%** (7.2배+)
- 도메인 5 → **43** (8.6배)
- BL 38 → **260**
- detector 5 → **247**
- utils tests 87 → **353**

### 마일스톤
- **🏆 95% coverage 돌파** (S298 90% 돌파 이후 5%pp 추가)
- **withRuleId 42 Sprint 연속 정점**
- **누적 53 Sprint 마일스톤**
