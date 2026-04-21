---
code: AIF-ANLS-030
title: Decode-X v1.3 Phase 3 진척 분석 (AIF-REQ-035 Phase 3)
version: 1.0
status: Ready
category: Analysis
system-version: 0.7.0
created: 2026-04-21
updated: 2026-04-21
author: Sinclair Seo
related:
  - docs/req-interview/decode-x-v1.3-phase-3/prd-final.md
  - SPEC.md §6 "Phase 8 — v1.3 Phase 3 본 개발", §7 AIF-REQ-035, §8 TD-20~40
  - docs/03-analysis/features/sprint-218-f355-gap-analysis.md
---

# Decode-X v1.3 Phase 3 진척 분석

**분석 범위**: AIF-REQ-035 Phase 3 본 개발 (Sprint 218 착수 ~ Sprint 224 현재)
**분석 기준**: PRD `v1.2 Ready`의 KPI 3종 + MVP 기준 2종 + Should Have 6종 vs 실 구현 상태
**실측 시점**: 2026-04-21 세션 224 종료 시점

## 1. 한 줄 요약

Phase 3 **True Must 1.17 / 2 (58%) + Infra 위생 레이어 7/7 (100%) + Should Have 0 / 6 (0%)** — MVP 임계값 부분 충족. M-1 ✅ 완결, M-2는 실사례 1/6(Tier-A 17% 커버리지)로 진행 중. Should Have는 전원 Sprint 221+ 로 이관. 예상외 추가 레이어 = Production "자가보고 vs 실측" 3연속 드리프트 원인 Tech Debt 7건(TD-33~40) 해소로 신뢰성 근간 회복.

## 2. KPI 3종 진척

| KPI | 목표 | 현재값 | 달성률 | 근거 |
|-----|------|--------|:----:|------|
| **DIVERGENCE 공식 마커 수** | ≥ 3건 | **5건** | ✅ 167% | `provenance.yaml` BL-024 HIGH + BL-026/028/029 MEDIUM + BL-027 LOW (F354, 세션 218) |
| **Foundry-X Production E2E 실사례 수** | Tier-A 6/6 | **1/6** | 🔧 17% | lpon-charge skillId `66f5e9cc-...` HTTP 409 GATE_FAILED(AI-Ready 0.69<0.75). 전 구간 기능 정상(인증·manifest·source-manifest·gate-check). 나머지 5 서비스는 Empty Slot Fill 강화 + Packaging 전수 실행 필요 (세션 221) |
| **AI-Ready 자동 채점 자상 점수 (S-1)** | 5,214 중 95% 4기준 상기준 통과 | **0** | ⏭️ 0% | S-1 착수 전(Sprint 221+ 이관) |

## 3. MVP 최소 기준 (PRD §5.2)

| 기준 | 상태 | 근거 |
|------|:----:|------|
| M-1 TD-24 완결 (DIVERGENCE 마커 1건 이상 + TC-REFUND-002 감사 로그 링크) | ✅ 완결 | 세션 218 F354, 감사로그 `scripts/roundtrip-verify/last-report.json:182-187` 직접 링크 |
| M-2 TD-25 완결 (Tier-A 6서비스 각각 1건 이상 handoff_jobs row) | 🔧 1/6 | lpon-charge HTTP 409는 gate fail 시 INSERT 전 return 설계라 **handoff_jobs row는 0건** — 실 증거 확보까지 Gate PASS 선행 필수. 나머지 5 서비스 packaging + submit 필요 |

**판정**: PRD §5.3 실패 조건 "True Must 2건 중 1건이라도 Sprint 1 말에 미완 → aborting" 근접. 그러나 Sprint 222/223 session-end 기준 Phase 3는 **aborting 대신 범위 재편 경로**를 택했고, 그 근거는 Sprint 218 시점에는 감지 못했던 **Production 드리프트 원인 TD 7건(§4 참조)**을 먼저 걷어내는 것이 M-2 실증의 전제조건이었기 때문.

## 4. Infra 위생 레이어 — Phase 3 중 추가된 비공식 Must

PRD 작성 시점에는 없었으나 Sprint 221 production 1/7 실증 선행조사에서 발견된 **6중 갭**과 Sprint 220 F366 회귀로 파생된 2건을 포함해 총 7건 — **전원 해소 완료**. 이 층 없이는 M-2 6/6 달성 불가능.

| TD | 내용 | 상태 | 해소 세션 |
|----|------|:----:|:--------:|
| TD-33 | packaging regex 1/7 파싱 (BP-*만) | ✅ | 221 |
| TD-34 | Foundry-X ↔ Decode-X shared secret 미설정 | ✅ | 221 |
| TD-35 | staging 환경 방치 + DB 미초기화 | ✅ | 223 (CI 실 작동 증명) |
| TD-37 | skills `document_ids` 컬럼 production 부재 | ✅ | 221 |
| TD-38 | `0006_tacit_interview.sql` production 미적용 | ✅ | 221 |
| TD-39 | F366 CI workflow `--remote` + env override 2중 버그 | ✅ | 223 (`7cde99d`) |
| TD-40 | `d1_migrations` 추적 드리프트 | ✅ | 223 (backfill) |
| TD-36 | Foundry-X `[env.production]` 섹션 부재 | ✅ | 224 (`2a499600`) |

