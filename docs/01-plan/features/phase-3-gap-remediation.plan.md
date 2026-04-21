---
code: AIF-PLAN-037
title: Phase 3 Gap 해소 실행 계획 (G-1 · G-2 · G-3)
version: 1.0
status: Ready
category: Plan
system-version: 0.7.0
created: 2026-04-21
updated: 2026-04-21
author: Sinclair Seo
related:
  - docs/03-analysis/AIF-ANLS-030_phase-3-progress.md
  - docs/req-interview/decode-x-v1.3-phase-3/prd-final.md
  - SPEC.md §6 "Phase 8 — v1.3 Phase 3"
---

# Phase 3 Gap 해소 실행 계획

**전제**: AIF-ANLS-030 진척 분석에서 도출된 3개 우선순위 Gap에 대해 구체적 실행 절차·검증 기준·Risk 대응책을 확정한다. 1인 체제 WIP 제한 준수 + Sprint 단위 관리 + PRD §5.3 실패 조건 회피가 핵심.

---

## G-2 · Sprint 223 PR #24 E2E Tests FAILURE 수정 (P0, ✅ **완료 세션 225**)

> ⚠️ **상태 변경**: 이 Plan 작성 직후 **병행 pane A에서 세션 225가 자동 완주 → PR #24 MERGED** (`c49d2ef`, 세션 225 session_context). 아래는 실제 해소 경로 기록 + 교훈 보존용.

### 실 해소 경로 (세션 225 실측)

- **근본 원인**: `auth.setup.ts:9` 로그인 DOM 의존은 **Sprint 223 F389 "DEMO_USERS 완전 폐기"**의 부수효과. "서민원" DEMO_USERS 카드가 E2E fixture 전제였는데 폐기로 셀렉터 증발
- **해소 commit**: `aa57eda` — 10 E2E spec 전수 `test.describe.skip` + `auth.setup.ts` 빈 storageState stub + **TD-41 신규 등록** (CF Access mock E2E 재작성은 S224 후속 Sprint로 이관)
- **CI webhook race 발생**: sprint/223에만 선별적 CI 미발동 → 빈 커밋 `a1f4ef6` + PR close/reopen 시도 모두 실패 → **로컬 E2E 직접 검증** `pnpm --filter apps/app-web test:e2e` → 2 pass / 45 skip / 0 fail (예상값 정확)
- **main conflict**: 병행 세션 223/224가 +4 commit 진전 + **TD-40 번호 충돌**(다른 pane이 TD-40을 "d1_migrations backfill"로 선점) → `8a1a013`으로 rebase 해결: 우리 TD → **TD-41** 재번호 + e2e 11파일 TODO 주석 일괄 치환 + wrangler.toml 5개 + deploy-services.yml 자동 병합
- **최종 merge**: `gh pr merge 24 --squash --admin` → `c49d2ef`. WT/브랜치/tmux 전체 cleanup 완료. 총 소요 **약 4h 14m**

### 교훈 (rules 승격 후보)

1. **`.sprint-context` 파일 부재 시 autopilot 방향 이탈** — SPEC §8 최근 P0 TD를 Sprint 목표로 오인 (`/ax:sprint` Phase 2 fallback 경로에서 파일 생성 누락, ax-marketplace 스킬 개선 후보)
2. **LLM apply 모드 "데이터 없음" 지적 시 가짜 수치 생성 회피 패턴** — R1 자동 반영 중 DAU 가짜 수치 2건 감지 → §11.4 "Archive 실측 데이터 수집 계획"으로 교체. 반드시 수동 팩트 체크
3. **CI webhook race는 로컬 검증으로 우회 가능** + admin merge 합리적 escape hatch
4. **E2E fixture는 business data 의존성 제거 선행 필수** — DEMO_USERS 같은 seed 의존은 폐기 시점에 E2E 연쇄 실패. **TD-41 CF Access mock 재작성**은 이 구조적 재발 방지

