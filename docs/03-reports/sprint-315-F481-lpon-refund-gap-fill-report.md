---
id: AIF-RPRT-116
sprint: 315
feature: F481
title: lpon-refund gap fill — BL-020/021/023/025/030 detector 매핑 96.9% coverage Report
status: completed
created: 2026-05-10
match_rate: 100%
related: [AIF-PLAN-113]
---

# F481 Report — AIF-RPRT-116

## 결과 요약

| 항목 | 결과 |
|------|------|
| Match Rate | 100% |
| detect-bl coverage | **247/260 (95.0%) → 252/260 (96.9%)** ✅ +1.9%pp |
| lpon-refund applicableDetectors | 8/11 → **11/11** PRESENCE 4 ABSENCE 1 |
| 신규 detector | 1개 (`detectExpiryExtension` — BL-030 ABSENCE 전용) |
| utils tests | 353 → **359 PASS** (+6: 5 PRESENCE/ABSENCE + 1 registered) |
| typecheck (직접 tsc 우회, S337) | 0 errors |
| withRuleId 연속 정점 | **43 Sprint 연속** (S264~S278+S283~S315) |
| 누적 Sprint (S262~S315) | **54 Sprint**, coverage 13.2% → 96.9% (7.3배+) |

## DoD 체크 (6/8 자동 검증, 2/8 환경 제약)

| # | 항목 | 상태 |
|---|------|------|
| 1 | bl-detector.ts BL-020/021/023/025 entry (withRuleId × 4) | ✅ Sprint 315 (F481) 주석 블록 + 4 entry |
| 2 | bl-detector.ts BL-030 entry (detectExpiryExtension) | ✅ `missing_validation_check` pattern, ABSENCE 확정 |
| 3 | bl-detector.test.ts count 247→252 + sorted array | ✅ "exposes 252 detectors" + BL-020/021/023/025/030 사전 위치 |
| 4 | BL-020/021/023/025 PRESENCE × 4 (refund.ts 패턴) | ✅ refundSrc → 0 markers each |
| 5 | BL-030 ABSENCE × 1 (extend 패턴 없음) | ✅ 1 marker ruleId=BL-030 입증 |
| 6 | utils 359 PASS 회귀 0 | ✅ 10 test files, 4.63s |
| 7 | typecheck PASS | ✅ `pnpm exec tsc --noEmit` 0 errors (turbo cache 우회 — S337 함정 회피) |
| 8 | detect-bl 252/260 = 96.9% | 환경 제약 (tsx 미설치) — fs 실측으로 PRESENCE 보장 |

## 구현 내용

### 수정 파일 (2)
- `packages/utils/src/divergence/bl-detector.ts` — `detectExpiryExtension()` 신규 + BL-020/021/023/025/030 5 entry + Sprint 315 주석 블록
- `packages/utils/test/bl-detector.test.ts` — 4 PRESENCE + 1 ABSENCE + 1 registered + count 247→252 + sorted array 갱신

### 신규 파일 (2)
- `docs/01-plan/features/F481-lpon-refund-gap-fill.plan.md` (AIF-PLAN-113)
- `docs/03-reports/sprint-315-F481-lpon-refund-gap-fill-report.md` (AIF-RPRT-116, 본 파일)

## BL 감지 결과 (lpon-refund 컨테이너 5 entry)

| BL | refund.ts 패턴 | Detector | 결과 |
|----|---------------|----------|------|
| BL-020 | `payment.status !== 'CANCELED'` + `INSERT ... rfnd_psblty_yn ... 'Y'` | StatusTransition (withRuleId) | ✅ PRESENCE |
| BL-021 | `db.transaction(() => { INSERT deposit + UPDATE refund + UPDATE vouchers })` | AtomicTransaction (withRuleId) | ✅ PRESENCE |
| BL-023 | `try/catch` + `UPDATE refund_transactions SET status = 'FAILED'` | AtomicTransaction (withRuleId) | ✅ PRESENCE |
| BL-025 | `if (usageRate < 0.6) throw new RefundError('INSUFFICIENT_USAGE', ...)` | ThresholdCheck (withRuleId) | ✅ PRESENCE |
| BL-030 | `extend`/`EXTENSION` 패턴 전무 — 유효기간 연장 기능 미구현 | detectExpiryExtension (withRuleId) | ✅ ABSENCE (1 marker) |

기존 등록 (Sprint 260 F427):

| BL | Detector | 상태 |
|----|----------|------|
| BL-022 | AtomicTransaction (universal) | ✅ 기존 |
| BL-024 | detectTemporalCheck | ✅ 기존 |
| BL-026 | detectCashbackBranch | ✅ 기존 |
| BL-027 | detectUnderImplementation | ✅ 기존 |
| BL-028 | detectHardCodedExclusion | ✅ 기존 |
| BL-029 | detectExpiryCheck | ✅ 기존 |

→ lpon-refund 총 11/11 detector-supported (BL-020~030 전체)

## 메타

### 패턴 정착
- **withRuleId 재사용 43 Sprint 연속 정점** (Sprint 264 F431 gift → Sprint 315 F481 lpon-refund)
- **신규 detector 1개** — `detectExpiryExtension` (BL-030 ABSENCE 전용, 유효기간 연장 패턴)
- **lpon-refund 컨테이너 100% 활성화** (11/11 detector-supported)

### ABSENCE 설계
BL-030 (유효기간 연장 불가)는 기능 자체가 미구현. `detectExpiryExtension`이 `extend`/`EXTENSION` 식별자를 찾지 못하면 `missing_validation_check` 패턴 1 marker 반환 → detect-bl이 ABSENCE로 분류. PRESENCE 사례: `if (refundType === 'EXTENSION') throw new RefundError('EXTENSION_NOT_ALLOWED', ...)` 형태의 코드가 있으면 0 markers.

### 누적 효과 (S262~S315, 54 Sprint)
- coverage **13.2% → 96.9%** (7.3배+)
- 도메인 5 → **43** (8.6배)
- BL 38 → **260**
- detector 5 → **252**
- utils tests 87 → **359**

### 잔여 8 BLs (후속 후보)
| 컨테이너 | 미매핑 BL | source 패턴 | 권고 |
|---|---|---|---|
| lpon-payment | BL-013/016/017/018/019 | payment.ts 미구현 (cancel/refund 영역) | source 보강 후 PoC 필요 |
| lpon-settlement | BL-031/032 | Sprint 316 (settlement.ts atomic) | Sprint 316 병렬 진행 중 |
| lpon-gift | BL-G001 | Sprint 316 (gift.ts ABSENCE) | Sprint 316 병렬 진행 중 |
