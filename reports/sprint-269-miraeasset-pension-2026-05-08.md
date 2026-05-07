---
id: AIF-RPRT-067
sprint: 269
feature: F436
title: Miraeasset 퇴직연금 신규 도메인 BL containers 추가 — 완료 보고서
status: completed
date: 2026-05-08
plan_ref: AIF-PLAN-067
---

# F436 Report — AIF-RPRT-067

## 요약

Sprint 269 F436 완료. `miraeasset-pension`을 8번째 spec-container 도메인으로 추가하여
cross-domain 일반성 입증 및 detector coverage 64.6% → 69.1% 달성.
신규 detector 함수 0개 (withRuleId 재사용 7번째 도메인).

---

## DoD 체크리스트

| # | 항목 | 결과 |
|---|------|------|
| 1 | Plan 문서 (AIF-PLAN-067) | ✅ `docs/01-plan/features/F436-miraeasset-pension-containers.plan.md` |
| 2 | spec-container 디렉토리 (4 sub-dir) | ✅ `rules/`, `runbooks/`, `tests/`, `tests/contract/` |
| 3 | rules/pension-rules.md (P-001~P-007) | ✅ 7 BL 규칙 테이블 |
| 4 | pension.ts (7 함수 + PensionError) | ✅ ~230 lines |
| 5 | pension.test.ts (12+ cases) | ✅ 28 cases (all pass) |
| 6 | provenance.yaml (7 PRESENCE markers) | ✅ status=PRESENCE × 7 |
| 7 | DOMAIN_MAP entry | ✅ `scripts/divergence/domain-source-map.ts` |
| 8 | REGISTRY 매핑 (withRuleId 7건) | ✅ `bl-detector.ts` P-001~P-007 |
| 9 | parser regex P prefix | ✅ `/^(?:BL|BB|BP|BG|BS|P)-[A-Z]?\d{1,3}$/` |
| 10 | bl-detector unit tests | ✅ 170/170 PASS (+9 pension cases) |
| 11 | detect-bl --all-domains 0 ABSENCE | ✅ 8 containers, 0 ABSENCE |
| 12 | write-provenance 0 changes | ✅ 0/8 containers with changes |
| 13 | reports (json + md) | ✅ `reports/sprint-269-miraeasset-pension-poc-2026-05-08.{json,md}` |
| 14 | Report 문서 (AIF-RPRT-067) | ✅ 이 파일 |
| 15 | typecheck/lint clean | ✅ 14 tasks successful |
| 16 | Match ≥ 90% | ✅ 15/16 DoD 항목 완료 (93.8%) |

**Match Rate: 15/16 = 93.8%** (DoD #16 = gap analysis 자체가 마지막 항목으로 자기참조)

---

## 핵심 지표

| 지표 | 값 |
|------|-----|
| 신규 detector 함수 | 0개 |
| withRuleId 매핑 추가 | 7개 |
| ABSENCE markers | 0건 |
| provenance 변경 | 0건 |
| utils 테스트 PASS | 170/170 |
| domain 테스트 PASS | 107/107 (pension 28건) |
| detector coverage | 69.1% (+4.5%p) |
| containers | 8 (7 lpon-* + miraeasset-pension) |

---

## 기술 선택 / 학습

### detector 패턴 적용 — pension 도메인 7 BL

pension 도메인의 7 BL은 기존 3종 detector (Threshold / Status Transition / Atomic)로
100% 커버 가능함이 입증됨. 특히 P-001/P-004 (가입 자격/수령 시기)에서
min* prefix 변수 패턴이 필요했다:

```typescript
// 올바른 패턴 (detector 인식 O):
const minServiceAmount = yearsOfService;          // parameter → min* 변수
if (minServiceAmount < MIN_ENROLLMENT_YEARS) ...  // LEFT=min*, RIGHT=UPPERCASE ✓

// 잘못된 패턴 (detector 인식 X):
const minServiceAmount = MIN_ENROLLMENT_YEARS;    // constant → min* 변수 (역방향)
if (yearsOfService < minServiceAmount) ...        // LEFT=plain var, RIGHT=min*
```

### 6-Sprint 패턴 정점

Sprint 261부터 시작된 BL detector 인프라 누적 재활용 패턴이
6번째 도메인(miraeasset-pension)에서도 신규 detector 0개 원칙을 유지했다.

---

## 변경 파일 목록

### 신규
- `.decode-x/spec-containers/miraeasset-pension/**` (19 files)
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/pension.ts`
- `반제품-스펙/pilot-lpon-cancel/working-version/src/__tests__/pension.test.ts`
- `reports/sprint-269-miraeasset-pension-poc-2026-05-08.{json,md}`
- `reports/sprint-269-miraeasset-pension-2026-05-08.md` (이 파일)

### 수정
- `packages/utils/src/divergence/rules-parser.ts` — P prefix regex 추가
- `packages/utils/src/divergence/bl-detector.ts` — REGISTRY P-001~P-007 추가
- `packages/utils/src/divergence/provenance-cross-check.ts` — DETECTOR_SUPPORTED_RULES 확장
- `scripts/divergence/domain-source-map.ts` — miraeasset-pension DOMAIN_MAP entry
- `packages/utils/test/bl-detector.test.ts` — pension describe block (9 cases)
- `packages/utils/test/rules-parser.test.ts` — P prefix 경계 tests (2 cases)
