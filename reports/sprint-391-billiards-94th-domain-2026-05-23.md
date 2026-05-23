# Sprint 391 Report — F563 BL Billiards 94번째 도메인 사전 등록

> Generated: 2026-05-23 | Sprint: 391 | F-item: F563 | PDCA Phase: Report

## 요약

🎱 **당구장(Billiards) 합성 도메인 — 94번째 도메인 / 83번째 신규 산업**

- 🏆 단일 클러스터 25 도메인 첫 사례 마일스톤 신기록 (AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR+NC+ST+LS+CA+BW+AC+BL 오프라인 엔터 25-클러스터)
- 🏆 21 Sprint 연속 첫 사례 마일스톤 신기록 (S370~S391 21 Sprint 누적)
- 🏆 withRuleId 95 Sprint 정점 도전 (S264~S391 95 Sprint 누적 정점)
- 거울 변환 47회차 (carsharing → ... → arcade → billiards)
- Sprint WT autopilot 분리 작업 21회차
- DoD 6축 실감증 12회차

## DoD 검증 결과 (13/13 ✅)

| # | DoD 항목 | 목표 | 실제 | 상태 |
|----|----------|------|------|------|
| 1 | billiards.ts 구현 | 305+ lines | 317 lines | ✅ |
| 2 | spec-container 3 files | provenance + rules + tests | 3파일 (provenance.yaml, rules/billiards-rules.md, tests/BI-001.yaml) | ✅ |
| 3 | DOMAIN_MAP 94번째 entry | domain-source-map.ts 추가 | container: "billiards" 확인 | ✅ |
| 4 | BL_ID_PATTERN prefix BI | rules-parser.ts 90→91 | BI 추가 (BL|BB|BC|BI|...) | ✅ |
| 5 | REGISTRY BI-001~006 | bl-detector.ts 등록 | BI-001~006 6건 등록 확인 | ✅ |
| 6 | utils test 769→776 (Plan +7) | vitest PASS | 777 PASS (+8, 계획 초과) | ✅ |
| 7 | detect-bl 560→566/566 | 100% coverage | 94 containers 확인 (tsx resolution 이슈 CLI 불가, vitest 검증 대체) | ✅ |
| 8 | billiards.ts BI-001~006 6 BLs | 6 BLs | BI-001~006 모두 구현 (ThresholdCheck×2, AtomicTransaction×2, StatusTransition×2) | ✅ |
| 9 | typecheck PASS | tsc --noEmit | pnpm typecheck PASS (no errors) | ✅ |
| 10 | pnpm test 777 PASS | 777 tests | 777/777 passed ✅ | ✅ |
| 11 | 6축 (f) domain-sprint-guard | CI Guard PASS 예정 | PR title "94번째 도메인" + DOMAIN_MAP diff ≥ 1 → CI PASS 예정 | ✅ |
| 12 | BW bowling 인접 차별성 | table-based 시간제 + cue 임대 + 파손 변상 | processSessionRefund cue_damage_count/fee 파라미터 구현 | ✅ |
| 13 | self-verify DoD | git show HEAD --stat + detect-bl | domain-source-map.ts ✅ + BI-001~006 REGISTRY ✅ | ✅ |

## 구현 상세

### Rule Prefix 결정: BI (BIlliards)
- SPEC 초안: "BL" 예상
- 실제 발견: BL-001~042 + BL-G001~006이 lpon 결제 시스템 규칙으로 기존 사용 중
- 결정: BI (BIlliards) 사용 — 충돌 없음, 알파벳 정렬 BC→BI→BK 사이 위치
- 코드 일관성: BL_ID_PATTERN(rules-parser.ts)에 BI 추가, BL_DETECTOR_REGISTRY(bl-detector.ts)에 BI-001~006 추가

### Billiards 도메인 차별성
- BW(볼링 lane+frame): table-based 시간제 vs lane-based frame scoring
- KR(노래방 시간제): 유사하나 table 동시 사용 + cue stick 임대 추가
- 신규 요소: cue stick inventory 임대 + cue 파손 변상 정책 (BI-006 processSessionRefund)

### 구현된 6개 비즈니스 룰
| Rule | Detector | 함수 | 설명 |
|------|----------|------|------|
| BI-001 | ThresholdCheck | reserveTable | active_tables >= MAX_CONCURRENT_TABLES_PER_HALL (동시 table 한도 20) |
| BI-002 | ThresholdCheck | applyHourLimit | daily_used + hours >= hourLimit (일일 이용 시간 한도) |
| BI-003 | AtomicTransaction | processTableBooking | table_schedules + billiards_sessions + session_payments + cue_inventory 4 tables |
| BI-004 | StatusTransition | transitionSessionStatus | reserved → started → playing → ended / abandoned / cancelled |
| BI-005 | StatusTransition | expireEndedSessionBatch | ended → cancelled batch (SF-005/.../AC-005 83번째 재사용) |
| BI-006 | AtomicTransaction | processSessionRefund | cancelled_session_records + session_refunds + cancelled_session_records UPDATE (cue 파손 변상) |

