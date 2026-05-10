---
id: AIF-PLAN-115
sprint: 317
feature: F483
title: lpon-payment BL-013/016/017/018/019 ABSENCE marker (100% coverage 도달)
status: active
estimated_hours: 0.3
created: 2026-05-10
related: [AIF-PLAN-114, AIF-PLAN-113, AIF-PLAN-112]
req: AIF-REQ-035
---

# F483 Plan — AIF-PLAN-115

## 목표

LPON pilot 도메인 잔여 5 BLs (`lpon-payment` BL-013/016/017/018/019)을 ABSENCE marker로 등록하여 **detect-bl coverage 98.1% → 100%** (260/260) 도달. **LPON pilot 5 컨테이너 전수 detector-supported 마일스톤** 종결.

## 배경

- 세션 291 종료 시점 coverage 98.1% (255/260) — Sprint 315 F481 + Sprint 316 F482 Pipeline batch 1 완결 후
- 잔여 5 BLs 모두 lpon-payment 도메인 — payment.ts(169 lines, 단일 함수 `processPayment`)에 cancel/refund 분기 부재
- 사전 fs 실측(S283 표준): payment.ts 본문 검토 결과 BL-015(SMS threshold)만 PRESENCE, 나머지 6건은 cancel 분기 자체 부재
  - BL-013 (회사 충전 환불) — refund 도메인 영역, payment.ts 부재 ✅ ABSENCE
  - BL-014 (결제 완료 후 취소) — 이미 BL_DETECTOR_REGISTRY 등록 (`detectStatusTransition`), `voucher.status !== 'ACTIVE'` 매칭으로 카운트됨
  - BL-015 (50,000원 SMS) — 이미 BL_DETECTOR_REGISTRY 등록 (`detectThresholdCheck`), `if (amount >= 50_000)` 직접 매칭
  - BL-016 (결제 승인 취소 요청) — `cancelPayment()` 부재 ✅ ABSENCE
  - BL-017 (가맹점 BC카드 MPM 전송) — `cancelByMerchant()` / MPM 분기 부재 ✅ ABSENCE
  - BL-018 (QR 가맹점주 취소 승인) — `approveQrCancel()` 부재 ✅ ABSENCE
  - BL-019 (탈퇴회원 AP06 API) — `cancelByWithdrawnUser()` / AP06 분기 부재 ✅ ABSENCE
- 패턴 근거: Sprint 316 F482 BL-G001 ABSENCE marker (`detectGiftImplementation`) + Sprint 315 F481 BL-030 ABSENCE marker (`detectExpiryExtension`) 양식 그대로 재사용

## DoD (8건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | bl-detector.ts BL-013/016/017/018/019 entry | 5 ABSENCE detector 신규 + DETECTOR_SUPPORTED_RULES 등록 |
| 2 | bl-detector.ts 5 ABSENCE detector 함수 | `detectCompanyRefund` (BL-013) + `detectPaymentCancellation` (BL-016) + `detectMerchantMpmCancel` (BL-017) + `detectQrMerchantApproval` (BL-018) + `detectWithdrawnUserCancel` (BL-019) — 모두 함수명 부재 검사 패턴 |
| 3 | bl-detector.test.ts BL-013/016/017/018/019 ABSENCE × 5 | payment.ts 실측: 5 markers (각 BL 1 ABSENCE) |
| 4 | utils 359 → 365 PASS (회귀 0) | +6 cases (5 ABSENCE + 1 registry count) |
| 5 | typecheck (직접 tsc 우회, S337 함정 회피) PASS | 0 errors |
| 6 | detect-bl --all-domains 100% | 255/260 → **260/260 = 100%** ✅ |
| 7 | lpon-payment 컨테이너 활성화 | 0/7 → 7/7 detector-supported (BL-013/014/015/016/017/018/019) |
| 8 | LPON pilot 5 컨테이너 100% | charge 8/8 + refund 11/11 + settlement 6/6 + gift 6/6 + payment 7/7 |

## 구현 매핑

| BL | 의미 | Detector (신규) | 검출 함수명 (부재) | 신뢰도 |
|----|------|---------|-------------|-------|
| BL-013 | 회사 충전 환불 | `detectCompanyRefund` | refundByCompany / cancelChargeRefund | 90% (도메인 외) |
| BL-016 | 결제 승인 취소 | `detectPaymentCancellation` | cancelPayment / refundPayment | 90% |
| BL-017 | BC카드 MPM 가맹점 취소 | `detectMerchantMpmCancel` | cancelByMerchant / mpmCancel | 90% |
| BL-018 | QR 가맹점주 취소 승인 | `detectQrMerchantApproval` | approveQrCancel / merchantApproveCancel | 90% |
| BL-019 | 탈퇴회원 AP06 취소 | `detectWithdrawnUserCancel` | cancelByWithdrawnUser / ap06Cancel | 90% |

**구현 패턴**: Sprint 316 F482 `detectGiftImplementation` 양식 그대로 — `ts.SourceFile` AST 순회 + `targetNames` Set 검사 + 부재 시 1 marker 반환.

## 메타

- **withRuleId 연속 정점 종결** — 5 신규 specific detector 추가 (Sprint 264~S316 44 Sprint 정점 종결, S317은 detector 5개 추가)
  - 단, BL-013/016/017/018/019 모두 ABSENCE marker용 detector라 의미상 "withRuleId 재사용" 정점은 종결되지 않음 (ABSENCE 신규 detector는 별도 카테고리)
- **신규 detector 5개** — BL-G001 / BL-030 형식 ABSENCE marker 패턴 양식 5회 재현
- **누적 56 Sprint** (S262~S317): coverage 13.2% → **100%** (7.6배+)
- **🏆 LPON pilot 100% 마일스톤** — 5 컨테이너(charge/refund/settlement/gift/payment) 전수 detector-supported. 잔여 0건
- **차기 후보**: 신규 산업 33번째 / F358 Phase 4 LPON 전수 production / 보안 후속 2건

## 사전 fs 실측 (rules/development-workflow.md S283 표준 절차)

- `find 반제품-스펙 -name 'payment.ts'` → `domain/payment.ts` (169 lines) ✅
- `grep -nE "^export (async )?function" payment.ts` → 1건 (`processPayment`) ✅
- `grep -nE "cancel|refund|MPM|QR.*cancel|AP06" payment.ts` → 0 hits (cancel 분기 자체 부재) ✅
- `cat .decode-x/spec-containers/lpon-payment/rules/payment-rules.md` → BL-013~019 7건 정의 확인 ✅
- BL-015 line 121 `if (amount >= 50_000)` → 이미 BL_DETECTOR_REGISTRY `detectThresholdCheck` 등록 ✅
- BL-014 status check `voucher.status !== 'ACTIVE'` → 이미 `detectStatusTransition` 등록 ✅

## R/I/S/K (잠재 위험)

- **R1** (낮음): ABSENCE marker 5건 신규 추가로 BL_DETECTOR_REGISTRY entry 카운트 증가 → tests 회귀 가능. 회피: `bl-detector.test.ts` registered count 5 증가 명시 + entry 정렬 일관 유지.
- **R2** (낮음): payment.ts에 추후 cancel 함수 추가 시 ABSENCE marker가 false positive 됨 → detector가 자동 PRESENCE 전환 (함수명 매칭). 회피 0 (자연 해소).
- **R3** (중간): 5 신규 detector는 같은 패턴 5회 반복으로 코드 중복. 회피: 단일 helper(`detectAbsentFunctions`) 추출 가능하나 0.3h 범위 내 명확성 우선 → S318+ 후속 리팩토링 후보.