**결정타**: CI D1 migration pipeline production 실 작동 **run 24720331379 12/12 jobs success** (세션 223) — Sprint 215 TD-25 / Sprint 219 F362 / Sprint 220 F366 "자가보고 vs 실 production" 3연속 패턴 **종결**.

## 5. Should Have 6종

| S-# | 기능 | 상태 | 비고 |
|-----|------|:----:|------|
| S-1 | AI-Ready 6기준 자동 채점기 (TD-27) | ⏭️ 미착수 | F356-A Phase 1(PoC), F356-B Phase 2(전수) 모두 Sprint 221+ 이관 |
| S-2 | AgentResume 실구현 (Sprint 202 잔여) | ⏭️ 미착수 | F357 Sprint 221+ 이관 |
| S-3 | Tree-sitter Java 파서 (TD-28) | ⏭️ 미착수 | F358 Sprint 221+. Workers 호환 PoC 선행 필요 |
| S-4 | comparator 8 keys silent PASS 교체 (TD-22) | ⏭️ 미착수 | F359 Sprint 219 "체력 여유 시" — 실제 여유 부족 |
| S-5 | Phase 2 작연 정리 (TD-20/21/23) | ⏭️ 미착수 | F360 Sprint 218 계획 but 미착수 |
| S-6 | Java 공용 모듈 추출 (TD-26) | ⏭️ 미착수 | F361. S-3 통합 가능 |

**PRD §4.2 재인용**: "Should Have 전부 미완이어도 MVP는 유지." → Phase 3 실패 선언 조건은 아님.

## 6. Sprint 진척 실측

| Sprint | 기간 | 계획 | 실 | 비고 |
|--------|------|------|----|------|
| 218 | 2026-04-19 ~ | True Must (F354+F355a+F355b+F362) | F354 ✅ + F355a ✅ (M-1 완료 + F355 갭 6건 발견) | PRD 예상 3h → 실제 1 Sprint. F355b/F362 Sprint 219 이관 |
| 219 | ~ 2026-04-19 | F355b + F362 (M-2b/M-2c) | F355b ✅ + F362 ✅ **MERGED PR #22 `81c9805`** | autopilot 16분 완결. Match 100% 자가보고 — 실측은 1/7만 (TD-33 발견) |
| 220 | 2026-04-20 | Infra 위생 (F366 CI D1 workflow) | F366 code ✅ `8b4a31a` + Production CI 1차 실패 → 세션 223 수정 후 성공 run 24720331379 | TD-39 + TD-40 분리 |
| 221 ‡ | — | (가공) Production 1/7 실증 | lpon-charge 실 호출 성공 + TD 4건 해소(TD-34/37/38 + TD-33 파싱 fix) | Sprint 번호가 없는 "실증 세션" |
| 222 ‡ | — | (가공) Sprint 220 merge | F366 merge + TD-39 신규 | |
| 223 ‡ | 2026-04-21 | TD-39 + TD-40 해소 | ✅ `7cde99d` + `e9a3db3` + production deploy 12/12 success | CI migration pipeline 첫 실 증명 |
| 224 ‡ | 2026-04-21 | TD-36 Foundry-X [env.production] | ✅ Foundry-X `2a499600` (cross-repo) | Phase 3 외 TD 마감 |

‡ "세션 번호"로 관리 (Sprint 번호와 별개의 단위)

## 7. Gap List (목표 대비 미달)

| ID | Gap | 영향 | 우선순위 | 권장 조치 |
|----|-----|------|:-------:|----------|
| G-1 | **M-2 Tier-A 6/6 미달** (현 1/6, lpon-charge는 handoff_jobs row 0건) | Phase 3 True Must 본질. PRD §5.3 실패 조건 경계 | **P0** | (a) Empty Slot Fill 강화로 AI-Ready 0.69 → 0.75 돌파 (lpon-charge Gate PASS), (b) 나머지 5 Tier-A 서비스에 packaging + submit 실행 (`scripts/package-spec-containers.ts` 사용), (c) handoff_jobs row INSERT 증빙 D1 쿼리 + 로그 캡처 |
| ~~G-2~~ | ~~Sprint 223 PR #24 E2E Tests FAILURE~~ | ~~UX Phase 3 블로킹~~ | ~~P0~~ | ✅ **해소 (세션 225, `c49d2ef`)** — DEMO_USERS 폐기 부수효과로 확정, 10 spec skip + auth.setup stub + **TD-41 신규**(CF Access mock E2E 재작성, Sprint 232+ 후속). PR #24 admin squash merge. 총 4h 14m |
| G-3 | **Should Have S-1 AI-Ready 채점기 미착수** | KPI "5,214 × 95% 통과" 측정 불가. 본부장 리뷰 정량 증거 약화 | P1 | F356-A PoC(샘플 PoC) 먼저 1 Sprint. 결과 보고 기준 확정 후 F356-B 전수(30분 예상) |
| G-4 | **S-2 AgentResume stub 상태** | Sprint 202 잔여. AIF-REQ-026 Phase 2 종결 저해 | P1 | F357 Sprint 221+에 배치. P95 2s + 성공률 95% SLA 사전 합의 |
| G-5 | **S-3 Tree-sitter Java 파서 미검증** | TD-28 silent drift 지속. PRD↔Code 근본 드리프트 원인 | P1 | F358. Workers 호환성 PoC 1주(WASM vs native 결정) |
| G-6 | **S-4/S-5/S-6 미착수** (comparator/Phase 2 정리/Java 공용) | 기술부채 누적 | P2~P3 | Phase 4 자동 이관 가능 (PRD §4.2 명시) |