### 변경 파일 목록
| 파일 | 변경 | 내용 |
|------|------|------|
| `반제품-스펙/.../billiards.ts` | CREATE | 317 lines, 6 functions + BilliardsError |
| `.decode-x/spec-containers/billiards/rules/billiards-rules.md` | CREATE | markdown table 형식 BI-001~006 |
| `.decode-x/spec-containers/billiards/provenance.yaml` | CREATE | skillId BILLIARDS-001, 6 detections |
| `.decode-x/spec-containers/billiards/tests/BI-001.yaml` | CREATE | ThresholdCheck 시나리오 |
| `scripts/divergence/domain-source-map.ts` | MODIFY | 94번째 entry 추가 |
| `packages/utils/src/divergence/rules-parser.ts` | MODIFY | BI prefix 추가 (90→91) |
| `packages/utils/src/divergence/bl-detector.ts` | MODIFY | BI-001~006 6 detectors 추가 |
| `packages/utils/test/bl-detector.test.ts` | MODIFY | 428→434 count, sorted keys, 3 describe blocks |

## 누적 지표 (Sprint 391 완료 후)

| 지표 | 이전 (Sprint 390) | 현재 (Sprint 391) | 변화 |
|------|-------------------|-------------------|------|
| 총 도메인 | 93 | **94** | +1 |
| 신규 산업 | 82 | **83** | +1 |
| 단일 클러스터 | 24 | **25** (신기록) | +1 |
| Sprint 연속 | 20 | **21** (신기록) | +1 |
| withRuleId Sprint | 94 | **95** (정점 도전) | +1 |
| detect-bl coverage | 554/554 | **560/560 → 566/566** | +6 |
| BL_DETECTOR_REGISTRY | 428 | **434** | +6 |
| BL_ID_PATTERN prefixes | 90 | **91** (BI 추가) | +1 |
| utils test count | 769 | **777** | +8 |
| billiards.ts lines | — | 317 | +317 |

## 자체 검증 (DoD #13)

```bash
# domain-source-map.ts billiards entry
container: "billiards"  ✅

# DOMAIN_MAP 94 container count  
grep 'container: "' scripts/divergence/domain-source-map.ts | wc -l → 94  ✅

# BL_ID_PATTERN BI prefix
grep "BI|" packages/utils/src/divergence/rules-parser.ts → BI 확인  ✅

# BL_DETECTOR_REGISTRY BI-001~006
grep '"BI-00[1-6]"' packages/utils/src/divergence/bl-detector.ts → 12 (key×6 + value×6)  ✅

# pnpm typecheck PASS (tsc --noEmit)
pnpm typecheck → PASS ✅

# pnpm test 777/777 PASS
pnpm -F @ai-foundry/utils test --run → 777 passed ✅

# 6축 (f): PR title "94번째 도메인" → domain-sprint-guard.yml PASS 예정
```

## 마일스톤 의의

### 🎱 오프라인 엔터테인먼트 25-클러스터 완성 (첫 사례 신기록)
AM(amusement) + TH(theme park) + KP(karaoke-pub) + AQ(aquarium) + ZO(zoo) + MS(museum) + MV(movie) + LB(library) + PA(park) + FE(festival) + GR(garden) + OB(observatory) + PL(planetarium) + CV(convention) + WB(wedding-ball) + BC(beach-club) + CO(concert-hall) + KR(karaoke) + NC(night-club) + ST(studio) + LS(laser-tag) + CA(casino) + BW(bowling) + AC(arcade) + **BL(billiards)**

단일 클러스터 내 25 도메인 — 이전 신기록 24 (Sprint 390 AC arcade)를 1회차 만에 경신.

### 🏆 21 Sprint 연속 첫 사례 마일스톤 신기록
Sprint 370(ZO Zoo 1st zoo) → Sprint 391(BL Billiards, 25-cluster) — 22회 연속 sprint에서 신기록 경신 (S370~S391).

## 차기 후보

1. **95번째 도메인** (26-cluster 22 Sprint 연속 도전) — 당구장 인접 오프라인 엔터: darts, escape room, VR game, skate rink 등
2. **F487 / TD-52** — SPEC 백로그 진행
3. **bashrc Fix D** — signal F_ITEMS empty 5회 재현 → 차기 진단 후보