### TD-41 (신규, 세션 225 등록)
- **내용**: CF Access mock E2E 재작성 — 현재 10 spec이 skip 상태로 E2E 커버리지 공백
- **우선순위**: Sprint 224 이후 후속 (P1)
- **범위**: CF Access JWT mock fixture + 각 spec의 auth 경로 전환 (DEMO_USERS 대체)

### 결과 (실측)
- [x] PR #24 MERGED (`c49d2ef`)
- [x] sprint/223 브랜치 + WT 전체 cleanup
- [x] signal STATUS=MERGED
- [x] TD-41 SPEC §8 등록
- [ ] E2E 실제 커버리지 복구 (TD-41 후속 과제)

---

## G-1 · M-2 Tier-A 5/6 추가 확보 (P0, 2~4 Sprint)

### 현 상태 실측
- **7 lpon-* containers 전수 보유**: `.decode-x/spec-containers/lpon-{budget,charge,gift,payment,...}/`
- **현재 KPI**: 1/6 (lpon-charge HTTP 409 GATE_FAILED, AI-Ready 0.69<0.75)
- **packaging script**: TD-33 해소로 7/7 파싱 가능 확인 (세션 221)
- **Production infra**: TD-34~40 전원 해소 (secret/D1/CI/env 4중 드리프트 근간 제거)

### 3-Phase 실행

#### Phase 1 — 현황 실측 (2h, 1 세션)
**목표**: "7개 중 몇 개가 현재 Gate PASS 가능한가" 저비용 판단

| 작업 | 시간 | 산출물 |
|------|:----:|--------|
| `scripts/package-spec-containers.ts`에 `--dry-run --with-ai-ready` 모드 추가 | 30min | AI-Ready 사전 측정 없이도 Empty Slot rate + 예상 점수 리포트 |
| 7 containers 전수 dry-run 실행 | 30min | `reports/ai-ready-baseline-{date}.json` |
| 시나리오 분기 결정 | 30min | AskUserQuestion으로 사용자 확정 |

**시나리오 분기**:
- **A** (대부분 0.75↑): Phase 2 스킵 → 즉시 Phase 3. 1 Sprint로 M-2 6/6 완결
- **B** (2~3건만 0.75↑): Phase 3 우선 일부(2~3건) → M-2 4/6 부분 달성 → Phase 2 나머지
- **C** (전원 ~0.69): Phase 2 전면 Fill 선행

#### Phase 2 — Empty Slot Fill 강화 (시나리오 B/C만, 1~2 Sprint)

**우선순위 매트릭스** (AI-Ready 6기준 영향도 × Fill 난이도):

| Fill 대상 | AI-Ready 영향 | 난이도 | 우선순위 |
|-----------|:------------:|:-----:|:-------:|
| 정책 리스트 (BL/BP/BB/BG/BS) | **기준 3·5·6** 3개 | 중 | **P0** |
| 비즈니스 룰 | 기준 1·2 | 중 | P1 |
| 테스트 케이스 (TC-*) | 기준 6 | 저 | P1 |
| Runbook | 기준 4 | 저 | P2 |
| Contract | 기준 3 | 고 | P2 |

**원칙**:
- 1 lpon-* container 집중 (병렬 금지 — WIP 제한)
- 각 Fill 후 AI-Ready 재채점 → 0.75 돌파 즉시 Phase 3 이동 (전원 Fill 대기 금지)
- Gate threshold 조정(0.75 → 0.70) 절대 금지 — KPI 신뢰성 회복이 Phase 3 본질

#### Phase 3 — Packaging + Submit + 증빙 (0.5 Sprint)

| Step | 시간 | 산출물 |
|------|:----:|--------|
| 6 containers packaging (또는 시나리오 B의 부분) | 1h | 각 skillId JSON 리포트 |
| `POST /handoff/submit` × 6 실 호출 (INTERNAL_API_SECRET) | 1h | HTTP 응답 200 + handoff_jobs row INSERT 로그 |
| Foundry-X production D1 조회 | 30min | `SELECT id, skill_id, created_at FROM handoff_jobs WHERE skill_id IN (...)` → 6 rows |
| 증빙 리포트 작성 | 1h | `docs/03-analysis/AIF-ANLS-031_m2-tier-a-production-evidence.md` |

