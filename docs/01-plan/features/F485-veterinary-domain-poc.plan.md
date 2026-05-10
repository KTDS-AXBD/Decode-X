---
id: AIF-PLAN-117
type: plan
status: DONE
sprint: 319
feature: F485
title: Veterinary 합성 도메인 PoC — 45번째 도메인 / 34번째 신규 산업
session: 294
date: 2026-05-11
mode: Master inline
match_rate: 100
---

# F485 Plan — Veterinary 합성 도메인 PoC (34번째 신규 산업)

## 배경
세션 293 (Sprint 318 F484) 완결로 **Telemedicine 33번째 신규 산업 추가** + **HC+PH+TM 의료 3-클러스터 형성**. detect-bl 266/266 = 100.0% 유지. 차기 후보 3건 중 사용자 결정으로 **Sprint 319+320 순차 Pipeline** 진행 — Sprint 319는 F485 Veterinary, Sprint 320은 F486 docs-only.

`/ax:todo plan` 워크플로우 (세션 294, 2026-05-11):
- Step 1 작업 현황: 사전 등록 3건 (F485 / F486 / F487)
- Step 2~6: Sprint 319+320 순차 Pipeline 결정 (SPEC.md 영역 충돌 회피)

## 목표
34번째 신규 산업 합성 도메인 추가. **PT+VT 동물 케어 2-클러스터 형성** (Pet Services 일반 + Veterinary 진료). withRuleId 재사용 패턴 **46 Sprint 연속 정점 도전** (신규 detector 0개).

## 도메인 디자인 — Veterinary 6 BL

| ID | 패턴 | 함수 | 설명 |
|----|------|------|------|
| VT-001 | Threshold Path A (UPPERCASE) | `bookAppointmentSlot` | 진료 예약 슬롯 정원 한도 (`MAX_APPOINTMENT_CAPACITY = 20`) |
| VT-002 | Threshold Path B (var-vs-var, `limit` keyword) | `applyVaccineLimit` | 반려동물 구독별 백신 한도 (`vaccineLimit`) |
| VT-003 | Atomic Transaction | `confirmAppointment` | 진료 예약 atomic (appointments + veterinarians + appointment_payments) |
| VT-004 | Status Transition (matrix) | `transitionAppointmentStatus` | scheduled→in_progress→completed→billed→reviewed |
| VT-005 | Status Transition (batch) | `markMedicalRecordArchiveBatch` | 만료 의무기록 일괄 archived |
| VT-006 | Atomic Transaction | `processVeterinaryBilling` | 동물병원 정산 atomic (vet_billing_records + vet_payouts) |

균형 분포: Threshold × 2 + Atomic × 2 + Status × 2 (Beauty/Fitness/Telemedicine 패턴 그대로).

## 변경 파일 (15 files)

### A. Source 도메인 (1 file)
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/veterinary.ts` (~280 lines)

### B. Spec Container (9 files, .decode-x/spec-containers/veterinary/)
- `provenance.yaml` — 6 BL detection metadata
- `rules/veterinary-rules.md` — BL 정의 markdown
- `runbooks/VT-001.md ~ VT-006.md` (6 files)
- `tests/VT-001.yaml` — 12 scenarios (PASS/FAIL × 6 BL)

### C. 매핑/탐지 인프라 (3 files)
- `scripts/divergence/domain-source-map.ts` — DOMAIN_MAP 45번째 entry 추가
- `packages/utils/src/divergence/rules-parser.ts` — VT prefix 추가 (BL_ID_PATTERN regex)
- `packages/utils/src/divergence/bl-detector.ts` — REGISTRY VT-001~006 6 entries

### D. 회귀 테스트 (2 files)
- `packages/utils/test/bl-detector.test.ts` — sorted keys + describe block "VT-001~006 registered" + 6 PRESENCE 테스트
- `packages/utils/test/rules-parser.test.ts` — VT-NNN prefix 매칭 테스트

## DoD (12/12 PASS)
1. ✅ veterinary.ts (~280 lines, 6 함수 + VeterinaryError)
2. ✅ spec-container 9 files (provenance + rules + runbooks 6 + tests 1)
3. ✅ DOMAIN_MAP 45번째 entry (`container: "veterinary"`)
4. ✅ parser regex `VT` prefix 추가 (BL_ID_PATTERN)
5. ✅ REGISTRY VT-001~006 6 entries (withRuleId × 6)
6. ✅ bl-detector.test.ts sorted keys 갱신 (V-006↔WL-001 사이 VT 삽입)
7. ✅ bl-detector.test.ts describe block "veterinary domain — VT-001~006 via withRuleId" + 6 PRESENCE 테스트
8. ✅ rules-parser.test.ts VT prefix 매칭 테스트 1건
9. ✅ typecheck PASS (직접 tsc 우회, S337 함정 회피)
10. ✅ utils tests 384 PASS (+8 vs 376)
11. ✅ detect-bl 272/272 = 100% 유지 (45 containers, 34번째 산업 0 ABSENCE)
12. ✅ SPEC §6 Sprint 319 블록 + §5 마지막 실측 갱신

## 메타 학습
- **withRuleId 46 Sprint 연속 정점 도전** (Sprint 264~319) — 신규 detector 0개 패턴 정착
- **동물 케어 2-클러스터 형성** — PT(pet services 일반)+VT(veterinary 진료) 동물 segment 분리 입증
- **합성 도메인 부트스트래핑 정점** — beauty/fitness/telemedicine 패턴 그대로 복제로 ~30분 1 산업 추가
- **Master inline 16회 연속 회피 패턴 도전** (S253~S319)
- **사전 fs 실측 절차** (rules/development-workflow.md S283) — telemedicine.ts 패턴 검증 후 veterinary 디자인 도출, hallucination 0건

## 차기 후보
- Sprint 320 F486 — SPEC drift cleanup (4 stale F-items 정합화, docs-only ~10분, 본 세션 연속 진행)
- F487 — F358 Phase 4 LPON 전수 production 재추출 (별도 Sprint Plan 작성 필요)
- 보안 후속 2건 — 1Password CLI signin + MP 변경 (사용자 콘솔 작업)