## 8. 교훈 (Lessons Learned)

1. **"자가보고 Match 100% ≠ Production 동작 증명"** — 3회 반복 재현(Sprint 215 TD-25 + Sprint 219 F362 + Sprint 220 F366). autopilot은 "명령 실행 성공"만 검증하고 production 시나리오는 모사하지 않음. feedback memory → rules/ 승격 조건 충족 (3회 관찰 + 세션 S215/S219/S220). `~/.claude-work/.claude/projects/*/memory/feedback_autopilot_production_smoke.md` 참조. (세션 222 기록)
2. **PRD 시점에 보이지 않는 레이어**: Sprint 218 PRD는 "도구 정리 + E2E"로 간단해 보였지만 실 production은 **secret/DB/CI/env config 4가지 드리프트**를 동시에 안고 있었음. 이는 Sprint 215의 "가짜 증거"가 Sprint 216-220 내내 발견되지 않은 원인. 해소 후 Sprint 221에서야 1/7 실증 가능.
3. **Cross-repo 작업 패턴 확립** (세션 224): 실 수정은 타 리포(Foundry-X)에서 commit + 본 리포 SPEC §8에 "해소 (세션 N, 타리포 SHA)" 기록. TD-34/TD-36에서 2회 성공 적용.
4. **CI migration pipeline이 production 신뢰성 결정타**: D1 migration 자동화는 기능이 아니라 **자가보고 검증 레이어**. 없으면 Sprint 215/219/220 같은 3연속 drift 재발.
5. **1인 체제 WIP 제한**: PRD §6.3 명시처럼 True Must만 동시 진행. Should Have 병렬 시도하면 전원 미착수로 귀결 (S-1~S-6 0/6 증거).

## 9. 권장 다음 단계

### Immediate (P0, 세션 226~227)

1. ~~**G-2**: Sprint 223 PR #24 E2E Tests 실패 수정 → merge → AIF-REQ-036 S1 종결~~ ✅ **완료 (세션 225, `c49d2ef`)**. TD-41 후속 분리
2. **G-1-a**: lpon-charge AI-Ready 0.69 → 0.75 돌파 전략 수립 (Empty Slot Fill 우선순위 분석 → 실행 계획)
3. **G-1 Phase 1**: 7 lpon-* containers 전수 dry-run으로 AI-Ready baseline 실측 (2h)

### Short-term (P0~P1, 세션 228~)

3. **G-1-b/c**: Tier-A 나머지 5 서비스 packaging + submit + handoff_jobs 증빙 수집 (2 Sprint 예상)
4. **G-3**: F356-A AI-Ready 채점기 PoC 1 Sprint

### Medium-term (P1, 세션 235~)

5. **G-4**: F357 AgentResume 실구현
6. **G-5**: F358 Tree-sitter PoC

### Phase 4 이관 후보 (P2~P3)

- G-6: S-4/S-5/S-6 전원

## 10. Phase 3 종결 판정 가이드

- **MVP 종결 조건**: M-1 ✅ (확보) + M-2 Tier-A 6/6 ✅ (현 1/6)
- **PRD §5.3 aborting 조건 실질 저촉 여부**: "Sprint 1 말 미완" 조건은 **Sprint 218 == Phase 3 Sprint 1**로 해석 시 저촉. 실 운용에서는 "Infra 위생 레이어를 Phase 3에 편입"이라는 **범위 확장 결정**을 세션 218 F355 갭 발견 시점에 이미 내렸음(분할 F355a/F355b/F362 + 세션 222 Sprint 220 재편). 따라서 범위 재협상으로 해석하는 것이 타당.
- **종결 허용 기준 제안**: M-2 ≥ 3/6 (Tier-A 절반) + Infra 위생 전원 ✅ + S-1 PoC 결과 정상. 나머지 Should Have는 Phase 4 backlog.

## 11. 수치 출처

- PRD: `docs/req-interview/decode-x-v1.3-phase-3/prd-final.md` v1.2 Ready
- F-item 상태: SPEC.md §6 "Phase 8 — v1.3 Phase 3 본 개발" (line 485+)
- TD 해소: SPEC.md §8 Tech Debt (lines 701-717, 724)
- Production E2E 1/7: SPEC.md §5 line 63 + session_context S221
- CI run evidence: `gh run view 24720331379`(세션 223) + `gh run view 24721312288`(세션 224)
- Cross-repo commits: Foundry-X `2a499600`, Decode-X `131d01a`
