---
id: AIF-PLAN-112
sprint: 314
feature: F480
title: lpon-charge gap fill — BL-001~004 detector 매핑 (95.0% coverage 돌파)
status: active
estimated_hours: 0.5
created: 2026-05-10
related: [AIF-PLAN-111, AIF-PLAN-064]
req: AIF-REQ-035
---

# F480 Plan — AIF-PLAN-112

## 목표

LPON pilot 도메인 잔여 갭 17건 중 **lpon-charge BL-001~004 (4건)** 매핑으로 **detect-bl coverage 93.5% → 95.0% 돌파**. withRuleId 재사용 (Sprint 264~ 42 Sprint 연속 정점). 0 ABSENCE 패턴 유지.

## 배경

- 세션 289 종료 시점 coverage 93.5% (243/260, 신규 산업 38 도메인 100%)
- 잔여 17 detector 미매핑은 모두 LPON pilot 5 컨테이너에 분포 (lpon-refund 5 / lpon-charge 4 / lpon-payment 5 / lpon-settlement 2 / lpon-gift 1)
- 사전 fs 실측: `charging.ts` `executeCharge()`에 BL-001/002/003/004 모두 명시적 `// BL-NNN:` 주석 + try/catch + db.transaction 패턴 → AtomicTransaction PRESENCE 확정
- 다른 후보(lpon-payment 5, lpon-refund 5)는 source(payment.ts/refund.ts)에 패턴 부재 → ABSENCE 발생 위험으로 본 Sprint 제외
- 단발 1 Sprint Master inline 패턴 유지 (S253~S313 Master inline 26 Sprint 연속)

## DoD (8건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | bl-detector.ts BL-001~004 entry | withRuleId(detectAtomicTransaction, ...) × 4 |
| 2 | bl-detector.test.ts count 243→247 | sorted array에 BL-001~004 추가 |
| 3 | bl-detector.test.ts BL-001~004 PRESENCE × 4 | charging.ts try/catch + db.transaction 패턴 → 0 markers |
| 4 | bl-detector.test.ts BL-001 ABSENCE | sequential writes (no atomic) → 1 marker ruleId=BL-001 |
| 5 | utils 353 PASS (회귀 0) | 347 + 6 (4 PRESENCE + 1 ABSENCE + 1 registered) |
| 6 | typecheck (turbo --force or direct tsc) PASS | 0 errors |
| 7 | detect-bl --all-domains | 247/260 = **95.0%**, lpon-charge 8/8 PRESENCE 0 ABSENCE |
| 8 | Plan + Report + SPEC §6 Sprint 314 | AIF-PLAN-112 + AIF-RPRT-115 + 체크박스 ✅ |

## 구현 매핑

| BL | charging.ts 위치 | Detector | 패턴 근거 |
|----|------------------|----------|----------|
| BL-001 | `// BL-001: 외부 출금 API 호출` (line ~88) | AtomicTransaction | `try { await api.requestWithdrawal(...) }` |
| BL-002 | `// BL-002: 출금 성공 → 충전 완료 처리 (단일 트랜잭션)` (line ~98) | AtomicTransaction | `db.transaction(() => { INSERT charge_transactions; INSERT withdrawal_transactions; UPDATE vouchers })` |
| BL-003 | `// BL-003: 출금 실패 시 에러 반환 + 충전 프로세스 중단` (line ~94) | AtomicTransaction | `catch { throw new ChargeError('E500', ...) }` (BL-001과 동일 try/catch) |
| BL-004 | spec: 출금 응답 timeout → 5분 후 상태조회 | AtomicTransaction | timeout 자체는 미구현이나 try/catch가 timeout 에러도 catch (semantically same atomic boundary) |

**Detector 신뢰도**: AtomicTransaction 85% (better-sqlite3 db.transaction 표준 + try/catch 패턴 동시 매칭)

## 메타

- **withRuleId 재사용 42 Sprint 연속 정점** (Sprint 264 F431 ~ Sprint 314 F480)
- **신규 detector 0개** — 보편 패턴 재활용
- **누적 52 Sprint** (S262~S314): coverage 13.2% → **95.0%** (7.2배 +)
- **LPON 도메인 1 컨테이너 100% 활성화** (lpon-charge 8/8)
- **잔여 13 BLs** (lpon-payment 5 / lpon-refund 5 / lpon-settlement 2 / lpon-gift 1) — 추후 source 보강 시 추가 사이클로 96~100% 가능 (단 ABSENCE 위험 분리 평가 필요)

## 사전 fs 실측 (rules/development-workflow.md S283 표준 절차 준수)

- `find packages/utils -name 'bl-detector.ts'` → `packages/utils/src/divergence/bl-detector.ts` ✅
- `grep -n "BL-001:\|BL-002:\|BL-003:" 반제품-스펙/.../charging.ts` → 명시 주석 4건 모두 확인 ✅
- `npx tsx scripts/divergence/detect-bl.ts --all-domains` baseline 측정 → lpon-charge 4/8 ✅
- `jq '.results[] | select(.container=="lpon-charge")'` perRule 분석 → 8개 BL parsed, 4 detector 미매핑 ✅
