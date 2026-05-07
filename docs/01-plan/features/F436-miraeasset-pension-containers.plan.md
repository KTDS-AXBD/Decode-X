---
id: AIF-PLAN-067
sprint: 269
feature: F436
title: Miraeasset 퇴직연금 신규 도메인 BL containers 추가
status: active
estimated_hours: 5
created: 2026-05-08
req: AIF-REQ-035
---

# F436 Plan — AIF-PLAN-067

## 목표

`.decode-x/spec-containers/`에 신규 도메인 **miraeasset-pension** 추가. lpon-* 7 도메인에 이어 8번째 도메인 cross-domain 일반성 입증 + F418 신규 inference exception 자연 채움 production scale 검증.

## 배경

- Sprint 261~266 6 Sprint 연속 spec-only 0건 도달. 7 lpon-* containers source 활성화 100% (Sprint 266 F433).
- `withRuleId` 재사용 6번째 도메인 패턴 (Sprint 264~266) — 신규 detector 0개로 BL coverage 확장.
- D1 production 2,827 Miraeasset policies + chunks 2건 PoC 완료 (세션 265 Smoke 1건 → exception 자연 채움 5/8=62.5% 입증).
- F418 신규 inference 효과는 **신규 도메인 ingestion**에서 자연 발현 (AIF-REQ-043 PARTIAL_FAIL 정량 DoD 자연 누적 측정 동시 진행).
- F356-B 자연 누적 효과 production scale 검증 동시 가능.

## DoD

| # | 항목 | 기준 |
|---|------|------|
| 1 | Plan 문서 (AIF-PLAN-067) | 이 파일 ✅ |
| 2 | spec-container 디렉토리 | `.decode-x/spec-containers/miraeasset-pension/` + `rules/`, `runbooks/`, `tests/`, `tests/contract/` 4 sub-dir |
| 3 | rules.md | `rules/pension-rules.md` — BL 핵심 5~10건 (예: BL-P001 가입 자격 검증 / BL-P002 적립 한도 / BL-P003 중도인출 사유 / BL-P004 수령 시기 / BL-P005 세제 우대) |
| 4 | source.ts | `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/pension.ts` — 5 함수 + PensionError class. 신규 detector 0개 목표 (withRuleId 재사용) |
| 5 | tests | `working-version/test/pension.test.ts` — in-memory better-sqlite3, BL 매핑 cases 12+ (각 BL × happy + edge) |
| 6 | provenance.yaml | `.decode-x/spec-containers/miraeasset-pension/provenance.yaml` — markers 명시 (BL ID + sourceFile/sourceFunction + status PRESENCE) |
| 7 | DOMAIN_MAP entry | `scripts/divergence/domain-source-map.ts` — miraeasset-pension entry 추가 (sourceCodeStatus="present", underImplTargets 5 함수) |
| 8 | REGISTRY 매핑 | `packages/utils/src/divergence/bl-detector.ts` BL_DETECTOR_REGISTRY + DETECTOR_SUPPORTED_RULES 확장 (withRuleId 재사용, 신규 detector 0개) |
| 9 | parser regex 확장 | `packages/utils/src/divergence/rules-parser.ts` BL prefix 확장 — `/^(?:BL|BB|BP|BG|BS|P)-[A-Z]?\d{1,3}$/` (P prefix 추가) + 회귀 0 |
| 10 | bl-detector unit tests | working-version utils 159 → 165+ PASS |
| 11 | detect-bl --all-domains | 8 containers 일괄 PASS + 신규 BL 100% PRESENCE (0 ABSENCE markers) |
| 12 | provenance write-provenance --apply | 8 containers 0 changes (PRESENCE 자동 입증) |
| 13 | reports | `reports/sprint-269-miraeasset-pension-poc-2026-05-08.{json,md}` |
| 14 | Report 문서 (AIF-RPRT-067) | `reports/sprint-269-miraeasset-pension-2026-05-08.md` |
| 15 | typecheck/lint clean | `pnpm typecheck && pnpm lint` 오류 0 |
| 16 | Match ≥ 90% | Gap analysis 통과 |

## 구현 범위