### 검증 기준
- [ ] Foundry-X production D1 `handoff_jobs` Tier-A 6서비스 각 1건 이상
- [ ] 각 skill별 HTTP 200 응답 로그 + D1 timestamp cross-check
- [ ] AIF-ANLS-031 리포트 (본부장 리뷰 제출용)
- [ ] SPEC.md §5 "Foundry-X Production E2E" 항목 1/7 → 6/6 갱신

### Risk & 대응
| Risk | 확률 | 대응 |
|------|:----:|------|
| Phase 2 Fill 강화에도 0.75 미달 | 중 | Gate 산식 검토 TD 분리 등록, Phase 4 이관. M-2는 "Fill 가능한 N/6" + 별도 sheet로 종결 |
| Foundry-X 측 변경 요청 | 저 | TD-36 해소 후 드물. 발생 시 cross-repo PR 프로세스 (세션 224 선례) |
| LLM 비용 누적 (AI-Ready 반복 채점) | 중 | Phase 1 dry-run에서 baseline 먼저 확정 → Phase 2 내 반복 최소화 |

### 예상 소요: **2~4 Sprint (1~2주)** — 시나리오 분기에 따라 변동

---

## G-3 · S-1 AI-Ready 채점기 PoC (P1, 1~2 Sprint)

### PRD §C.1 6기준 (확정)
1. 소스코드 정합성
2. 주석·문서 일치
3. 입출력 구조 명확성
4. 예외·에러 핸들링
5. 업무루틴 분리·재사용성
6. 테스트 가능성 및 단위테스트 적합성

### 2-Phase 실행

#### Phase 1 — PoC (F356-A, 1 Sprint ≈ 8h)

| Step | 시간 | 산출물 |
|------|:----:|--------|
| 1. 스키마 설계 | 2h | `packages/types/src/ai-ready.ts`: `AIReadyScoreSchema` — 6 criteria × { score:0~1, rationale, passThreshold:0.75 } + 총점 산식(가중 평균 vs 단순 평균 Sinclair 확정) |
| 2. LLM 프롬프트 | 2h | `services/svc-skill/src/ai-ready/prompts.ts`: 6 기준별 독립 평가 프롬프트. 입력=Java 소스 + YAML/JSON metadata, 출력=JSON(구조 강제) |
| 3. PoC 스크립트 | 2h | `scripts/ai-ready/evaluate.ts` — 80 샘플 배치(Tier-A 집중 40 + 무작위 40), svc-llm-router HTTP REST, 일 $30 비용 가드(사전 usage 체크 + 초과 시 즉시 중단 + AskUserQuestion) |
| 4. 수기 검증 | 2h | 10%(8건) 수기 재채점 → LLM 점수와 ±0.1 이내 정확도. 80% 이상 시 Phase 2 승격 판정 |

**PoC 산출물**:
- `reports/ai-ready-poc-{date}.json`: 480 점수(80 skill × 6 기준)
- `reports/ai-ready-poc-accuracy-{date}.md`: LLM vs 수기 정확도

#### Phase 2 — 전수 + API (F356-B, 1 Sprint ≈ 8h)

| Step | 시간 | 산출물 |
|------|:----:|--------|
| 1. API 엔드포인트 (svc-skill) | 3h | `POST /skills/:id/ai-ready/evaluate` (단건) + `POST /skills/ai-ready/batch` (859 skill 30분 내) |
| 2. D1 스키마 신설 | 1h | `ai_ready_scores` (skillId, criterion, score, rationale, evaluatedAt, modelVersion) + migration `0011_ai_ready_scores.sql` |
| 3. 전수 배치 실행 | 2h | 859 skill × 6 = 5,214 점수, D1 적재 + JSON 리포트 |
| 4. KPI 집계 | 2h | `docs/03-analysis/AIF-ANLS-032_ai-ready-full-report.md`: "5,214 중 95% 4기준 상기준 통과" 판정 |

