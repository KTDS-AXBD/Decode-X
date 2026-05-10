---
id: AIF-DESIGN-108
sprint: 310
feature: F476
title: Pet Services 40번째 도메인 신규 (반려동물 산업, 29번째 신규 산업)
status: active
plan: AIF-PLAN-108
created: 2026-05-10
---

# F476 Design — AIF-DESIGN-108

## §1 개요

40번째 도메인 반려동물(Pet Services) 신규 — **29번째 신규 산업** (`..+PT`).
Wellness 패턴(Sprint 309 F475)을 반려동물 특화 변환.
동물병원+미용 클러스터 (HC + WL 인접). 38 Sprint 연속 정점 (withRuleId 재사용).

## §2 BL 정의

| BL | 영역 | Detector | 함수 |
|----|------|----------|------|
| PT-001 | boarding capacity — 펫호텔 정원 한도 | ThresholdCheck (Path A, MAX_BOARDING_CAPACITY) | `bookBoarding()` |
| PT-002 | vaccination quota — 백신 한도 비교 | ThresholdCheck (Path B, var-vs-var, vaccinationLimit) | `applyVaccination()` |
| PT-003 | grooming atomic — 예약 + 패키지 + 보호자 매칭 | AtomicTransaction | `processGrooming()` |
| PT-004 | care status transition — booked→checked_in→in_care→checked_out→reviewed | StatusTransition | `transitionCareStatus()` |
| PT-005 | health record batch — 건강 기록 일괄 처리 | StatusTransition (CC-005 29번째 재사용) | `markHealthRecordBatch()` |
| PT-006 | emergency atomic — 응급 + 처치 + 보호자 통보 | AtomicTransaction | `processEmergency()` |

**BL 균형**: Threshold × 2 + Atomic × 2 + Status × 2 (30번째 round 마일스톤)

## §3 파일 매핑

| 파일 | 변경 | 내용 |
|------|------|------|
| `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/pet.ts` | 신규 | ~280 lines, 6 함수 + PetError |
| `.decode-x/spec-containers/pet/provenance.yaml` | 신규 | 출처 + detection 결과 |
| `.decode-x/spec-containers/pet/rules/pet-rules.md` | 신규 | BL 요약 표 |
| `.decode-x/spec-containers/pet/rules/PT-001~006.md` | 신규 × 6 | 개별 BL 상세 |
| `.decode-x/spec-containers/pet/runbooks/PT-001~006.md` | 신규 × 6 | 운영 절차 |
| `.decode-x/spec-containers/pet/tests/PT-001.yaml` | 신규 | 대표 시나리오 |
| `packages/utils/src/divergence/bl-detector.ts` | 수정 | PT-001~006 REGISTRY 추가 |
| `packages/utils/src/divergence/rules-parser.ts` | 수정 | PT prefix 추가 (longer match first) |
| `scripts/divergence/domain-source-map.ts` | 수정 | pet DOMAIN_MAP 40번째 추가 |
| `packages/utils/test/bl-detector.test.ts` | 수정 | 219→225 count + PT-001~006 tests |

## §4 검증 기준

- `pnpm typecheck --force` PASS
- `pnpm test` 325 PASS (utils 319+6)
- `detect-bl --all-domains` pet 6 BLs 모두 PRESENCE, coverage ≥ 93%
- 29 산업 연속 0 ABSENCE
