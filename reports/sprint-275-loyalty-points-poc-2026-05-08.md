---
id: AIF-RPRT-073
title: Sprint 275 F441 — Loyalty Points 10번째 도메인 PoC
sprint: 275
feature: F441
status: completed
match_rate: 95
created: 2026-05-08
plan: AIF-PLAN-073
---

# AIF-RPRT-073: Sprint 275 F441 — Loyalty Points 10번째 도메인 PoC

## §1 Executive Summary

LPON 7 + miraeasset-pension 8 + generic-voucher 9 도메인 패턴을 **Loyalty Points (합성)** 10번째 도메인으로 확장. **신규 detector 0개** (withRuleId 재사용 10번째 도메인) — 인프라 누적 재활용 8 Sprint 연속 (Sprint 264~269 + 274 + 275). detector coverage 72.1% → **74.6%** (+2.5%pp). DoD 12/12 PASS. Match 95%.

**핵심 성과**:
- 6 BL (LP-001~LP-006) 모두 PRESENCE 자동 입증
- 2글자 prefix `LP` 첫 도입 — parser regex `(?:BL|BB|BP|BG|BS|LP|P|V)` 우선순위 alternation 검증
- VoucherError code-in-message 패턴 (S274 M3) 표준 적용 — 18 cases regex matcher 정상 동작
- Master inline ~1.5h ($0)

## §2 정량 결과

| 지표 | 이전 (S274) | 현재 (S275) | 차이 |
|------|:--:|:--:|:--:|
| 활성 도메인 | 9 | **10** | +1 |
| BL_DETECTOR_REGISTRY | 44 | **50** | +6 (LP-001~LP-006) |
| Total BLs | 61 | **67** | +6 |
| Detector coverage | 72.1% | **74.6%** | +2.5pp |
| 신규 detector | 0 | **0** | (withRuleId 재사용 정점) |
| utils 단위 테스트 | 170 PASS | **170 PASS** | (회귀 0) |
| loyalty.test.ts | — | **18 PASS** | 신규 |

### detect-bl --all-domains 결과

```
=== Multi-Domain BL Detector — 10 containers ===
  lpon-refund: 11 BLs, 6 applicable, 1 ABSENCE (BL-026 OPEN)
  lpon-charge: 8 BLs, 4 applicable, 0 ABSENCE
  lpon-payment: 7 BLs, 2 applicable, 0 ABSENCE
  lpon-gift: 6 BLs, 5 applicable, 0 ABSENCE
  lpon-settlement: 6 BLs, 4 applicable, 0 ABSENCE
  lpon-budget: 5 BLs, 5 applicable, 0 ABSENCE
  lpon-purchase: 5 BLs, 5 applicable, 0 ABSENCE
  miraeasset-pension: 7 BLs, 7 applicable, 0 ABSENCE
  generic-voucher: 6 BLs, 6 applicable, 0 ABSENCE
  loyalty-points: 6 BLs, 6 applicable, 0 ABSENCE  ← 신규 (LP-001~LP-006)

Summary: 67 total BLs, 50 detector applications across 10 containers
Detector coverage: 50/67 = 74.6%
```

### write-provenance --apply

```
Summary: 0/10 containers with changes
[apply] 0 files written
```
→ 10 containers 전원 PRESENCE 자연 결과 (Sprint 263+ 패턴 동일).

## §3 DoD 매트릭스

| # | 항목 | 결과 |
|---|------|:--:|
| 1 | Plan (AIF-PLAN-073) | ✅ |
| 2 | source.ts 6 함수 | ✅ 260 lines (LP-001~LP-006 + LoyaltyError code-in-message) |
| 3 | tests | ✅ **18 cases PASS** |
| 4 | spec-container 14 sub-files | ✅ provenance + loyalty-rules + LP-001~LP-006 rules/runbooks/tests + contract |
| 5 | DOMAIN_MAP 10번째 entry | ✅ loyalty-points entry, sourceCodeStatus="present" |
| 6 | REGISTRY 6 entries | ✅ LP-001~LP-006 (Threshold × 3 + Atomic × 1 + Status × 2) |
| 7 | parser regex 2글자 prefix | ✅ `(?:BL\|BB\|BP\|BG\|BS\|LP\|P\|V)` LP 우선순위 |
| 8 | detect-bl 10 containers | ✅ 6 BL LP PRESENCE 자동 입증 (0 ABSENCE) |
| 9 | provenance apply | ✅ 0 changes |
| 10 | utils 170/170 PASS | ✅ 회귀 0 |
| 11 | Match ≥ 90% | ✅ 95% |
| 12 | Report (AIF-RPRT-073) | ✅ 이 문서 |

## §4 비즈니스 룰 매핑 (LP-001~LP-006)