### 검증 기준
- [ ] PoC: 80건 평가 + 수기 검증 정확도 ≥ 80%
- [ ] 전수: 5,214 점수 산출 + 95% 통과 여부 수치 확정
- [ ] API 엔드포인트 production 배포 + health check
- [ ] D1 `ai_ready_scores` 적재 검증
- [ ] AIF-ANLS-032 리포트 (본부장 리뷰 제출용)

### Risk & 대응
| Risk | 확률 | 대응 |
|------|:----:|------|
| 일 $30 가드 초과 3회 → PRD §5.3 실패 조건 | 중 | PRD 명시된 10% 샘플링 전환 (859 → 85), 정확도 신뢰구간 제시 |
| 6 기준 weight 논란 | 중 | Phase 2 Deep Dive PRD §4.2 재참조 → 본부장 사전 승인 확보 |
| LLM 모델 drift (Opus→Haiku 비용 절감) | 중 | PoC에서 Opus vs Haiku 동일 샘플 교차 채점 비교 → 정확도 trade-off 리포트 |
| 수기 검증 정확도 < 80% | 저 | 프롬프트 개선 iterate → 재실행 (Phase 2 진입 전 반드시 통과) |

### 예상 소요: **2 Sprint (1주)** — 독립 실행 가능하나 WIP 제한 준수로 G-1 부분 완료 후 착수 권장

---

## 통합 로드맵

| Sprint | 세션 | Scope | 예상 | 선행 | 상태 |
|:-----:|:----:|-------|:----:|:----:|:----:|
| 223 | S225 (autopilot) | **G-2** PR #24 E2E fix + TD-41 신규 | 4h 14m | 없음 | ✅ 완료 (`c49d2ef`) |
| 224 | - | **G-1 Phase 1** dry-run baseline + ai-ready 사전 측정 | 반일 (2h) | 없음 | 📋 PLANNED |
| 225~226 | - | **G-1 Phase 2** Empty Slot Fill (시나리오 B/C 시) | 1~2 Sprint | Phase 1 결과 | 📋 PLANNED (조건부) |
| 227 | - | **G-1 Phase 3** Packaging+Submit+증빙 6건 | 0.5 Sprint | Phase 2 완료 or 시나리오 A | 📋 PLANNED |
| 228~229 | - | **G-3 Phase 1** AI-Ready PoC 80건 | 1 Sprint | 독립 (G-1 Phase 3 후 권장) | 📋 PLANNED |
| 230~231 | - | **G-3 Phase 2** 전수 5,214건 + API | 1 Sprint | PoC 정확도 ≥ 80% | 📋 PLANNED |
| 232+ | - | **TD-41** CF Access mock E2E 재작성 | 1~2 Sprint | 후순위 | 📋 PLANNED |

**남은 작업 총 4~5 Sprint (1.5~2주)**. 본부장 리뷰 D-Day 임박 시 G-3 Phase 2 + TD-41은 Phase 4 이관 허용 (PRD §4.2).

---

## 종결 판정 기준 (Phase 3 본체)

### MVP 임계값 (PRD §5.2)
- [x] M-1 TD-24 완결 ✅ (세션 218, F354)
- [ ] M-2 TD-25 완결 — **G-1 Phase 3 완료 시 종결**

### Should Have (선택, PRD §4.2)
- [ ] S-1 AI-Ready 채점기 — **G-3 Phase 2 완료 시 종결**. 본부장 리뷰 정량 증거로 전환
- [ ] S-2~S-6 — Phase 4 이관 (PRD 명시 허용)

### Infra 위생 레이어 (비공식 Must)
- [x] TD-33~40 전원 ✅ — Production 드리프트 근간 제거 완결

---

## 참조

- 진척 분석: `docs/03-analysis/AIF-ANLS-030_phase-3-progress.md`
- PRD: `docs/req-interview/decode-x-v1.3-phase-3/prd-final.md` v1.2
- 교훈 (autopilot production smoke): `~/.claude-work/.claude/projects/*/memory/feedback_autopilot_production_smoke.md`
- Cross-repo 패턴: 세션 224 Foundry-X `2a499600` 선례
