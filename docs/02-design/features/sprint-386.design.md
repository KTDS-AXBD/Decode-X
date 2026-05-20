---
id: AIF-DSGN-237
title: Sprint 386 Design — F558 ST Studio 89번째 도메인
type: design
status: active
created: "2026-05-20"
updated: "2026-05-20"
author: autopilot
sprint: 386
feature: F558
related:
  - AIF-PLAN-237 (Sprint 386 Plan)
  - AIF-DSGN-236 (Sprint 385 NC Night club)
---

# Sprint 386 Design — F558 ST Studio 89번째 도메인

**Sprint**: 386 / **F-item**: F558 / **Domain**: ST Studio (다용도 스튜디오 산업, 78번째 신규 산업)

---

## §1 개요

오프라인 엔터 20-클러스터 확장. ST Studio는 음악녹음/사진촬영/댄스연습/동영상촬영 통합 공간으로,
KR(노래방), NC(나이트클럽)과 인접하지만 전문 장비 임대 + 시간제 패키지 + B2B/B2C 복합 모델로 차별된다.

---

## §2 비즈니스 룰 매핑

| ID | 함수 | detector | 패턴 |
|----|------|----------|------|
| ST-001 | `reserveSlot` | ThresholdCheck | Path A (var-vs-UPPERCASE, MAX_CONCURRENT_SLOTS_PER_STUDIO) |
| ST-002 | `applyEquipmentLimit` | ThresholdCheck | Path B (var-vs-var, equipmentLimit keyword) |
| ST-003 | `processSlotBooking` | AtomicTransaction | studio_slots + equipment_schedules + slot_payments |
| ST-004 | `transitionSlotStatus` | StatusTransition | reserved→ongoing→ended/closed/cancelled |
| ST-005 | `expireClosedSlotBatch` | StatusTransition | batch closed→ended |
| ST-006 | `processSlotRefund` | AtomicTransaction | cancelled_fee_records + slot_refunds |

---

## §3 파일 목록

### 신규 파일
| 파일 | 설명 |
|------|------|
| `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/studio.ts` | 도메인 소스 (305+ lines) |
| `.decode-x/spec-containers/studio/provenance.yaml` | provenance 메타 |
| `.decode-x/spec-containers/studio/rules/studio-rules.md` | 비즈니스 룰 (markdown table) |
| `.decode-x/spec-containers/studio/tests/ST-001.yaml` | 테스트 시나리오 |

### 수정 파일
| 파일 | 변경 내용 |
|------|----------|
| `scripts/divergence/domain-source-map.ts` | DOMAIN_MAP 89번째 entry 추가 |
| `packages/utils/src/divergence/rules-parser.ts` | BL_ID_PATTERN ST prefix 추가 (85→86) |
| `packages/utils/src/divergence/bl-detector.ts` | ST-001~006 detectors 추가 |
| `packages/utils/test/bl-detector.test.ts` | 5축 테스트 추가 |

---

## §4 테스트 계획

### utils test 5축
1. count: `exposes 398 detectors` → `exposes 404 detectors`
2. sorted keys: ST-001~006 (SP-006 다음, TC-001 앞)
3. registered: ST-001~006 isDefined
4. PRESENCE: ST-001~006 각 1 marker
5. findDomainMapping('studio') defined

### detect-bl
- 530/530 (88 containers) → 536/536 (89 containers)
- studio: 6 BLs, 6 applicable detectors, 0 ABSENCE

---

## §5 Worker 파일 매핑

단일 Worker — 모든 구현을 순차 수행:
1. studio.ts 신규 생성
2. spec-container 3 files 신규 생성
3. domain-source-map.ts 수정 (DOMAIN_MAP entry)
4. rules-parser.ts 수정 (ST prefix)
5. bl-detector.ts 수정 (ST-001~006)
6. bl-detector.test.ts 수정 (5축)

---

## §6 DoD 검증 매트릭스

| # | 항목 | 검증 방법 |
|---|------|----------|
| 1 | studio.ts 305+ lines + 6 함수 + StudioError | wc -l + grep |
| 2 | spec-container 3 files | ls |
| 3 | DOMAIN_MAP 89번째 entry | grep studio domain-source-map.ts |
| 4 | parser ST prefix (85→86) | grep ST rules-parser.ts |
| 5 | REGISTRY ST-001~006 | grep ST bl-detector.ts |
| 6 | utils test 5축 | pnpm -F @ai-foundry/utils test --run |
| 7 | utils 729+N PASS | test count |
| 8 | tsc PASS | npx tsc --noEmit |
| 9 | detect-bl 536/536 | npx tsx detect-bl.ts --all-domains |
| 10 | Match ≥ 95% | gap analysis |
| 11 | PR + CI 3/3 green | GitHub Actions |
| 12 | auto-merge | task-daemon |
| 13 | 자체 검증 | git show HEAD --stat |
