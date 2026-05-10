---
id: AIF-PLAN-113
sprint: 315
feature: F481
title: lpon-refund gap fill — BL-020/021/023/025/030 detector 매핑 (96.9% coverage)
status: done
estimated_hours: 0.5
created: 2026-05-10
related: [AIF-PLAN-112, AIF-PLAN-064]
req: AIF-REQ-035
---

# F481 Plan — AIF-PLAN-113

## 목표

LPON pilot 도메인 잔여 13 BLs 중 **lpon-refund 5건** 매핑으로 **detect-bl coverage 95.0% → 96.9%** (+1.9%pp). withRuleId 재사용 (Sprint 264~ 43 Sprint 연속 정점). 4 PRESENCE + 1 ABSENCE marker 패턴.

## 배경

- 세션 290 종료 시점 coverage 95.0% (247/260, lpon-charge 8/8 PRESENCE 활성화 직후)
- 잔여 13 detector 미매핑은 LPON pilot 4 컨테이너에 분포 (lpon-refund 5 / lpon-payment 5 / lpon-settlement 2 / lpon-gift 1)
- 사전 fs 실측: `refund.ts` 252 lines 분석 — 4건 PRESENCE 보장 + 1건 (BL-030) ABSENCE marker
- lpon-refund 컨테이너는 Sprint 260 F427에서 BL-024/026/027/028/029 5 entry 등록 완료. 본 Sprint로 BL-020/021/023/025/030 추가 → 11/11 detector-supported (BL-022 universal로 이미 매핑됨)
- 영역 분리: refund.ts 단일 파일 → Sprint 316 (settlement.ts + gift.ts)와 병렬 안전

## DoD (8건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | bl-detector.ts BL-020/021/023/025 entry | withRuleId × 4 (status × 1 + atomic × 2 + threshold × 1) |
| 2 | bl-detector.ts DETECTOR_SUPPORTED_RULES BL-030 추가 | ABSENCE marker용 |
| 3 | bl-detector.test.ts count 247→252 | sorted array에 BL-020/021/023/025/030 추가 |
| 4 | bl-detector.test.ts BL-020/021/023/025 PRESENCE × 4 | refund.ts 패턴 → 0 markers each |
| 5 | bl-detector.test.ts BL-030 ABSENCE × 1 | empty file 또는 minimal source → 1 marker |
| 6 | utils 353 → 358 PASS (회귀 0) | +5 cases (4 PRESENCE + 1 ABSENCE) |
| 7 | typecheck (직접 tsc 우회, S337 turbo cache 함정 회피) PASS | 0 errors |
| 8 | detect-bl --all-domains | 252/260 = **96.9%**, lpon-refund detector-supported 11/11 (BL-020~030) |

## 구현 매핑

| BL | refund.ts 위치 | Detector | 패턴 근거 |
|----|---------------|----------|----------|
| BL-020 | `rfnd_psblty_yn = 'Y'` INSERT (line 124) + SELECT (line 47-51) + result.rfndPsbltyYn (line 135) | StatusTransition | `rfnd_psblty_yn` 필드 set + read 패턴 (Y/N status) |
| BL-021 | `db.transaction(() => { INSERT deposit + UPDATE refund_transactions + UPDATE vouchers })` (line 180-194) | AtomicTransaction | better-sqlite3 표준 transaction wrap |
| BL-023 | try (line 177) / catch (line 198) + `UPDATE refund_transactions SET status = 'FAILED'` (line 201) | AtomicTransaction | 입금 실패 시 catch branch + status rollback (try/catch + db.prepare) |
| BL-025 | `usageRate < 0.6 throw new RefundError('INSUFFICIENT_USAGE'...)` (line 110-112) | ThresholdCheck | `<` comparator + literal 0.6 + throw |
| BL-030 | (refund.ts에 유효기간 연장 요청 자체 미구현) | (none) | DETECTOR_SUPPORTED_RULES Set만 추가 → ABSENCE marker |

**Detector 신뢰도**:
- StatusTransition (BL-020) 75% — `rfnd_psblty_yn` 식별자 매칭 + Y/N literal
- AtomicTransaction (BL-021/023) 85% — db.transaction 표준 + try/catch
- ThresholdCheck (BL-025) 70% — `<` + 소수 리터럴 매칭
- BL-030 ABSENCE — 유효기간 연장 spec only, source 0건이므로 detector 무관

## 메타

- **withRuleId 재사용 43 Sprint 연속 정점** (Sprint 264 F431 ~ Sprint 315 F481)
- **신규 detector 0개** — 보편 패턴 재활용
- **누적 54 Sprint** (S262~S315): coverage 13.2% → **96.9%** (7.3배 +)
- **LPON 도메인 2 컨테이너 100% 활성화** (lpon-charge + lpon-refund)
- **잔여 8 BLs** (lpon-payment 5 / lpon-settlement 2 / lpon-gift 1) — Sprint 316으로 +1.2%pp → 98.1%, payment 5건은 사전 PoC 후 별도 Sprint

## 사전 fs 실측 (rules/development-workflow.md S283 표준 절차 준수)

- `find . -name 'refund.ts' -not -path '*/node_modules/*'` → `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/refund.ts` ✅
- `wc -l refund.ts` → 252 lines ✅
- `grep -n 'BL-02[0-9]\|BL-030' refund.ts` → 명시 주석 6건 (BL-020/021/022/024/025/028/029) ✅
- BL-020 (rfnd_psblty_yn): line 62 주석 + line 124 INSERT + line 135 result ✅ PRESENCE
- BL-021 (입금 처리): line 161 주석 + line 173 try + line 180-194 db.transaction ✅ PRESENCE
- BL-023 (입금 실패 catch): line 198-210 catch + status='FAILED' UPDATE ✅ PRESENCE
- BL-025 (60% threshold): line 107-113 usageRate < 0.6 throw ✅ PRESENCE
- BL-030 (유효기간 연장 요청): grep "extens\|prolong" → 0 hits, refund.ts에 함수 부재 ✅ ABSENCE

## 차기 후보

- **Sprint 316 (병렬)**: lpon-settlement BL-031/032 + lpon-gift BL-G001 (98.1%)
- **Sprint 317~ (사전 PoC 후)**: lpon-payment 5건 (BL-013/016/017/018/019 — 외부 API 분기 패턴 부재 가능, source 보강 또는 ABSENCE marker 결정 필요)