### 신규 파일
- `.decode-x/spec-containers/miraeasset-pension/rules/pension-rules.md`
- `.decode-x/spec-containers/miraeasset-pension/provenance.yaml`
- `.decode-x/spec-containers/miraeasset-pension/runbooks/<BL-ID>.md` × 5~10
- `.decode-x/spec-containers/miraeasset-pension/tests/<BL-ID>.yaml` × 5~10
- `.decode-x/spec-containers/miraeasset-pension/tests/contract/pension-contract.yaml`
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/pension.ts` (≈220 lines, 5 함수 + PensionError)
- `반제품-스펙/pilot-lpon-cancel/working-version/test/pension.test.ts` (≈250 lines, 12+ cases)
- `reports/sprint-269-miraeasset-pension-poc-2026-05-08.{json,md}`
- `reports/sprint-269-miraeasset-pension-2026-05-08.md`

### 수정 파일
- `scripts/divergence/domain-source-map.ts` — miraeasset-pension entry 추가
- `packages/utils/src/divergence/bl-detector.ts` — REGISTRY 확장 (withRuleId 재사용)
- `packages/utils/src/divergence/rules-parser.ts` — P prefix regex 확장 (회귀 0 검증)
- `packages/utils/test/rules-parser.test.ts` — boundary tests +2 (P prefix accept + 기존 38+10 BL 매칭 유지)
- `packages/utils/test/bl-detector.test.ts` — pension cases 추가 (5~10)

## 4-Step 실행

| Step | 시간 | 작업 |
|------|------|------|
| 1 | 1h | spec-container 디렉토리 + rules.md + provenance.yaml 작성 (D1 chunks 2건 PoC + 2,827 policies 참조하여 BL 5~10건 추출) |
| 2 | 1.5h | source.ts pension.ts 5 함수 + PensionError + tests 12+ cases (in-memory better-sqlite3) |
| 3 | 1h | DOMAIN_MAP + REGISTRY + parser regex 확장 + 단위 테스트 + detect-bl --all-domains 검증 |
| 4 | 1.5h | Reports + Plan/Design SPEC 갱신 + commit (autopilot 자동) |

## 검증 시나리오

- **bl-detector**: pension cases 5~10 PASS (각 BL withRuleId 매핑 verifyDetector)
- **detect-bl --all-domains**: 8 containers (lpon-* 7 + miraeasset-pension 1) 일괄 실행 → 신규 BL 100% PRESENCE + ABSENCE markers 0건
- **provenance apply**: write-provenance --all-domains --apply 0 changes (PRESENCE 자동 입증, 신규 detector 0개 목표 부합)
- **parser regex 회귀**: P prefix 매칭 + 기존 38+10 BL 매칭 모두 유지

## 사용자 결정 (사전)

- 도메인 = **Miraeasset 퇴직연금** (세션 282 사용자 확정 — D1 production 2,827 policies + chunks 2건 PoC 완료)
- 모드 = **Sprint Pipeline 자동** (Sprint 270 F437과 Batch 1 병렬)
- BL Coverage = **핵심 5~10건** (autopilot이 D1 chunks 2건 + production 2,827 policies sample 참조하여 추출)

## 리스크 / 대응

- **R1**: Miraeasset 도메인 BL이 lpon보다 비즈니스 복잡도 高 → withRuleId 재사용 패턴 부적합 가능성
  - **대응**: 4 Step 1단계 rules.md 작성 시 lpon-* 5종 detector(Threshold/Status transition/Atomic transaction)로 매핑 가능 BL만 source PoC 활성화. 매핑 불가 BL은 spec-only 유지 (rules.md만 작성). 후속 Sprint에서 신규 detector 추가 가능.
- **R2**: D1 chunks 2건만으로 BL 추출 부족
  - **대응**: 2,827 production policies sample 50건 추가 분석 (autopilot 30분 sample → BL pattern 추출). source PoC는 5~10 BL로 시작.
- **R3**: 회귀 — 기존 7 lpon-* containers detect-bl 영향
  - **대응**: parser regex 확장 회귀 tests +2건 (boundary). DOMAIN_MAP entry 추가는 isolated.

## 참조

- AIF-REQ-035 Phase 3 본 개발
- AIF-REQ-043 F418 (PolicyCandidateSchema exception 신규 inference 효과 자연 검증)
- Sprint 266 F433 (`docs/01-plan/features/F433-budget-purchase-poc.plan.md`) — withRuleId 재사용 5/6번째 패턴
- Sprint 265 F432 (settlement source PoC) — 4번째 도메인
- 세션 265 Smoke (`feedback_f418_new_inference_validation.md`) — Miraeasset chunks 2건 exception 5/8=62.5% 입증
