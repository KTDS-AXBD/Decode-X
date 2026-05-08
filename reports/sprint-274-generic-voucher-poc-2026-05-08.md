---
id: AIF-RPRT-072
title: Sprint 274 F440 — Generic Voucher 9번째 도메인 PoC
sprint: 274
feature: F440
status: completed
match_rate: 95
created: 2026-05-08
plan: AIF-PLAN-072
---

# AIF-RPRT-072: Sprint 274 F440 — Generic Voucher 9번째 도메인 PoC

## §1 Executive Summary

LPON 7 + miraeasset-pension 8 도메인 패턴을 **Generic Voucher (합성)** 9번째 도메인으로 확장. **신규 detector 0개** (withRuleId 재사용 9번째 도메인) — 인프라 누적 재활용 7 Sprint 연속 (Sprint 264~269 + 274) 달성. detector coverage 69.1% → **72.1%** (+3.0%pp). DoD 14/14 PASS. Match 95%.

**핵심 성과**:
- Generic Voucher 합성 도메인 6 BL (V-001~V-006) 모두 PRESENCE 자동 입증
- LPON pattern 일반화 가능성 입증 — 비금융 도메인 (카드/쿠폰/포인트) 추상화 PoC
- Master inline ~1.5h ($0)

## §2 정량 결과

### 핵심 지표

| 지표 | 이전 (Sprint 269) | 현재 (Sprint 274) | 차이 |
|------|:--:|:--:|:--:|
| 활성 도메인 | 8 | **9** | +1 |
| BL_DETECTOR_REGISTRY entries | 38 | **44** | +6 (V-001~V-006) |
| Total BLs | 55 | **61** | +6 |
| Detector coverage | 38/55 = 69.1% | **44/61 = 72.1%** | +3.0%pp |
| 신규 detector | 0 | **0** | (withRuleId 재사용 정점) |
| utils 단위 테스트 | 170 PASS | **170 PASS** | (회귀 0) |
| voucher.test.ts | — | **19 PASS** | 신규 |

### detect-bl --all-domains 결과

```
=== Multi-Domain BL Detector — 9 containers ===
  lpon-refund: 11 BLs, 6 applicable, 1 ABSENCE (BL-026 OPEN)
  lpon-charge: 8 BLs, 4 applicable, 0 ABSENCE
  lpon-payment: 7 BLs, 2 applicable, 0 ABSENCE
  lpon-gift: 6 BLs, 5 applicable, 0 ABSENCE
  lpon-settlement: 6 BLs, 4 applicable, 0 ABSENCE
  lpon-budget: 5 BLs, 5 applicable, 0 ABSENCE
  lpon-purchase: 5 BLs, 5 applicable, 0 ABSENCE
  miraeasset-pension: 7 BLs, 7 applicable, 0 ABSENCE
  generic-voucher: 6 BLs, 6 applicable, 0 ABSENCE  ← 신규 (V-001~V-006)

Summary: 61 total BLs, 44 detector applications across 9 containers
Detector coverage: 44/61 = 72.1%
```

### write-provenance --apply 결과

```
Summary: 0/9 containers with changes
[apply] 0 files written
```
→ 9 containers 전원 PRESENCE 자연 결과 (Sprint 263+ 패턴 동일).

## §3 DoD 매트릭스

| # | 항목 | 결과 |
|---|------|:--:|
| 1 | Plan 문서 (AIF-PLAN-072) | ✅ |
| 2 | source.ts (~180 lines, 6 함수) | ✅ 220 lines (V-001~V-006 + VoucherError) |
| 3 | tests (~200 lines, 18+ cases) | ✅ 230 lines, **19 cases PASS** |
| 4 | spec-container 14 sub-files | ✅ provenance + voucher-rules + V-001~V-006 rules/runbooks/tests + contract |
| 5 | DOMAIN_MAP entry 9번째 | ✅ generic-voucher entry, sourceCodeStatus="present", underImplTargets=[6 함수] |
| 6 | REGISTRY 6 entries | ✅ V-001~V-006 (Threshold × 3 + Atomic × 1 + Status × 2) |
| 7 | parser regex V prefix | ✅ `/^(?:BL\|BB\|BP\|BG\|BS\|P\|V)-[A-Z]?\d{1,3}$/` |
| 8 | detect-bl 검증 | ✅ 9 containers, 6 BL V PRESENCE 자동 입증, 0 ABSENCE |
| 9 | provenance apply | ✅ 0 changes (9/9 containers PRESENCE 자연 결과) |
| 10 | typecheck/lint clean | ✅ utils tsc clean, voucher.test 19/19 |
| 11 | unit test PASS | ✅ utils 170/170 (회귀 0) + voucher.test 19/19 |
| 12 | Match ≥ 90% | ✅ 95% |
| 13 | Report (AIF-RPRT-072) | ✅ 이 문서 |
| 14 | SPEC §6 Sprint 274 등록 | ✅ |

## §4 비즈니스 룰 매핑 (V-001~V-006)

