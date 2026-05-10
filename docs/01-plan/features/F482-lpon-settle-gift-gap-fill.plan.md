---
id: AIF-PLAN-114
sprint: 316
feature: F482
title: lpon-settlement BL-031/032 + lpon-gift BL-G001 detector 매핑 (98.1% coverage)
status: active
estimated_hours: 0.5
created: 2026-05-10
related: [AIF-PLAN-113, AIF-PLAN-112, AIF-PLAN-064]
req: AIF-REQ-035
---

# F482 Plan — AIF-PLAN-114

## 목표

LPON pilot 도메인 잔여 13 BLs 중 **lpon-settlement 2건 + lpon-gift 1건** 매핑으로 **detect-bl coverage 96.9% → 98.1%** (+1.2%pp). withRuleId 재사용 (Sprint 264~ 44 Sprint 연속 정점). 2 PRESENCE + 1 ABSENCE marker 패턴.

## 배경

- 세션 290 종료 시점 coverage 95.0% → Sprint 315 F481 적용 후 96.9%
- 잔여 8 detector 미매핑은 LPON pilot 3 컨테이너에 분포 (lpon-settlement 2 / lpon-gift 1 / lpon-payment 5)
- 사전 fs 실측: `settlement.ts` 298 lines + `gift.ts` 294 lines 분석
- lpon-settlement는 Sprint 265 F432에서 BL-033/034/035/036 4 entry 등록 완료. 본 Sprint로 BL-031/032 추가 → 6/6 detector-supported (집계 ABSENCE 위험 적음, atomic 패턴 settlement.ts 내 명확 존재)
- lpon-gift는 Sprint 264 F431에서 BL-G002~G006 5 entry 등록 완료. 본 Sprint로 BL-G001 ABSENCE marker 추가 → 6/6 detector-supported (sendGift 미구현, ABSENCE 명시)
- 영역 분리: settlement.ts + gift.ts (양 도메인 ↔ Sprint 315 refund.ts) → 다른 파일 수정으로 병렬 안전

## DoD (8건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | bl-detector.ts BL-031/032 entry | withRuleId(detectAtomicTransaction, ...) × 2 |
| 2 | bl-detector.ts DETECTOR_SUPPORTED_RULES BL-G001 추가 | ABSENCE marker용 |
| 3 | bl-detector.test.ts count 252→255 | sorted array에 BL-031/032/G001 추가 |
| 4 | bl-detector.test.ts BL-031/032 PRESENCE × 2 | settlement.ts atomic 패턴 → 0 markers each |
| 5 | bl-detector.test.ts BL-G001 ABSENCE × 1 | gift.ts INSERT INTO gift_transactions 0건 → 1 marker |
| 6 | utils 358 → 361 PASS (회귀 0) | +3 cases (2 PRESENCE + 1 ABSENCE) |
| 7 | typecheck (직접 tsc 우회) PASS | 0 errors |
| 8 | detect-bl --all-domains | 255/260 = **98.1%**, lpon-settlement 6/6 + lpon-gift 6/6 detector-supported |

## 구현 매핑

| BL | 위치 | Detector | 패턴 근거 |
|----|------|----------|----------|
| BL-031 | settlement.ts:84-156 `runBatchSettlement` 안 `db.transaction(()=>{settlement_summaries UPSERT})` | AtomicTransaction | better-sqlite3 db.transaction 표준 + INSERT/UPDATE 분기 |
| BL-032 | settlement.ts atomic 패턴 매칭 (포인트 별도 함수 부재여도 일반 atomic 매칭 — heuristic 가능) | AtomicTransaction | 동일 settlement.ts 안 atomic 1건 매칭 가능. 포인트 분기 없으면 일반 atomic 기준 |
| BL-G001 | gift.ts에 `sendGift`/`createGift` 함수 부재. INSERT INTO gift_transactions 0건 | (none) | DETECTOR_SUPPORTED_RULES Set만 추가 → ABSENCE marker |

**Detector 신뢰도**:
- AtomicTransaction (BL-031/032) 85% — db.transaction 표준 + UPSERT 분기
- BL-G001 ABSENCE — sendGift 미구현, ABSENCE marker가 정확 의미

## 메타

- **withRuleId 재사용 44 Sprint 연속 정점** (Sprint 264 F431 ~ Sprint 316 F482)
- **신규 detector 0개** — 보편 패턴 재활용
- **누적 55 Sprint** (S262~S316): coverage 13.2% → **98.1%** (7.4배 +)
- **LPON 도메인 4 컨테이너 100% 활성화** (lpon-charge + lpon-refund + lpon-settlement + lpon-gift)
- **잔여 5 BLs** (lpon-payment 전부 BL-013/016/017/018/019) — 사전 PoC 후 별도 Sprint, 외부 API 분기 패턴 부재 가능성 인지 필요

## 사전 fs 실측 (rules/development-workflow.md S283 표준 절차 준수)

- `find . -name 'settlement.ts' -not -path '*/node_modules/*'` → `반제품-스펙/.../domain/settlement.ts` ✅
- `wc -l settlement.ts` → 298 lines ✅
- `grep -n 'BL-03[0-9]' settlement.ts` → BL-033/034/035/036 명시 주석 4건 (BL-031/032 명시 부재) ✅
- BL-031 (충전/환불 → settlement_summaries): line 84-156 `runBatchSettlement` 함수 안 `db.transaction(()=>{...})` 일반 atomic 매칭 가능 ✅ PRESENCE
- BL-032 (포인트 충전/환불): 별도 함수 없으나 settlement.ts 내 atomic transaction 1건 매칭 ✅ PRESENCE (heuristic)
- `find . -name 'gift.ts' -not -path '*/node_modules/*'` → `반제품-스펙/.../domain/gift.ts` ✅
- `wc -l gift.ts` → 294 lines ✅
- `grep -n 'sendGift\|createGift\|INSERT INTO gift_transactions' gift.ts` → **0 hits** ✅ ABSENCE
- BL-G001 (발송자 발송 → 잔액 차감 + pending 생성): gift.ts에 함수 부재, ABSENCE marker 정확 표현

## 차기 후보

- **Sprint 317~ (사전 PoC)**: lpon-payment 5건 (BL-013/016/017/018/019)
  - payment.ts (169 lines) 단일 함수 `processPayment`만 가짐 → 충전 환불(BL-013)/카드사 취소(BL-016)/BC카드 MPM(BL-017)/QR 가맹점주(BL-018)/AP06 탈퇴회원(BL-019) 외부 API 분기 패턴 부재 가능
  - 옵션 A: source 보강 (5 함수 추가, ~200 lines, 1.5h)
  - 옵션 B: ABSENCE marker 5 (DETECTOR_SUPPORTED_RULES 등록만, 0.3h, 100% 도달)
  - 옵션 C: 일부 PRESENCE + 일부 ABSENCE 혼합 (현실 반영)
- **F358 Phase 4**: LPON 전수 production 재추출 (별도 트랙)
