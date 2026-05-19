---
id: AIF-PLAN-237
title: Sprint 386 Plan — F558 ST Studio 89번째 도메인
type: plan
status: active
created: "2026-05-20"
updated: "2026-05-20"
author: master
sprint: 386
feature: F558
related:
  - AIF-PLAN-230 (Sprint 379 6축 (f) CI Guard 도입)
  - AIF-PLAN-235 (Sprint 384 KR Karaoke, rules/ 승격 트리거)
  - AIF-PLAN-236 (Sprint 385 NC Night club, rules/ 정착 검증)
---

# Sprint 386 Plan — F558 ST Studio 89번째 도메인

**Sprint**: 386 / **F-item**: F558 / **Domain**: ST Studio (다용도 스튜디오 산업, 78번째 신규 산업)
**Session**: 세션 309 / **Date**: 2026-05-20
**의존성**: Sprint 385 MERGE 선행 — S380 ✅ → S381 → S382 → S383 → S384 → S385 → S386 순차 Pipeline

---

## 목표

오프라인 엔터 20-클러스터 확장 (...NC+**ST**).
🎬 **단일 클러스터 20 도메인 첫 사례 round 마일스톤 신기록** + **16 Sprint 연속 첫 사례 마일스톤 신기록**.
🏆 **withRuleId 90 Sprint 정점 round 마일스톤** (S264~S309 90 Sprint 누적 정점).
거울 변환 42회차.
6축 (f) CI Guard 7회차 (S380~S385 6회 정착 후 7회차 — 정착 완성 검증).

---

## 도메인 비즈니스 룰 (ST-001 ~ ST-006)

ST 차별성: KR(노래방 프라이빗 룸 1-3시간) + NC(나이트클럽 야간 입장권) 인접하되 **녹음 + 사진 + 댄스 + 동영상 워 임대 + 장비 임대 + 시간제 + 패키지 수세** (B2B/B2C 전문 제작용 공간 — 음악녹음/사진촬영/댄스연습/동영상촬영 통합).

| ID | 함수 | detector |
|----|------|----------|
| ST-001 | `reserveSlot` | ThresholdCheck (Path A, MAX_CONCURRENT_SLOTS_PER_STUDIO) |
| ST-002 | `applyEquipmentLimit` | ThresholdCheck (Path B, equipmentLimit) |
| ST-003 | `processSlotBooking` | AtomicTransaction (studio_slots + equipment_schedules + slot_payments) |
| ST-004 | `transitionSlotStatus` | StatusTransition (reserved → ongoing → ended/closed/cancelled) |
| ST-005 | `expireClosedSlotBatch` | StatusTransition (batch) |
| ST-006 | `processSlotRefund` | AtomicTransaction (cancelled_fee_records + slot_refunds, 패키지 환불 정책) |

---

## 구현 범위

### 신규 파일
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/studio.ts` (305+ lines)
- `.decode-x/spec-containers/studio/{provenance.yaml, rules/studio-rules.md, tests/ST-001.yaml}`

### 수정 파일 (S385 baseline 후)
- `scripts/divergence/domain-source-map.ts` — DOMAIN_MAP 89번째
- `packages/utils/src/divergence/rules-parser.ts` — ST prefix (85→86)
- `packages/utils/src/divergence/bl-detector.ts` — ST-001~006
- `packages/utils/test/bl-detector.test.ts` — 5축

---

## DoD 13/13

1. studio.ts 305+ + 6 함수 + StudioError
2. spec-container 3 files
3. **DOMAIN_MAP 89번째 entry** — autopilot + 6축 (f) CI Guard 이중
4. parser ST prefix (85→86)
5. REGISTRY ST-001~006 (withRuleId × 6)
6. utils test 5축 (count 398→404, sorted+registered+PRESENCE+findDomainMapping)
7. utils 723 → 730 PASS (+7)
8. `npx tsc --noEmit` PASS
9. detect-bl 530 → 536/536 = 100.0%
10. Match ≥ 95%
11. PR + CI 3/3 green + domain-sprint-guard PASS = 6축 (f) 7회차
12. auto-merge
13. 자체 검증

---

## 사전 audit (S283 42회차)

ST prefix 충돌 0건 — BL_ID_PATTERN 85 prefix 전수 + DOMAIN_MAP 88 entry 전수 (S385 후 가정) + studio.ts 미존재 + spec-containers/studio 미존재 4축 확정.

---

## 메타 — 트리플 round 마일스톤 + 6축 (f) 정착 완성

본 Sprint는 동시에 3개 round 마일스톤 + 6축 (f) 7회차 정착 완성:

1. 🏆 **단일 클러스터 20 도메인 round 마일스톤** (직전 19 갱신, 단일 cluster 첫 round)
2. 🏆 **withRuleId 90 Sprint 정점 round 마일스톤** (S264~S309 90 Sprint 누적 정점)
3. 🏆 **89번째 도메인** (17.8배 확장, 90th 도메인까지 1개 남음)
4. 🏆 16 Sprint 연속 첫 사례 신기록 (직전 15 갱신)
5. 🎯 **6축 (f) CI Guard 7회차 정착 완성** (S380~S385 6회 + S386 7회차 → 거버넌스 표준 확정)

차기:
- 90번째 도메인 round 마일스톤 도전 (Sprint 387 F559)
- 6축 (f) 정착 후 rules/ 본문 정식 승격 검토