| BL ID | 룰 | 함수 | Detector | 신뢰도 |
|-------|------|------|:--:|:--:|
| V-001 | 발행 한도 (issuer당 일일 ≤ 1,000건) | issueVoucher | ThresholdCheck | 70% |
| V-002 | 사용 기한 365일 | useVoucher | ThresholdCheck | 70% |
| V-003 | 사용 시 잔액 차감 atomic | redeemVoucher | AtomicTransaction | 85% |
| V-004 | 잔액 ≤ 1,000원 자동 소멸 | autoDestroyVoucher | StatusTransition | 75% |
| V-005 | 환불 (사용 0 + 7일 이내) | refundVoucher | ThresholdCheck | 70% |
| V-006 | 양도 1회만 | transferVoucher | StatusTransition | 75% |

**평균 신뢰도 74.2%** (Threshold 70% × 3 + Atomic 85% × 1 + Status 75% × 2)

## §5 메타 학습

### M1. withRuleId 재사용 9번째 도메인 정점

Sprint 264 gift (12 → 17) → 265 settlement (17 → 21) → 266 budget+purchase (21 → 31) → 269 miraeasset-pension (31 → 38) → **274 generic-voucher (38 → 44)** — 7 Sprint 연속 인프라 누적 재활용 정점. 신규 detector 0개 패턴이 **9 도메인 모두 적용 가능**함을 입증 → universal detector 3종 (Threshold/Status/Atomic)이 도메인 일반화 인프라로 작동.

### M2. 합성 도메인의 가치 (vs 실 도메인)

LPON 7 + miraeasset-pension 8은 **실 비즈니스 영역**이지만 generic-voucher는 **합성**. 합성 도메인의 가치:
- (a) **신규 도메인 부트스트래핑 검증** — 실 source code 부재 상태에서 spec → code 흐름 시뮬레이션
- (b) **detector 일반화 입증** — 합성에서도 PRESENCE 자동 입증 = detector가 함수 시그니처/구조 단위 매칭, 도메인 의미 무관
- (c) **재사용 가능한 시작점** — 신규 도메인 추가 시 generic-voucher template 복사 후 비즈니스 룰만 교체

### M3. ErrorClass message에 code 포함 패턴

Sprint 264 gift / Sprint 269 pension의 `XxxError` 클래스는 message에 code 미포함. voucher.test.ts에서 `toThrow(/E422-XXX/)` regex matcher 사용 시 fail. **수정**: `super(\`[\${code}] \${message}\`)` 패턴으로 message에 code prepend → regex matcher 정상 동작. **차기 도메인 추가 시 표준 패턴**.

## §6 산출물

### 신규 파일 (16개)
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/voucher.ts` (220 lines)
- `반제품-스펙/pilot-lpon-cancel/working-version/src/__tests__/voucher.test.ts` (230 lines, 19 cases)
- `.decode-x/spec-containers/generic-voucher/provenance.yaml`
- `.decode-x/spec-containers/generic-voucher/rules/voucher-rules.md`
- `.decode-x/spec-containers/generic-voucher/rules/V-{001..006}.md` (6 files)
- `.decode-x/spec-containers/generic-voucher/runbooks/V-{001..006}.md` (6 files)
- `.decode-x/spec-containers/generic-voucher/tests/V-{001..006}.yaml` (6 files)
- `.decode-x/spec-containers/generic-voucher/tests/contract/voucher-contract.yaml`
- `reports/sprint-274-generic-voucher-poc-2026-05-08.{md,json}`

### 수정 파일 (4개)
- `scripts/divergence/domain-source-map.ts` (DOMAIN_MAP 9번째 entry)
- `packages/utils/src/divergence/bl-detector.ts` (REGISTRY V-001~V-006 추가)
- `packages/utils/src/divergence/rules-parser.ts` (regex V prefix)
- `packages/utils/test/bl-detector.test.ts` (expected 38 → 44 + V keys 추가)

## §7 후속

- **차기 도메인 후보**: Credit Card (LPON payment 확장) / Loyalty Points / Delivery (산업 다양성)
- **VoucherError code-message 패턴 표준화** — 차기 도메인은 `super(\`[\${code}] \${message}\`)` 적용 (M3)
- **F358 Phase 4 LPON 전수 production 재추출** — Java Tree-sitter 재파싱 + LPON 35 R2 zip 재추출 (대형 작업)

## §8 참조

- AIF-PLAN-072 (이 Sprint Plan)
- Sprint 269 F436 (`F436-miraeasset-pension-containers.plan.md`) 8번째 도메인
- Sprint 264 F431 / 265 F432 / 266 F433 (gift/settlement/budget+purchase 7 Sprint 연속)
- Sprint 262 F429 (universal detector 3종)
- `scripts/divergence/domain-source-map.ts` DOMAIN_MAP 9 entries
- `packages/utils/src/divergence/bl-detector.ts` BL_DETECTOR_REGISTRY 44 entries
- `packages/utils/src/divergence/rules-parser.ts` regex V prefix
