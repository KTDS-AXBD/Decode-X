---
id: AIF-PLAN-116
type: plan
status: DONE
sprint: 318
feature: F484
title: Telemedicine 합성 도메인 PoC — 44번째 도메인 / 33번째 신규 산업
session: 293
date: 2026-05-10
mode: Master inline
match_rate: 100
---

# F484 Plan — Telemedicine 합성 도메인 PoC (33번째 신규 산업)

## 배경
세션 292 (Sprint 317 F483) 완결로 **detect-bl coverage 100% (260/260)** 달성 + LPON pilot 5 컨테이너 100% 마일스톤 종결. 차기 후보 3건 중 사용자 결정으로 **신규 산업 33번째 (Telemedicine)** 진행.

`/ax:todo plan` 워크플로우:
- Step 1 작업 현황: 미완료 F-items 8건 (대부분 SPEC drift, 실 활성 0건)
- Step 2~6: 신규 산업 33번째 + 사전 등록 3건 (Sprint 319 VT / Sprint 320 cleanup / F487 F358 Phase 4)

## 목표
33번째 신규 산업 합성 도메인 추가. **HC+PH+TM 의료 3-클러스터 형성** (Healthcare 일반 + Pharmacy 처방 + Telemedicine 원격진료). withRuleId 재사용 패턴 **45 Sprint 연속 정점 유지** (신규 detector 0개).

## 도메인 디자인 — Telemedicine 6 BL

| ID | 패턴 | 함수 | 설명 |
|----|------|------|------|
| TM-001 | Threshold Path A (UPPERCASE) | `bookConsultationSlot` | 진료 슬롯 정원 한도 (`MAX_SLOT_CAPACITY = 30`) |
| TM-002 | Threshold Path B (var-vs-var, `limit` keyword) | `applyPrescriptionLimit` | 환자 구독별 처방 한도 (`prescriptionLimit`) |
| TM-003 | Atomic Transaction | `confirmConsultation` | 진료 예약 atomic (consultations + doctors + payments) |
| TM-004 | Status Transition (matrix) | `transitionConsultationStatus` | booked→in_progress→completed→prescribed→reviewed |
| TM-005 | Status Transition (batch) | `markPrescriptionExpiryBatch` | 만료 처방전 일괄 expired |
| TM-006 | Atomic Transaction | `processBilling` | 진료비 정산 atomic (billing_records + payouts) |

균형 분포: Threshold × 2 + Atomic × 2 + Status × 2 (Beauty/Fitness 패턴 그대로).

## 변경 파일 (15 files)

### A. Source 도메인 (1 file)
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/telemedicine.ts` (~280 lines)

### B. Spec Container (9 files, .decode-x/spec-containers/telemedicine/)
- `provenance.yaml` — 6 BL detection metadata
- `rules/telemedicine-rules.md` — BL 정의 markdown
- `runbooks/TM-001.md ~ TM-006.md` (6 files)
- `tests/TM-001.yaml` — 12 scenarios (PASS/FAIL × 6 BL)

### C. 매핑/탐지 인프라 (3 files)
- `scripts/divergence/domain-source-map.ts` — DOMAIN_MAP 44번째 entry 추가
- `packages/utils/src/divergence/rules-parser.ts` — TM prefix 추가 (BL_ID_PATTERN regex)
- `packages/utils/src/divergence/bl-detector.ts` — REGISTRY TM-001~006 6 entries

### D. 회귀 테스트 (2 files)
- `packages/utils/test/bl-detector.test.ts` — sorted keys + describe block "TM-001~006 registered" + 6 PRESENCE 테스트
- `packages/utils/test/rules-parser.test.ts` — TM-NNN prefix 매칭 테스트

## DoD (12/12 PASS)
1. ✅ telemedicine.ts (~280 lines, 6 함수 + TelemedicineError)
2. ✅ spec-container 9 files (provenance + rules + runbooks 6 + tests 1)
3. ✅ DOMAIN_MAP 44번째 entry (`container: "telemedicine"`)
4. ✅ parser regex `TM` prefix 추가 (BL_ID_PATTERN)
5. ✅ REGISTRY TM-001~006 6 entries (withRuleId × 6)
6. ✅ bl-detector.test.ts sorted keys 갱신 (TC↔TR 사이 TM 삽입)
7. ✅ bl-detector.test.ts describe block "telemedicine domain — TM-001~006 via withRuleId" + 6 PRESENCE 테스트
8. ✅ rules-parser.test.ts TM prefix 매칭 테스트 1건
9. ✅ typecheck PASS (직접 tsc 우회, S337 함정 회피)
10. ✅ utils tests 376 PASS (+8 vs 368)
11. ✅ detect-bl 266/266 = 100% 유지 (44 containers, 33번째 산업 0 ABSENCE)
12. ✅ SPEC §6 Sprint 318 블록 + §5 마지막 실측 갱신

## 메타 학습
- **withRuleId 45 Sprint 연속 정점 유지** (Sprint 264~318) — 신규 detector 0개 패턴 정착
- **의료 3-클러스터 형성** — HC(일반)+PH(처방)+TM(원격) 의료 segment 분리 입증
- **합성 도메인 부트스트래핑 정점** — beauty/fitness 패턴 그대로 복제로 ~30분 1 산업 추가
- **Master inline 15회 연속 회피 패턴 유지** (S253~S318)
- **사전 fs 실측 절차** (rules/development-workflow.md S283) — beauty.ts 패턴 검증 후 telemedicine 디자인 도출, hallucination 0건

## 차기 후보
- Sprint 319 F485 — Veterinary (VT) 34번째 신규 산업 (PT+VT 동물 케어 클러스터)
- Sprint 320 F486 — SPEC drift cleanup (4 stale F-items 정합화)
- F487 — F358 Phase 4 LPON 전수 production 재추출 (별도 Sprint Plan 작성 필요)
- 보안 후속 2건 — 1Password CLI signin + MP 변경 (사용자 콘솔 작업)