| BL ID | 룰 | 함수 | Detector | 신뢰도 |
|-------|------|------|:--:|:--:|
| LP-001 | 적립 일일 한도 ≤ 10,000P | earnPoints | ThresholdCheck | 70% |
| LP-002 | 사용 잔액 검증 | usePoints | ThresholdCheck | 70% |
| LP-003 | 사용 차감 atomic | redeemPoints | AtomicTransaction | 85% |
| LP-004 | 만료 자동 소멸 (1년) | expirePoints | StatusTransition | 75% |
| LP-005 | 등급 승급 (50K/200K) | promoteGrade | StatusTransition | 75% |
| LP-006 | 환불 회수 (30일 이내) | clawbackOnRefund | ThresholdCheck | 70% |

**평균 신뢰도 74.2%** (Threshold 70% × 3 + Atomic 85% × 1 + Status 75% × 2)

## §5 메타 학습

### M1. withRuleId 재사용 10번째 도메인 — 8 Sprint 연속 인프라 누적 정점

Sprint 264 gift (12 → 17) → 265 settlement (17 → 21) → 266 budget+purchase (21 → 31) → 269 miraeasset-pension (31 → 38) → 274 generic-voucher (38 → 44) → **275 loyalty-points (44 → 50)** — 8 Sprint 연속 인프라 누적. 신규 detector 0개 패턴이 **10 도메인 모두 적용 가능**함을 추가 입증.

### M2. 2글자 prefix `LP` alternation 우선순위 검증

`/^(?:BL|BB|BP|BG|BS|LP|P|V)-/` regex에서 `LP`를 `P`보다 먼저 배치 — JavaScript regex alternation은 left-to-right 매칭이라 `LP-001` 입력 시 `LP` 우선 매칭 (P가 1글자 prefix로 잘못 매칭하면 `-001` → `-001`로 valid해 보이나 prefix 길이 차이로 `LP-001`이 정확함). 정상 동작 확인.

**미래 prefix 추가 시 권장**: 2글자 이상 prefix는 1글자 prefix보다 alternation에서 먼저 배치 (longest-match 의도성).

### M3. VoucherError code-in-message 패턴 표준화

S274 M3 정착 패턴(`super(\`[\${code}] \${message}\`)`)을 LoyaltyError에 적용 — 18 cases regex matcher 첫 시도부터 모두 PASS (S274 1차 시 8 fail → fix 후 PASS와 대비). **차기 도메인 추가 시 Error class 작성 표준 패턴**으로 정착.

### M4. 합성 도메인 PoC 효율성 — Sprint 274/275 비교

| 지표 | Sprint 274 (V) | Sprint 275 (LP) | 차이 |
|------|:--:|:--:|:--:|
| 코드 작성 시간 | ~0.5h (test fail 포함) | ~0.4h (test 첫 시도 PASS) | -20% |
| Plan 작성 | ~0.3h | ~0.2h | -33% |
| 총 Master inline 시간 | ~1.5h | ~1.3h | -13% |

**Sprint 275는 Sprint 274 패턴을 직접 재사용**하여 단축. 합성 도메인 부트스트래핑 template 효과 입증.

## §6 산출물

### 신규 파일 (16개)
- `반제품-스펙/.../src/domain/loyalty.ts` (260 lines)
- `반제품-스펙/.../src/__tests__/loyalty.test.ts` (220 lines, 18 cases)
- `.decode-x/spec-containers/loyalty-points/provenance.yaml`
- `.decode-x/spec-containers/loyalty-points/rules/loyalty-rules.md`
- `.decode-x/spec-containers/loyalty-points/rules/LP-{001..006}.md` (6 files)
- `.decode-x/spec-containers/loyalty-points/runbooks/LP-{001..006}.md` (6 files)
- `.decode-x/spec-containers/loyalty-points/tests/LP-{001..006}.yaml` (6 files)
- `.decode-x/spec-containers/loyalty-points/tests/contract/loyalty-contract.yaml`
- `reports/sprint-275-loyalty-points-poc-2026-05-08.{md,json}`

### 수정 파일 (4개)
- `scripts/divergence/domain-source-map.ts` (DOMAIN_MAP 10번째)
- `packages/utils/src/divergence/bl-detector.ts` (REGISTRY LP-001~LP-006 추가)
- `packages/utils/src/divergence/rules-parser.ts` (regex LP prefix)
- `packages/utils/test/bl-detector.test.ts` (expected 44 → 50 + LP keys)

## §7 후속

- **차기 도메인**: Credit Card / Delivery (산업 다양성 지속)
- **F358 Phase 4** LPON 전수 production 재추출 (Java Tree-sitter, 대형)
- **보안 후속 2건** (1Password CLI signin + Master Password)

## §8 참조

- AIF-PLAN-073 (이 Sprint Plan)
- Sprint 274 F440 generic-voucher 9번째 (직접 재사용 template)
- Sprint 269 F436 / 264~266 인프라 누적 7 Sprint 연속 (S275로 8 Sprint 연속)
- `scripts/divergence/domain-source-map.ts` DOMAIN_MAP 10 entries
- `packages/utils/src/divergence/bl-detector.ts` BL_DETECTOR_REGISTRY 50 entries
