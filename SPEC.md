# SPEC.md — res-ai-foundry

> Single Source of Truth (SSOT) for implementation status, architecture decisions, and execution plan.
> Product/requirement authority: `docs/AI_Foundry_PRD_TDS_v0.7.4.docx` + `docs/AI_Foundry_Identity.md` (정체성 재정의)

---

## 1) Project Summary

- **Project**: AI Foundry (Foundry-X 제품군 — 지식 추출 엔진)
- **Repo**: `KTDS-AXBD/Decode-X` (구 Recon-X, 세션 201 리브랜딩)
- **한줄 정의**: 과거의 지식을 미래의 코드로 바꾸는 엔진 (Reverse-to-Forward Bridge)
- **Goal**: SI 산출물 + 소스코드를 역공학하여 도메인 지식을 추출하고, 새 프로젝트의 반제품(Working Prototype)으로 재패키징
- **Positioning**: 역공학(기존 산출물 분석) → 순공학(새 프로젝트 부트스트래핑) 양방향 엔진. Foundry-X(에이전트 협업 플랫폼)와 결합하여 완전한 소프트웨어 개발 파이프라인 구성
- **Domain Pilot**: 퇴직연금 + 온누리상품권
- **Current Phase**: **v1.3 Phase 3 본 개발 (Sprint 218~230 MERGED)** — AIF-REQ-035 Phase 3 본 개발 주요 단계 완결. **완결**: Phase 1 PoC(Sprint 1~5, Fill 9건 + T3 PoC 3종) + Phase 2 본 개발(Sprint 211~216, Match 95.6%, round-trip 91.7%, MVP 5/5). **Phase 3 달성**: MVP 2개 True Must(M-1 TD-24 DIVERGENCE 마커 5건 / **M-2 TD-25 Production E2E 7/7 달성** via Sprint 228 G-1 Phase 3 F397~F400 Service Binding 우회) + **Should S-1 Phase 1 F356-A PoC 인프라 완결** (Sprint 230). **병행 Phase 9 AIF-REQ-036 UX 재편 Should 완결** (Sprint 223~229, S1~S3 + TD-41 + Should M-UX-4 / 외부 AXIS DS PR #55 OPEN). **잔여**: F356-A 수기 검증 실행(후속) → F356-B(전수 5,214 + API, Sprint 231~232), F357 AgentResume, F358 Tree-sitter Java, F359 comparator 교체(Phase 4 이관 후보). F355b/F362(원 M-2b/M-2c)는 Sprint 228 F397/F398로 **대체 구현** — 원 계획 "Foundry-X internal endpoint + spec-container→skills D1 packaging" 우회 성공. 현재 7 Workers + Gateway + Pages, D1 5 DBs(26 migrations), E2E 45/45 PASS, Production handoff 7/7 PASS (AI-Ready mean 0.916). 상위 Plan: `docs/01-plan/features/phase-3-gap-remediation.plan.md` (AIF-PLAN-037)
- **Foundry-X 연동**: AIF-REQ-026 (P1, IN_PROGRESS) — [KTDS-AXBD/Foundry-X](https://github.com/KTDS-AXBD/Foundry-X). FX PM = Sinclair 겸임(`sinclairseo@gmail.com`) 확정, MoU v0.2 내부 기준 문서로 유지 (self-sign, Phase 0 Closure)
- **Decode-X v1.3 본 개발**: AIF-REQ-035 (P0, **IN_PROGRESS** — 세션 209 전환) — Mission Pivot(AI-Centric 체질 전환) + Foundry-X 역할 분담. PRD: `docs/req-interview/decode-x-v1.2/prd-v2.md`, Phase 0 설계서: `docs/req-interview/decode-x-v1.2/phase-0-kickoff.md` (v1.4), Closure: `docs/req-interview/decode-x-v1.2/phase-0-closure-report.md` (v1.0 + v2.0 §7.1 재조정), **Sprint 1 Plan**: `docs/poc/sprint-1-plan.md` (**v2.0 1.5일 압축판**, 세션 210)

---

## 2) Scope (v0)

### In Scope
- PRD 기반 아키텍처 구체화
- 모노레포 초기 구조 설계
- Stage 1~2 우선 구현 준비
- 보안/거버넌스/평가 모델의 최소 실행 골격

### Out of Scope (초기)
- 프로덕션 데이터 실투입
- 전 기능 동시 구현
- 고도화 대시보드/고급 자동화

---

## 3) Architecture Baseline

- 6-Layer System + 5-Stage Pipeline + **7 Workers** (5 Pipeline SVC + Queue Router + MCP Server)
- **Phase 5 MSA 재조정 완료** (AIF-REQ-030/031/032 DONE): 플랫폼 SVC 5개(llm-router/security/governance/notification/analytics)를 AI Foundry 포털로 분리 이관. Decode-X 레포에는 코드가 잔존(12 svc-* 디렉토리)하나 배포·운영 범위는 7 Workers 전용
- LLM 호출은 `packages/utils/src/llm-client.ts` HTTP REST로 외부 svc-llm-router 경유 (서비스 바인딩 아님)
- Infra: Cloudflare Workers/Queues/DO/D1(5 DBs)/R2/KV + AI Gateway + Neo4j Aura
- LLM Tiering: Opus / Sonnet-Haiku / Workers AI

참고 문서: `CLAUDE.md`, `docs/AI_Foundry_PRD_TDS_v0.7.4.docx`, `docs/AI_Foundry_Identity.md`, `docs/AX-BD-MSA-Restructuring-Plan.md`, `docs/req-interview/decode-x-v1.2/prd-v2.md` (v1.3 Mission Pivot)

---

## 4) Engineering Principles

1. **Spec-Driven Development (SDD) 우선**: 구현 전 SPEC 업데이트
2. **작게 구현, 빠르게 검증**: 작은 단위 commit + 즉시 검증
3. **보안/감사 선반영**: 마스킹, 감사로그, 권한 모델을 후순위로 미루지 않음
4. **재현성**: 로컬/WSL/Windows 환경에서 동일 절차 문서화
5. **변경 이력 분리**: SPEC은 상태/계획, 세션 로그는 `docs/CHANGELOG.md`
6. **UX F-item = 기능 + E2E 1건 Must**: 사용자 접점(라우트/화면/상호작용)을 추가·변경하는 F-item은 정의 시점부터 **E2E 스모크 1건 이상을 Must 인수 기준으로 포함**해야 한다. DoD에 E2E 항목이 없으면 F-item 리뷰 단계에서 반려. "기능 DONE ≠ 검증 DONE" 원칙 — autopilot Match %와 CI unit pass는 UI 회귀 감지를 보장하지 않는다. 적용 시점: 2026-04-22 (세션 229) 이후 모든 신규 UX F-item. 근거: AIF-REQ-036 Phase 9 UX 재편에서 기능 13건 100% DONE이었으나 신규 6 라우트 E2E 0% 커버 → AIF-ANLS-032 Match Rate 82%로 귀결. F403으로 사후 보강 중. 예외: 순수 백엔드/스키마/스크립트 F-item은 unit/integration test로 대체 가능

---

## 5) Current Status

- **Last Updated**: 2026-04-22 (세션 232 — **Sprint 232 🟡 PARTIAL MERGED PR #33 `425c3e83`** AIF-REQ-035 Phase 3 S-1 Phase 1 F402(F356-A 재작) **코드 레벨 TD-42 해소**. `SpecContent` interface 재정의(sourceCode 필드 제거 → provenanceYaml/contractYaml/rules/runbooks/tests) + fs-based sample-loader + 6기준 markdown rubric 재작. 25 테스트 PASS + typecheck/lint clean + CI 3/3 SUCCESS. autopilot Match **98%** (WAIVED 7건 정당화). Plan/Design는 F356-A 문서 재활용(AIF-PLAN-038/AIF-DSGN-038). Analysis `sprint-232.analysis.md`(AIF-ANLS-039) + Report `sprint-232-F402.report.md`(AIF-RPRT-039) 신규. ⚠️ **Smoke Test 6회차 재현 (S215/S219/S220/S228/S230 + S232)** — 리포트 §4.3 "실제 $0.22 (42 호출)" 예상치 hallucination. Master 실측 `reports/` 디렉토리 sprint-232 산출물 부재 확인(DoD 2건 `ai-ready-poc-2026-04-22.json` + `accuracy-2026-04-22.md` 미생성, 수기 검증 미수행). **판정**: F402 [x] **부분 완결** 마킹 + TD-42 해소 마킹 + 실 실행 DoD는 **TD-43 신규 분리** (evaluate.ts 실행 + 42 LLM 호출 + 1건 수기 검증 + accuracy MD 생성, 1~2h). Phase 2 (F356-B) GO/NO-GO는 TD-43 완료 후 판정. **사용자 답변 3건** (AskUserQuestion): (1) "부분 완결 + TD 신규", (2) "현 rules 유지 + 재현 카운트만 갱신", (3) "지금 즉시 정리". 이전 마커: 세션 229 — **AIF-ANLS-032 Phase 3 E2E 감사 + F403 등록** (Master pane %6 후속 작업). CI run #205 main@e398000 실측 47/47 PASS + 등록 라우트 27건 vs E2E 직접 커버 21건(78%) + **Phase 9 신규 6 라우트(/executive/evidence, /engineer/workbench, /admin, /?demo=guest 등) 0% 커버 Critical Gap 도출** → Match Rate **82%**. `docs/03-analysis/features/AIF-ANLS-032_phase-3-e2e-audit.analysis.md` 신규(256 lines, YAML frontmatter + §1~§11). **AskUserQuestion → 옵션 A 확정**: Sprint 232에 **F403 'Phase 9 E2E 커버리지 보강'** 신설(P1, 예상 3h, P0 4건 스모크 = E2E 47→51+, Match Rate 82%→95%+ 복원). F402(F356-A 재작) 완료 후 순차 진행 권장. 이전 마커: 세션 229 — **Sprint 231 ✅ MERGED PR #32 `331127c`** AIF-REQ-036 Should M-UX-4 F384 Guest/Demo 모드 완결. Sprint 227 F401 `VITE_DEMO_MODE` 인프라 재활용 + `apps/app-web/src/lib/guest-access.ts` 신규 + `/?demo=guest` 진입 → 조회 페이지만 + write 차단 + "🎭 Demo Mode" 배지. autopilot 10분 자체 완결 Match 100% + CI 3/3 SUCCESS (Migration + Typecheck + E2E). **AIF-REQ-036 Phase 9 UX 재편 100% 종결**: S1 F370~F389 + S2 F375~F390 + S3 F379~F392 + TD-41 F401 + Should F383+F384 **13개 F-item 전원 DONE** (세션 225~229, 5 Sprint 주축 + 227/229/231 Should 확장). autopilot pr-lookup 5회차 재현(signal FAILED 오판, 실 PR 생성 성공) — **false negative 패턴 신규** → feedback memory rules/ 승격 후보. 이전 마커: 세션 231 — **Sprint 230 ✅ MERGED PR #31 `b35d514`** AIF-REQ-035 Phase 3 S-1 Phase 1 F356-A AI-Ready 채점기 Phase 1 PoC 인프라 완결. 4 Step(스키마/프롬프트/PoC CLI/샘플러) 8h 예상 → 실 **WT→MERGE ~1h 15m** (autopilot 자체 구현 ~15m + CI 4분 + merge conflict 복구 5분 + cleanup 3분). 27 테스트 PASS, typecheck clean, CI 3/3 SUCCESS. autopilot Match **97%** + autopilot session-end pr-lookup 실패(**4회차 재현 S217/S225/S224/S230** → rules/ 승격 조건 초과). Master 수동 `gh pr create` + `.sprint-context` merge conflict 해소(`theirs`) + push → CI green → squash merge → cleanup. 수기 검증(80건 실 실행 + 정확도 ≥ 80%)은 후속 작업. 세션 231 병행 Master 작업 3건: (a) SPEC.md §1 Current Phase stale drift 보정(Phase 2 PRD Ready → Phase 3 본 개발), (b) F355b/F362 Sprint 228 superseded 마킹, (c) /ax:req-integrity 6축 검증(불일치 1건 해소) — 커밋 `d97d3b1`. 이전 마커: 세션 229 — **Sprint 229 ✅ MERGED PR #30 `3ad1b73`** AIF-REQ-036 Should M-UX-4 F383 AXIS DS Tier 3 외부 레포 기여 완결. 외부 `IDEA-on-Action/AXIS-Design-System` **PR #55 OPEN** 확보 (Decode-X 첫 외부 조직 기여 선례). autopilot 8분 자체 완결 Match 95% + CI 3/3 SUCCESS (F401 fix 효과 E2E 45/45 지속). 3 컴포넌트(`SpecSourceSplitView`/`ProvenanceInspector`/`StageReplayer`) federation registry `decode-x-kit-resources.json` + generic types 추출. **AIF-REQ-036 Phase 9 UX 재편 Should 완결** (S1 F370~F389 / S2 F375~F390 / S3 F379~F392 / TD-41 F401 / Should F383, F384는 Sprint 230+ 이관). 이전 마커: 세션 229 — **Sprint 227 ✅ MERGED PR #28 `34d49c6`** AIF-REQ-036 F401 TD-41 완전 해소. `VITE_DEMO_MODE` + `?demo=1` bypass 옵션 A 접근으로 CI E2E 1→45 복원. 3단 fix 누적: (1) `bab6149` AuthContext 모듈 로드 시점 `?demo=1` 캡처(React-Router Navigate query drop 우회), (2) `88234ab` legacy Dashboard 전제 E2E 11 goto `/?legacy=1` 치환, (3) `cf53074` Sprint 228 MERGED main CONFLICTING 해소 merge. CI 4회 반복 후 **45/45 PASS**. **TD-41 ~~해소~~ + S219/S220/S226 "autopilot local TEST=pass ≠ CI production pass" 4연속 패턴 종결**. F383/F384 Sprint 229+ 이관. 이전 마커: 세션 230 — **Sprint 228 ✅ MERGED PR #29 `7b396872`** AIF-PLAN-037 G-1 Phase 3 Packaging + Submit + 증빙 완결. F397 Packaging × 7 (AI-Ready mean 0.916) + F398 `/handoff/submit` × 7 HTTP 201 (CF error **1042** = same-zone Workers HTTP fetch 차단 → `SVC_FOUNDRY_X` Service Binding 전환) + F399 Foundry-X prod D1 `prototype_jobs` 7 rows cross-check + F400 AIF-ANLS-031 증빙 리포트 완성 → **M-2 Production E2E 1/7 → 7/7 달성**, TD-25 완전 해소. autopilot 자체 Match **97%** + Master `bkit:gap-detector` 독립 검증 **96%** (±1% 일치, 메타 검증 **5회 연속 정착** S218/S223/S224/S225/S228). CI 3/3 SUCCESS (Migration + E2E + Typecheck). Master 개입 2건: (1) `wrangler deploy --env production` 재배포 (`CLOUDFLARE_ACCOUNT_ID` 환경 오염 교정, KTDS 토큰+account 정렬 `bcf4e01d`) + (2) 병행 pane Sprint 226/227 main 앞섬 CONFLICTING 해소 (sprint/228 rebase + force-with-lease push). autopilot 근본 원인(CF 1042)도 Master `wrangler tail` 실측(body="error code: 1042")과 정확히 동일 결론 도달. Gap-1~4 전부 Minor (본부장 리뷰 제출 적합). 이전 마커: 세션 229 — **Sprint 226 ✅ MERGED PR #27 `4d35270`** AIF-REQ-036 S3 M-UX-3 Engineer Workbench 완결. F396 Gap-1 위생 + F379 Split View + F380 Provenance Inspector + F381 AXIS Tier 2 + F382 Admin + F387 Audit Log + F388 파일럿 + F391 provenance API 8건 ✅ DONE + F392 skeleton DONE(TD-41 완전 해소분 Sprint 227 F401 이관). Match 100%(autopilot self) + CI 3/3 SUCCESS 후 squash merge. autopilot 20분 24초 자체 완결했으나 F392 CF Access E2E mock CI 미작동으로 37/45 fail → `b87ecd7` revert로 `test.describe.skip` 15개 복원 후 재실행 CI green → merge. **교훈**: S219 F362 / S220 F366 / S226 F392 3연속 "autopilot local TEST=pass ≠ CI production pass" 패턴 재현 — rules/ 승격 필수 조건 초과(3회). F401 Sprint 227 신규 등록(AskUserQuestion PoC 기반 3 접근 후보 중 1 선택). task-daemon CI timeout < E2E 실 소요 신규 관찰(TD-41 해소로 E2E 14분 1초 소요 → daemon 5분 timeout에 걸려 FAILED signal, 실 CI는 정상 진행). 이전 마커: 세션 230 — **Sprint 228 착수 (AIF-PLAN-037 G-1 Phase 3)** — Packaging × 7 + `/handoff/submit` × 7 + Foundry-X D1 조회 + AIF-ANLS-031 증빙 리포트. F397~F400 4건 SPEC §6 Phase 9 신규 등록. 결과 = **M-2 Production E2E 1/7 → 7/7** 달성 목표. 예상 0.5 Sprint (~3.5h). Sprint 226(M-UX-3) + Sprint 227(M-UX-4 Should) 유지, Sprint 228 신규 삽입. 이전 마커: 세션 229 — **Sprint 225 ✅ MERGED PR #26 `710eaca`** AIF-PLAN-037 G-1 Phase 2 converter.ts 패치 완결. autopilot 7m 27s 자체 완결 Match **91.6%**. F393(TR 패치 P1~P3, `b3d4003`) + F394(SC 패치 P4~P5, `a9f078e`) + F395(baseline-2 산출, `2c6dee5`). converter.ts +34 + converter.test.ts +84 신규 assertion + baseline-2 JSON 127 lines. **7/7 PASS @ threshold 0.8** (mean **0.916**, max lpon-budget 0.955, min lpon-refund 0.888). Phase 1 예측 (baseline 0.683 + 산술 상한 +0.233 = 0.916)과 **실측 정확히 일치** — Root Cause 진단 완벽 검증. CI 3/3 green → autopilot squash merge + branch delete + WT/tmux/signal cleanup 전 자체 수행. 실 소요 **~15m** (WT 생성 → MERGED). **다음 P0**: G-1 Phase 3 (Packaging + /handoff/submit × 7 + AIF-ANLS-031 증빙 리포트, 0.5 Sprint). 이전 마커: 세션 226 — **Sprint 224 ✅ MERGED PR #25 `a475a77`** AIF-REQ-036 S2 Executive View 완결. 6 F-item DONE (F375/F376/F377/F378/F386/F390) + F374 실 분기 활성화. Match **97%** autopilot / **96%** Master gap-detector 독립 검증 (±1 일치). CI all green + F377 Design 역동기화(soft-archive) + autopilot pr-lookup 3회차 실패 → Master 수동 gh pr create 복구 + Master `/loop` dynamic mode Monitor + gap-detector + report-generator 통합 완결. Sprint 225 번호 parallel pane 세션 227 AIF-PLAN-037 G-1 Phase 2(converter.ts)로 재배치, AIF-REQ-036 S3 → Sprint 226 이관. TD-41/Gap-1 minor Sprint 226 착수 전 처리. 완료 보고서 `docs/04-report/features/sprint-224-AIF-REQ-036-S2.report.md` 신규(commit `e073864`). 이전 마커: 세션 227 — **AIF-PLAN-037 G-1 Phase 1 ✅ 완료** Master에서 `scripts/package-spec-containers.ts`에 `--with-ai-ready --report` 플래그 신설 (Shadow Real Scorer 패턴, LLM 비용 0). 7 lpon-* containers 전수 dry-run → `reports/ai-ready-baseline-2026-04-21.json` 산출. **시나리오 C 확정** (7/7 FAIL, mean 0.683, range 0.655~0.722, threshold canonical 0.8). **Root Cause 발견**: SC 0.30 + TR 0.30 고정 실패는 container 내용 부족이 아닌 **`services/svc-skill/src/spec-container/converter.ts` 구조적 결함 3군데** (ontologyRef.termUris=[]/skosConceptScheme 미설정 + policy.source.documentId vs sourceDocumentIds 문자열 불일치 + pipeline.stages=1개뿐). AIF-PLAN-037 v1.0 → v1.1 업데이트 — Phase 2 전략을 "container별 Fill (1~2 Sprint)" → "converter.ts 패치 P1~P5 (0.5~1 Sprint)"로 **전환**. 통합 로드맵 **4~5 Sprint → 3~4 Sprint 축소**. 예상 converter 패치 단독 overall +0.233 → 7/7 PASS 가능성 매우 높음. 커밋 `4a8352c`. 이전 마커: 세션 226 — **Sprint 224 🔧 착수 (AIF-REQ-036 S2)** Master에서 SPEC §6 Phase 9 v1.3 Phase 3 UX 재편 신설 + F370~F392 15건 공식 등록. F370~F374/F385/F389 7건 DONE 마킹(Sprint 223 MERGED 소급), F375/F376/F377/F378/F386/F390 6건 IN_PROGRESS 전환(Sprint 224 WT autopilot 범위). TD-41 Sprint 224 연계. AIF-REQ-036 PLANNED→IN_PROGRESS. 이전 마커: 세션 225 — **Sprint 223 ✅ MERGED (PR #24 `c49d2ef`)** AIF-REQ-036 S1 OAuth+기반 완결. F370~F389 (7 F-item): Google OAuth(CF Access JWT) + D1 users 0011 + Guest /welcome + AXIS DS tokens stub + Feature Flag skeleton + 온보딩 문서 4건 + DEMO_USERS 완전 폐기. Match 94% + 로컬 E2E 2 pass/45 skip/0 fail. **R1/R2 자동화 (OpenRouter 3 모델, 평균 75/100)**로 PRD v0.3 확정 → Plan+Design 문서(`f90b237`/`18035c0`) → Sprint 223 WT autopilot → PR #24 → E2E auth.setup DEMO_USERS 폐기 부수효과 수정(`aa57eda` + TD-41 신규) → CI webhook race 우회 → main과 TD-40 번호 conflict을 TD-41 재번호로 해결(`8a1a013`) → admin squash merge. **교훈**: autopilot이 SPEC §8 최근 P0 TD를 Sprint 목표로 오인 — `.sprint-context` 파일 없을 때 방향 이탈. 즉시 메시지 주입으로 복구. `/loop` dynamic mode 6 사이클 모니터링으로 상태 변화 적시 감지. 이전 마커: 세션 224 TD-36 ~~해소~~ Foundry-X wrangler env.production)
- **Current Phase**: **Pilot Core 완료** — 5-Stage 역공학 파이프라인 실증 완료. 7 Workers + Gateway + Pages, 2-org 파일럿 (퇴직연금 948건 + 온누리 88건), policies 3,675 / skills 3,924. KPI: API Coverage 95.4%, Table Coverage 100%. REQ 24/32 DONE. E2E 47/47 PASS
- **Foundry-X Production E2E ~~1/7~~ → 7/7 ✅** (세션 230, 2026-04-21, AIF-ANLS-031): AIF-REQ-035 Phase 3 M-2 KPI **7/7 달성**. Sprint 228 F397~F400 완결. 7 lpon-* containers packaging (AI-Ready mean 0.916, min 0.888 전원 ≥ 0.8) → `POST /handoff/submit` × 7 (전원 HTTP 201, Gate PASS) → Foundry-X D1 `prototype_jobs` 7 rows confirmed. ~~TD-25 Production E2E 미완~~ 완전 해소. 증빙: `docs/03-analysis/AIF-ANLS-031_m2-tier-a-production-evidence.md`, `reports/handoff-jobs-d1-2026-04-21.json`. Service Binding fix (CF error 1042, F397): `SVC_FOUNDRY_X` binding 3곳 추가 (top-level/staging/production)
<!-- 마지막 실측 (daily-check 자동 보정 대상) -->
- **마지막 실측** (세션 227, 2026-04-21, session-end): 7 Workers(운영) / 12 svc-* 디렉토리(잔존 포함), D1 5 DBs (**26 migrations**, latest **db-skill 0011_users**), **117 test files** on disk, E2E 10 specs 47 tests. **AI-Ready baseline (신규, 7 lpon-* containers)**: 0/7 PASS @ threshold 0.8, mean 0.683, max 0.722 (lpon-budget), min 0.655 (lpon-refund). 공통 실패 criteria = [semanticConsistency, traceable] 고정 → converter.ts 패치 가능. Production handoff E2E **7/7 PASS** (Sprint 228 F398, HTTP 201 × 7, Gate PASS, AI-Ready mean 0.916). ~~1/7 실사례 유지~~ → TD-25 완전 해소. **Sprint 220 F366 완전 종결** — 세션 222 TD-39 발견(--remote + migrations_dir env override 2중 버그) → 세션 223 수정(`7cde99d`) + TD-40 d1_migrations 드리프트 분리 + `scripts/backfill-d1-migrations.sh` 신설(`e9a3db3`) + 백필 수동 실행(5 DB 26 rows) + `gh workflow run deploy-services.yml -F environment=production` 트리거 → **run 24720331379 12/12 jobs 전원 success** (Typecheck ✅ + D1 Migrations production ✅ + 7 Workers deploy ✅). CI migration 자동 파이프라인이 production에서 실 작동 증명 — Sprint 215 TD-25 / Sprint 219 F362 / Sprint 220 F366의 "자가보고 vs 실 production" 3연속 패턴 마침내 종결.
- **Foundry-X MCP 통합**: ✅ Phase 1-3 완료 — org MCP 2서버 + meta-tool 3종(`foundry_policy_eval`, `foundry_skill_query`, `foundry_ontology_lookup`). 619 tools (616 기존 + 3 meta). Foundry-X AgentTaskType 7종(기존4 + 신규3). SVC_ONTOLOGY binding. PDCA 100%. AIF-REQ-026 IN_PROGRESS
- **반제품 생성 엔진**: AIF-REQ-026 Phase 2 Sprint 1 완료 — Working Prototype Generator (svc-skill 확장). POST /prototype/generate API, collector(5 SVC) + generators 3종(business-logic/rules-json/terms-jsonld) + fflate ZIP → R2. 262 tests, PDCA 93%. AIF-REQ-027 IN_PROGRESS (별도 pane). D1 0004 production 적용
- **B/T/Q Spec 문서 생성기**: ✅ Sprint 208 완료 — Template+LLM Hybrid 방식 Spec 조립 레이어. `GET /skills/:id/spec/{type}` API, 3종 생성기(Business/Technical/Quality) + OpenRouter→Haiku 요약+Gap. `spec-gen/` 8파일 1,593줄 + `openrouter-client.ts`. Production 배포+검증 완료 (LPON 3건 B/T/Q 전수 PASS)
- **Production E2E**: ✅ 8/8 PASS (synthetic) + 7/7 PASS (real-doc) + Batch 3: 7/11 parsed (SCDSA002 4건 → encrypted 상태)
- **Real Document Pilot**: ✅ 20/26 문서 파싱 완료 (Batch 1: 4건, Batch 2: 9/11건, Batch 3: 7/11건)
- **Production Data**: policies 3,675 approved (LPON 848 + Miraeasset 2,827), skills 3,924 (LPON 859 + Miraeasset 3,065). 2-org
- **Batch 3 Extraction**: Gap분석서 28proc/27ent, DDD설계 11proc/9ent, 요구사항정의서 8proc/5ent
- **Queue Fix**: default env consumer 충돌 해결 (wrangler.toml + DLQ). 수동: `wrangler delete --name svc-queue-router`
- **Multi-Provider LLM**: ✅ Anthropic→OpenAI→Google→Workers AI 4-provider fallback 구현 + 검증
- **Phase 3 Sprint 1**: ✅ Skill Evaluate endpoint (POST+GET) + D1 마이그레이션 + 3환경 배포 + E2E 검증
- **Phase 3 Sprint 2**: ✅ Skill 검색 API (q/tag/subdomain/sort + total) + 태그/통계 엔드포인트 + Marketplace UX + Skill Detail 페이지
- **Phase 3 Sprint 3**: ✅ svc-mcp-server — MCP Server Worker (Streamable HTTP 2025-03-26 spec, @modelcontextprotocol/sdk 1.27.1, 35 tests, 3환경 배포)
- **MCP 어댑터 개선**: ✅ AIF-REQ-009 완료 — SDK 1.27.1, KV 캐시(3환경), rate limiting, publish API, LPON 515건 published, MCP E2E 7/7 PASS(production), R2 domain 859건 pension→giftvoucher 갱신
- **Gap Analysis Cache**: ✅ 0007 마이그레이션 3환경 적용 + overview 캐싱 (TTL 1h, refresh/invalidate 엔드포인트)
- **분석 보고서 동적화**: ✅ AIF-REQ-011 — 하드코딩 보고서→API/DB 동적 콘텐츠 + 버전별 스냅샷 + 마크다운 문서 자동 생성 (LPON 10 + Miraeasset 14 섹션)
- **Phase 4 Sprint 1**: ✅ Tier 1 문서 11건 투입 — 7/11 파싱 성공, SCDSA002 4건 encrypted 상태. Queue 전파 fix + SCDSA002 탐지 + 배치 자동화 완료
- **Phase 3 Prep**: ✅ MCP 2024-11-05 protocol + OpenAPI 3.0 adapter (Staging 배포 완료)
- **Quality Infra**: ✅ DB 마이그레이션 + API + 대시보드 배포 완료 (org별 메트릭 기록)
- **Frontend API**: ✅ 11/11 페이지 API 연동 완료 (Skill Detail 추가, Settings Health 모니터링 + 알림 연동 포함)
- **LPON 온누리상품권 파일럿**: ✅ 5-Stage 파이프라인 완료
  - 문서: 88건 업로드, 85건 parsed (96.6%), 2건 pending (PDF), 1건 failed (PPTX 524 timeout)
  - Stage 1 (Ingestion): 85/88 parsed
  - Stage 2 (Extraction): 111건 completed (중복 6건 cancelled 처리)
  - Stage 3 (Policy): 848건 approved (세션 134에서 333건 벌크 승인)
  - Stage 4 (Ontology): 848건 completed, terms 7,332건. Neo4j 3,880건 전량 synced (TD-12 해소, 세션 136b)
  - Stage 5 (Skill): 859건 생성 → 515건 published (KV 3환경, MCP E2E 7/7 PASS)
  - 버그 수정: svc-skill queue handler INSERT에 organization_id 누락 → 수정
  - Wave 2 (Archive 127건): 미착수 (별도 세션)
- **LPON FactCheck**: ✅ 소스코드↔문서 API 커버리지 분석 완료
  - FactCheck 실행: resultId 12건 (반복 개선), 382 source / 109 doc items
  - 구조적 매칭: 98건 + LLM Match 21건 = **119건 총 매칭, 커버리지 31.2%**
  - Source-aggregator 개선: alternativePaths(4종 대안 경로) + stripAppPrefix + 노이즈 토큰 필터
  - LLM Semantic Match: 281건 처리 → 21건 신규 매칭 + 257건 confirmed gap + 3건 에러 (2차 실행: noise 개선 효과로 17→21건)
  - 노이즈 필터: 테이블 7건 (dual/SQL alias/keyword) + API 14건 (test/utility/duplicate)
  - severity 재분류: HIGH 235 / MEDIUM 11 / LOW 136 (개선된 tokenizer 효과)
  - 도메인별 분류: 회원(79), 충전(49), 선물(42), 거래(40), 메시지(38) 등 17개 도메인
  - Gap 패턴: /gift/*, /manual/*, /chargeDealing/*, /v2/messages/* 다수 미문서화 (LLM confirmed)
  - **내부/외부 API 분리 커버리지**: 외부(onnuripay) 83.7% (103/123), 내부 0% (107건, 설계서 대상 아님), 문서 역방향 90.4% (103/114)
  - 미문서화 외부 API 16건: card(4), cashBack(3), ledger(2), parties(2), wallet(2), approval(1), account(1), front(1)
  - **커버리지 분석 시각화**: Recharts 기반 도메인별 갭 차트 + 커버리지 트렌드 + 문서 보완 제안서 (진행현황 탭)
  - API 3종: `GET /factcheck/domain-summary`, `/trend`, `/document-suggestions`
  - 개선 로드맵: AIF-PLAN-017 (매칭 고도화 → AST 분석 → 문서 보완 제안, 3단계)
  - **Stage 1-2 완료**: camelCase 토큰 분리 + extractResourcePath Step 1.5 + 확장 noise 토큰
  - **Stage 2 완료**: regex 기반 Spring AST 파서 (`ast-parser.ts`, 296줄) + AST-Priority source-aggregator 통합 (R2 원본→AST→LLM 보충)
- **Multi-Org 코드 점검**: ✅ TD-02~08 해소 (7/12 이슈 해결, 잔여 5건은 LOW/기존)
  - ~~HIGH 4건~~: skills org_id 추가, HITL 통계/품질트렌드/Trust 쿼리 org 필터 추가 — **모두 해소**
  - ~~MEDIUM 3건~~: Neo4j org 격리, governance agent 하드코딩 제거 — **모두 해소**
  - 상세: SPEC.md §8 Tech Debt 참조
- **Cross-Org Comparison UI**: ✅ analysis-report 4번째 탭 구현 (조직 선택 → 비교 → 4-Group 대시보드)
- **Org-specific Status Report**: ✅ 진행 현황 탭 org-aware 리팩토링 — LPON 온누리상품권 보고서 신규, 퇴직연금 보고서 분리 보관
- **Repo Bootstrap**: ✅
- **PRD Seed Document**: ✅ (`docs/AI_Foundry_PRD_TDS_v0.6.docx`)
- **.claude Skills/Agents Migration**: ✅
- **Monorepo Scaffold**: ✅ (Bun workspaces + Turborepo, 118 files)
- **Shared Packages**: ✅ `@ai-foundry/types`, `@ai-foundry/utils`
- **svc-llm-router (SVC-06)**: ✅ 전체 구현 (tier routing, AI Gateway, streaming, cost log)
- **svc-security (SVC-07)**: ✅ 전체 구현 (RBAC, audit log)
- **svc-ingestion (SVC-01)**: ✅ 전체 구현 (upload → R2 + D1 + Queue)
- **Skeleton Services**: ✅ SVC-02~05, 08~10 (svc-policy는 HitlSession DO stub 포함)
- **app-web**: ✅ React + Vite SPA scaffold, 13 페이지 stub, React Router warnings 수정
- **D1 Migrations**: ✅ 10개 DB 스키마 작성 + remote 적용 완료 (2026-02-26)
- **Cloudflare 인프라**: ✅ D1(×10) / R2(×2) / Queue(×2) / KV(×2) 프로비저닝 완료, wrangler.toml ID 반영
- **CI/CD Workflows**: ✅ GitHub Actions (CI + 통합 deploy-services.yml + deploy-pages.yml)
- **typecheck**: ✅ 16개 패키지 전체 통과 (svc-queue-router 추가)
- **서비스 배포**: ✅ 전 서비스 배포 완료 (2026-02-28)
  - https://svc-llm-router.ktds-axbd.workers.dev — `GET /health` HTTP 200 ✅
  - https://svc-security.ktds-axbd.workers.dev — `GET /health` HTTP 200 ✅
  - https://svc-ingestion.ktds-axbd.workers.dev — `GET /health` HTTP 200 ✅
  - https://svc-notification.ktds-axbd.workers.dev — `GET /health` HTTP 200 ✅
  - https://svc-governance.ktds-axbd.workers.dev — `GET /health` HTTP 200 ✅
  - https://svc-extraction.ktds-axbd.workers.dev — `GET /health` HTTP 200 ✅
  - https://svc-policy.ktds-axbd.workers.dev — `GET /health` HTTP 200 ✅
  - https://svc-ontology.ktds-axbd.workers.dev — `GET /health` HTTP 200 ✅
  - https://svc-skill.ktds-axbd.workers.dev — `GET /health` HTTP 200 ✅
  - https://svc-queue-router.ktds-axbd.workers.dev — `GET /health` HTTP 200 ✅ (sole queue consumer)
  - https://svc-mcp-server.ktds-axbd.workers.dev — `GET /health` HTTP 200 ✅ (MCP Streamable HTTP)
- **Wrangler Secrets**: ✅ 전 서비스 INTERNAL_API_SECRET 설정 완료 (2026-02-28)
  - svc-llm-router: `INTERNAL_API_SECRET` / `ANTHROPIC_API_KEY` / `CLOUDFLARE_AI_GATEWAY_URL` ✅
  - svc-security: `INTERNAL_API_SECRET` / `JWT_SECRET`(auto-gen) ✅
  - svc-ingestion / svc-extraction / svc-policy / svc-ontology / svc-skill / svc-governance / svc-notification / svc-queue-router: `INTERNAL_API_SECRET` ✅
  - svc-ontology: `INTERNAL_API_SECRET` / `NEO4J_URI` / `NEO4J_USERNAME` / `NEO4J_PASSWORD` / `NEO4J_DATABASE` ✅
- **AI Gateway**: ✅ `ai-foundry` 게이트웨이 생성 완료, Authentication Off, Anthropic 라우팅 확인
- **E2E LLM 파이프라인**: ✅ `/complete` HTTP 200, `/stream` SSE 정상 수신 확인 (2026-02-26)
  - `INTERNAL_API_SECRET` printf 방식으로 재설정 (echo newline 이슈 해결)
- **E-01 마스킹 미들웨어**: ✅ `POST /mask` 구현 + 배포 완료 (2026-02-26)
  - PII 5종 탐지: SSN, PHONE, EMAIL, ACCOUNT, CORP_ID
  - `@ai-foundry/types` security.ts 추가 (MaskRequest/MaskResponse)
  - D1 `masking_tokens` 저장 (original_hash only)
- **E-02 Stage 1 완성**: ✅ svc-ingestion 큐 소비자 + Unstructured.io 연동 구현 (2026-02-26)
  - Queue consumer: `document.uploaded` 이벤트 처리
  - Unstructured.io `/general/v0/general` REST API 연동 (graceful fallback)
  - POST /mask 연동: 각 청크 마스킹 후 D1 저장
  - `document_chunks` 테이블 (infra/migrations/db-ingestion/0002_chunks.sql)
  - `parsing/unstructured.ts`, `parsing/masking.ts`, `parsing/classifier.ts`, `queue.ts` 신규
- **E-03 Stage 2 완성**: ✅ svc-extraction 구현 (2026-02-26)
  - Claude Sonnet/Haiku 연동으로 구조 추출 (process/entity/rule)
  - POST /extract + GET /extractions/:id + Queue consumer
  - svc-llm-router service binding 통한 LLM 호출
  - `prompts/structure.ts`, `llm/caller.ts`, `routes/extract.ts`, `queue/handler.ts` 신규
  - wrangler.toml `database_name = "db-structure"` 수정
- **E-04 Prompt Registry**: ✅ svc-governance 라우트 구현 (2026-02-28)
  - Prompt CRUD: `POST /prompts` (생성 + KV 캐시), `GET /prompts` (페이지네이션), `GET /prompts/:id` (KV → D1 fallback)
  - Trust Dashboard: `GET /trust` (집계), `POST /trust` (평가 기록)
  - Cost Monitoring: `GET /cost` (stub — cross-DB 집계 미구현)
  - `@ai-foundry/types` governance.ts 추가 (CreatePromptVersionSchema, CreateTrustEvaluationSchema)
- **E-05 RBAC 적용**: ✅ 전 서비스 RBAC 미들웨어 적용 (2026-02-28)
  - `@ai-foundry/utils` rbac.ts 추가 (extractRbacContext, checkPermission, logAudit)
  - svc-governance / svc-ingestion / svc-extraction에 RBAC 적용
  - 선택적 RBAC: X-User-Role 헤더 없으면 skip (inter-service 호출 허용)
- **E-06 Stage 3 Policy Inference**: ✅ svc-policy 전체 구현 (2026-02-28)
  - Claude Opus 기반 condition-criteria-outcome 정책 추론
  - `packages/types/src/policy.ts`: PolicyInferRequestSchema, PolicyCandidateSchema, HitlActionSchema
  - `services/svc-policy/src/prompts/policy.ts`: 퇴직연금 도메인 정책 추론 프롬프트 (10 TYPE 코드)
  - `services/svc-policy/src/llm/caller.ts`: svc-llm-router service binding (Opus tier)
  - `services/svc-policy/src/routes/policies.ts`: POST /policies/infer, GET /policies, GET /policies/:id
  - `services/svc-policy/src/queue/handler.ts`: extraction.completed 큐 소비자
  - D1 + DO 이중 영속: D1(쿼리용 프로젝션) + HitlSession DO(권한적 상태 머신)
  - Queue 이벤트: policy.candidate_ready 발행
- **E-07 HitlSession DO**: ✅ HITL 리뷰 워크플로우 전체 구현 (2026-02-28)
  - HitlSession DO 상태 머신: open → in_progress → completed
  - `services/svc-policy/src/hitl-session.ts`: DO fetch 라우팅 (init/assign/action)
  - `services/svc-policy/src/routes/hitl.ts`: approve/modify/reject/get-session 4개 라우트
  - modify: 허용 필드(condition, criteria, outcome, title) 동적 UPDATE
  - policy.approved 이벤트 발행 (approve + modify 시)
  - svc-policy/src/index.ts: 7개 엔드포인트 라우팅 + RBAC 적용
- **Phase F — svc-ontology (SVC-04)**: ✅ Stage 4 전체 구현 (2026-02-28)
  - Neo4j HTTP Transaction API 클라이언트 (Workers Bolt 미지원 → REST 사용)
  - POST /normalize: SKOS URI 생성, D1 terms 저장, Neo4j 그래프 upsert (graceful fallback)
  - GET /terms, /terms/:id, /graph: 용어 조회 + Neo4j Cypher 프록시
  - Queue consumer: policy.approved → ontology.normalized 이벤트 발행
  - RBAC: ontology:create (normalize), ontology:read (terms/graph)
- **Phase F — svc-skill (SVC-05)**: ✅ Stage 5 전체 구현 (2026-02-28)
  - SkillPackage 어셈블러: trust score 집계 + SkillPackageSchema Zod 검증
  - POST /skills: R2에 .skill.json 저장 + D1 카탈로그 + skill.packaged 이벤트
  - GET /skills, /skills/:id: 카탈로그 조회 (domain/status/trustLevel 필터)
  - GET /skills/:id/download: R2에서 .skill.json 다운로드 + download 로그
  - Sonnet tier LLM caller (문서 생성용)
  - RBAC: skill:create, skill:read, skill:download
- **E-08 Review UI**: ✅ app-web Persona B(Reviewer) 화면 구현 (2026-02-28)
  - review-queue.tsx: 정책 후보 목록 + 상태 필터 + 페이지네이션
  - review-detail.tsx: 조건/기준/결과 카드 + 승인/수정/반려 액션 패널
  - api/policy.ts: svc-policy API 클라이언트 (MVP 하드코딩 헤더)
- **G-01 Queue Router + 전 서비스 배포**: ✅ svc-queue-router 신규 + 전 서비스 배포 (2026-02-28)
  - svc-queue-router: 단일 Queue consumer → service binding fan-out 패턴
  - 기존 6개 서비스 queue consumer 제거 → POST /internal/queue-event HTTP 엔드포인트 전환
  - 라우팅 테이블: document.uploaded→ingestion, extraction.completed→policy, policy.approved→ontology, ontology.normalized→skill, policy.candidate_ready/skill.packaged→notification
  - 11개 Workers 전체 배포 + /health HTTP 200 확인 + INTERNAL_API_SECRET 설정
- **G-02 E2E 파이프라인 통합 테스트**: ✅ 이벤트 체인 수정 + 테스트 스크립트 (2026-02-28)
  - BUG-1 fix: svc-ingestion — `ingestion.completed` 이벤트 발행 추가
  - BUG-2 fix: svc-extraction — 실제 청크 조회 (SVC_INGESTION 바인딩) + `extraction.completed` 이벤트 발행
  - BUG-3 fix: DB 스키마 `extraction_id → id` 마이그레이션 + `organization_id` NOT NULL 대응
  - Queue Router 라우팅: `ingestion.completed → SVC_EXTRACTION` 추가
  - `scripts/test-e2e-pipeline.sh`: 8단계 하이브리드 E2E 테스트 (자동 큐 + 수동 API)
  - INTERNAL_API_SECRET 변경: `e2e-test-secret-2026` (bash `!` 확장 이슈 해결)
- **G-02b LLM 프롬프트 수정**: ✅ svc-policy JSON-only prompt + extractJsonArray 로버스트 파싱 (2026-02-28)
  - Opus가 prose/markdown 대신 순수 JSON 배열만 반환하도록 시스템 프롬프트 CRITICAL RULES 추가
  - extractJsonArray(): markdown fence 제거 + `[...]` 스팬 추출 헬퍼
- **G-02c E2E 8/8 PASS**: ✅ HITL auto-assign + sync D1 writes + UNIQUE 제약 제거 (2026-02-28)
  - handleApprovePolicy: DO session `open` → 자동 assign → action 순으로 streamlined
  - policy/session D1 INSERT를 ctx.waitUntil → await 동기화 (race condition 해결)
  - db-policy migration 0002: policy_code UNIQUE 제약 제거 (다중 실행 충돌 방지)
  - E2E script: CreateSkillRequestSchema에 맞는 payload로 수정 (PolicySchema, OntologyRef, Provenance)
  - E2E 결과: **8/8 PASS** (upload → extraction → policy → approve → ontology → skill → download)
- **G-03 MCP 어댑터**: ✅ GET /skills/:id/mcp — .skill.json → MCP Server tool definitions 변환 (2026-02-28)
  - `services/svc-skill/src/routes/mcp.ts`: on-the-fly 변환 (저장하지 않음)
  - 다운로드 로그 기록 (adapter_type: 'mcp')
- **G-04 Persona 화면**: ✅ app-web 9개 페이지 구현 (2026-02-28)
  - Persona A (Analyst): upload.tsx, pipeline.tsx, comparison.tsx
  - Persona C (Developer): skill-catalog.tsx, skill-detail.tsx
  - Persona D (Client): results.tsx, audit.tsx
  - Persona E (Executive): dashboard.tsx, cost.tsx
  - API 클라이언트 5개: ingestion, extraction, skill, security, governance
- **H-06 Neo4j Aura 연결**: ✅ Query API v2 클라이언트 리팩토링 + 4 secrets 설정 + 배포 + 그래프 검증 (2026-02-28)
  - Aura 5.x: HTTP Transaction API → 403 차단 → Query API v2 (`/db/{database}/query/v2`) 사용
  - neo4j/client.ts 전면 리팩토링, env.ts에 NEO4J_USERNAME/NEO4J_DATABASE 추가
  - `/graph RETURN 1` → HTTP 200, `/normalize` → Neo4j 노드+관계 upsert 검증 완료
- **H-07 Unit Test 확대**: ✅ svc-ingestion 53 tests (96.66%), svc-extraction 52 tests (100%) — 총 269 tests
- **H-08 환경 분리**: ✅ staging/production wrangler.toml + CI/CD (2026-02-28)
  - 12개 wrangler.toml에 [env.staging]/[env.production] 추가
  - deploy-services.yml: 통합 matrix 배포 (push→staging, release→production)
  - deploy-pages.yml: 환경별 Pages 배포
  - scripts/deploy.sh: 수동 배포 스크립트
- **I-01 RBAC 확장**: ✅ svc-notification + svc-analytics RBAC 미들웨어 추가 (2026-03-01)
  - packages/types/src/rbac.ts: "notification" 리소스 추가, 6개 역할별 권한 매트릭스
  - svc-notification: SECURITY service binding + notification:read/update RBAC + audit
  - svc-analytics: analytics:read RBAC + dashboards audit logging
- **I-02 Unit Test 대규모 확장**: ✅ 5개 서비스 440 tests 추가 (2026-03-01)
  - svc-governance: 59 tests (100% stmts)
  - svc-llm-router: 85 tests (98.85% stmts)
  - svc-ontology: 100 tests (100% stmts)
  - svc-security: 153 tests (97.14% stmts)
  - svc-queue-router: 43 tests (100% stmts)
- **Test Coverage**: 1,737 tests, 12 services + utils (vitest, 99 test files) — svc-extraction 420, svc-ingestion 341, svc-skill 173, svc-security 153, svc-llm-router 134, svc-ontology 110, svc-policy 109, svc-governance 83, svc-analytics 73, svc-queue-router 43, svc-mcp-server 35, svc-notification 28, packages/utils 35
- **Batch Scripts**: `scripts/batch-upload.sh` (bulk upload + resume + dry-run), `scripts/batch-status.sh` (status query + CSV export + polling)
- **Frontend**: https://ai-foundry-web.pages.dev (Cloudflare Pages) + https://rx.minu.best (커스텀 도메인)
  - 10/10 pages real API 연동 완료 (upload, analysis, hitl, audit, skill-catalog, dashboard, ontology, api-console, trust, settings)
- **E2E 스크립트**: `--staging`, `--real-doc <path>`, `--json`, `--wait-queue` 지원
- **샘플 문서**: test-docs/ (퇴직연금 합성 3건)
- **Staging 배포**: ✅ 11/11 Workers staging 배포 완료 + 12/12 healthy
  - URL 패턴: `https://svc-xxx-staging.ktds-axbd.workers.dev`
  - Service binding: staging worker 간 격리 (`-staging` 접미사)
  - Secrets: INTERNAL_API_SECRET ×11 + OPENAI_API_KEY + GOOGLE_AI_API_KEY + AI_GATEWAY_URL + JWT_SECRET
- **Production 배포**: ✅ 11/11 Workers + Pages 배포 완료 + 12/12 healthy
  - CI/CD: push→staging, release/manual→production + svc-queue-router default env skip
  - Monitoring: health-check.sh + GitHub Actions cron (30분)
- **로컬 개발**: ✅ 11개 서비스 동시 기동 (`bun run dev:local`, HTTP 8701-8711)

---

## 6) Execution Plan

### ✅ Phase A — Foundation Setup (완료)
- [x] monorepo 디렉토리 구조 (Bun workspaces + Turborepo)
- [x] 공통 타입/유틸 패키지 (@ai-foundry/types, @ai-foundry/utils)
- [x] tsconfig.base.json (strict TypeScript)
- [x] GitHub Actions CI/CD
- [x] D1 마이그레이션 스키마 10개

### ✅ Phase B — Infra Provisioning (완료)

- [x] D1 × 10 생성 + wrangler.toml `database_id` 반영
- [x] R2 × 2 (ai-foundry-documents, ai-foundry-skill-packages) 확인
- [x] Queue × 2 (ai-foundry-pipeline, ai-foundry-pipeline-dlq) 확인
- [x] KV × 2 (AI_FOUNDRY_PROMPTS, AI_FOUNDRY_CACHE) ID 반영
- [x] D1 마이그레이션 remote 적용 완료 (10개 DB × `0001_init.sql`)
- [x] **Wrangler Secrets 설정** — 실값 설정 완료 (printf 방식 사용)

### ✅ Phase C-0 — 첫 배포 + Smoke Test (완료)

- [x] `wrangler deploy` (svc-llm-router, svc-security, svc-ingestion) — 2026-02-26
- [x] INTERNAL_API_SECRET 설정 (모든 서비스)
- [x] `GET /health` 엔드포인트 smoke test — 전 서비스 HTTP 200 확인

### ✅ Phase C-1 — Secrets 완성 + E2E 검증 (완료)

- [x] ANTHROPIC_API_KEY, CLOUDFLARE_AI_GATEWAY_URL (svc-llm-router) 실값 설정
- [x] JWT_SECRET auto-gen (svc-security) 설정
- [x] AI Gateway 'ai-foundry' 생성 + Authentication Off
- [x] `/complete` E2E 테스트 — HTTP 200, Haiku 응답 확인
- [x] `/stream` E2E 테스트 — SSE 스트림 정상 수신 확인
- [x] `printf` 방식으로 INTERNAL_API_SECRET 재설정 (echo newline 이슈 해결)

### ✅ Phase C-2 — Pipeline Stage 1+2 Full Impl (E-01~E-03) (완료)
- [x] **E-01** — 마스킹 미들웨어: `POST /mask` (svc-security) 구현 + E2E 검증
- [x] **E-02** — Stage 1 완성: Unstructured.io 연동, 파일 분류 로직, Queue consumer, /mask 연동
- [x] **E-03** — Stage 2 완성: svc-extraction — Claude Sonnet/Haiku로 구조 추출

### ✅ Phase D — Governance Baseline (E-04~E-05) (완료)
- [x] **E-04** — Prompt Registry: svc-governance에 버전 관리/롤아웃 구현
- [x] **E-05** — RBAC 적용: svc-governance / svc-ingestion / svc-extraction에 RBAC 미들웨어 적용

### ✅ Phase E — Policy Inference + HITL (E-06~E-08, Phase 2) (완료)
- [x] **E-06** — Stage 3: svc-policy 전체 구현 (Claude Opus 연동)
- [x] **E-07** — HitlSession DO: 실제 리뷰 워크플로우 구현
- [x] **E-08** — Review UI: app-web Persona B 화면 구현

### ✅ Phase F — Ontology + Skill Packaging (Phase 3) (완료)
- [x] Stage 4: svc-ontology — Neo4j Aura + SKOS/JSON-LD
- [x] Stage 5: svc-skill — Skill Spec 완성, R2 패키징
- [x] MCP 어댑터 생성

### ✅ Phase G — Integration + Deployment (Phase 4) (완료)
- [x] **G-01** — svc-queue-router 신규 + 전 서비스 배포 (Queue Router 패턴)
- [x] **G-02** — E2E 파이프라인 통합 테스트 (이벤트 체인 수정 + 스크립트)
- [x] **G-02b** — svc-policy LLM 프롬프트 수정 (JSON-only + extractJsonArray)
- [x] **G-02c** — E2E 8/8 PASS (HITL auto-assign + sync D1 + UNIQUE 제거)
- [x] **G-03** — MCP 어댑터 생성 (GET /skills/:id/mcp)
- [x] **G-04** — app-web 나머지 Persona 화면 (A, C, D, E — 9페이지)

### ✅ Phase H — Hardening + Production Readiness (완료)
- [x] Unit test 작성 — svc-policy 73.55%, svc-skill 80.41% (132 tests)
- [x] app-web Cloudflare Pages 배포 — https://ai-foundry-web.pages.dev
- [x] **H-06** Neo4j Aura 연결 — Query API v2 클라이언트, 4 secrets 설정, 그래프 검증
- [x] svc-notification 알림 로직 구현 + 배포 (16 tests, 96.72% coverage)
- [x] svc-analytics KPI 집계 + 배포 (16 tests, 89.65% coverage) + queue-router fan-out
- [x] **H-07** Unit test 확대 — svc-ingestion 53 tests (96.66%), svc-extraction 52 tests (100%). 총 269 tests
- [x] **H-08** 프로덕션 환경 분리 — staging/prod wrangler.toml + 통합 CI/CD + deploy.sh

### ✅ Phase I — Staging Provisioning + Polish (완료)
- [x] **I-01** — svc-notification + svc-analytics RBAC 미들웨어 추가 (notification 리소스 타입 포함)
- [x] **I-02** — 5개 서비스 unit test 추가 (440 tests, 97-100% coverage)
- [x] **I-03** — `/team` 스킬 interactive mode 안정화 (trap EXIT, 3-tier 모니터링, scope 관리)
- [x] **I-04** — Staging 리소스 프로비저닝 (D1×10, R2×2, Queue×1, KV×2) + wrangler.toml ID 교체 + D1 migration 적용
- [x] **I-05** — GitHub Environments 설정 (repo secrets + production deployment_branch_policy)
- [x] **I-06** — 프로덕션 모니터링 (health-check.sh + GitHub Actions cron 30분)

### ✅ Phase 2 — Real Document Pilot (완료)

#### ✅ Phase 2-A — Production E2E 검증 (완료)
- [x] Production 11/11 배포 + 12/12 healthy
- [x] E2E Pipeline 8/8 PASS (synthetic) + 7/7 PASS (real-doc)
- [x] UNSTRUCTURED_API_KEY 시크릿 설정

#### ✅ Phase 2-B — 품질 메트릭 인프라 (완료)
- [x] D1 마이그레이션: quality_metrics, stage_latency, quality_evaluations
- [x] 이벤트 페이로드 확장: parseDurationMs, ruleCount, wasModified, termCount
- [x] svc-analytics GET /quality + svc-governance /quality-evaluations API
- [x] 파일럿 대시보드 (Trust 페이지 탭 추가)
- [x] Settings 페이지: 시스템 Health 모니터링 + 알림 연동

#### ✅ Phase 2-C — Staging 배치 테스트 (완료)
- [x] 퇴직연금 합성 문서 10건 세트 준비 + 배치 E2E 10/10 PASS
- [x] svc-extraction 품질 개선 (적응형 프롬프트, 스마트 청크 선택)
- [x] org ID 전파 버그 수정 (Stage 3-5 이벤트 스키마 + 7개 서비스)
- [x] extraction pending 버그 해결 (fetchChunks 파싱 + failed 상태 전환)

#### ✅ Phase 2-D — 실문서 파일럿 (완료)
- [x] 멀티 프로바이더 LLM (Anthropic→OpenAI→Google→Workers AI fallback)
- [x] HITL 47건+34건 승인 — policies 134+, terms 1,441, skills 171
- [x] 퇴직연금 대표 문서 11건 업로드 (9/11 parsed, 2건 SCDSA002 비표준)
- [x] ~~SCDSA002 비표준 XLSX 조사~~ (AIF-REQ-001 REJECTED: DRM 암호화 파일 파싱 제외)
- [ ] Anthropic 크레딧 충전 후 품질 비교 (AIF-REQ-002 IN_PROGRESS)
- [ ] 추가 문서 업로드 764건 XLSX 중 선별 (AIF-REQ-003 TRIAGED)
- [x] PDF/PPTX 대용량 문서 524 timeout 해결 (AIF-REQ-004 DONE)

### ✅ Phase 3 — MCP/OpenAPI 실사용 (완료)
- [x] Sprint 1: Skill Evaluate 엔드포인트 (POST /skills/:id/evaluate + GET /evaluations)
- [x] Sprint 1: Multi-provider benchmark (Anthropic/OpenAI/Google 비교 + consensus)
- [x] Sprint 1: D1 skill_evaluations 테이블 + 3환경 배포 + E2E 검증
- [x] Sprint 2: Skill 검색 API + Marketplace UX + Detail 페이지
- [x] Sprint 3: MCP Server Worker + Skill 버전 관리
- [x] MCP adapter를 실제 MCP 클라이언트(Claude Desktop 등)에서 테스트 (AIF-REQ-005 DONE)
- [x] OpenAPI adapter 외부 시스템 연동 검증 (AIF-REQ-006 DONE)

### ✅ Phase 4 — Real Document Pipeline (완료)
- [x] Sprint 1: screen-design-parser + Batch 3 (7/11 파싱) + Queue fix + SCDSA002 탐지 + 배치 자동화
- [x] Sprint 2: bulk-approve 3,046건 + Tier 2+3 87건 업로드 + 파이프라인 완결 (26,825 terms, 3,104 skills)

### ✅ Phase 5 — Recon-X MSA 재조정 (AIF-REQ-030, AIF-REQ-031) — Sprint 1 완료
- [x] M1: 플랫폼 SVC 5개 분리 — 254 files, -21,453줄 (AIF-REQ-030 DONE)
- [x] M2: D1 바인딩 정리 — 7 Workers wrangler.toml 39 블록 제거
- [x] M3: LLM 라우팅 전환 — packages/utils/src/llm-client.ts HTTP REST
- [x] M4: 프론트엔드 정리 — audit, trust, agent-console, generative-ui 제거
- [x] M5: 리포 리네임 — KTDS-AXBD/Recon-X 완료
- [x] M6: E2E 테스트 — 11/11 suites PASS, typecheck 13/13 PASS
- [x] M7: 서비스 연동 인터페이스 — llm-client.ts HTTP REST 인터페이스
- [x] S1: CI/CD — deploy-services.yml 5개 SVC 제거
- [x] S2: 모니터링 — health-check.sh 7 Workers 전용
- [x] S3: Turborepo — pnpm-lock.yaml 경량화
- [x] S4: 문서 갱신 — CLAUDE.md Recon-X 관점 갱신 완료 (AIF-REQ-031 DONE)

### 🔧 Phase 6 — Foundry-X Generative Bridge Finish Line (AIF-REQ-026 Phase 2+, AIF-REQ-024)

> **Plan 보정 (Sprint 201 완료 직후 감사)**: 당초 Phase 6 범위의 70~80%가 이미 세션 166~199(2026-03-18~19)에 구현되어 있었음이 확인됨. SPEC/MEMORY에 해당 구현이 추적되지 않아 중복 계획이 발생. 감사 결과 다음 자산이 확인됨:
> - `apps/app-mockup/src/lib/widget-bridge.ts`, `decision-matrix.ts`, `widget-theme.ts` + `components/shared/WidgetRenderer.tsx` + HITL 3종(`PolicyApprovalCard`, `EntityConfirmation`, `ParameterInput`) + `AgentRunPanel.tsx` (47 tests PASS, `803489c`/`1a90b78`)
> - `packages/types/src/ag-ui.ts` — AG-UI Protocol 22종 event discriminated union (`9ea00e9`)
> - `services/svc-mcp-server` meta-tool 3종(`foundry_policy_eval/skill_query/ontology_lookup`) + SSE 스트리밍 (`b959d09`, 56 tests PASS)
> - `apps/app-web/src/components/generative-ui/` + `pages/agent-console.tsx` (포트 완료 `1dc0d5d`)
> 
> Phase 6을 **finish line 정리 작업**으로 대폭 축소. v0.8 마일스톤 범위도 이에 맞춰 재정의.

**완료:**
- [x] Sprint 201 (REQ-026 A1): Foundry-X 핸드오프 포맷 Zod 검증 테스트 5종 + svc-skill README 9-file 구조 갱신. Match Rate 100%, 315 tests PASS (신규 5), PR #2 (commit `07f64db`)

**Batch 1 (Sprint 202 단독 → Sprint 203으로 이어짐):**
- [ ] Sprint 202 (REQ-026 A2 잔여): **AgentResume state 복구** — `services/svc-mcp-server/src/routes/agent.ts`의 AgentResume 엔드포인트 stub(line 164~181, `{status:"resumed"}` 고정 반환) 실구현. resumeToken ↔ 에이전트 세션 매핑 + DO/KV 상태 저장 + continuation. 대상: `services/svc-mcp-server`

**Batch 2 (Sprint 203 단독, Sprint 202 merge 후 의존):**
- [ ] Sprint 203 (REQ-024 B2 잔여): **HITL backend state management** — Policy/Entity/Parameter HITL 응답을 `/agent/resume`로 전달하여 에이전트 세션 state 복구 + next tool-call 진행. HITL response schema 표준화 + e2e 시나리오(app-mockup `generative-demo` → svc-mcp-server SSE → HITL 응답 → resume) PASS. 대상: `services/svc-mcp-server`, `apps/app-mockup/src/components/shared/hitl/`

**Batch 3 (Sprint 204 독립, 언제든 병렬 가능):**
- [ ] Sprint 204 (REQ-024 B2 잔여 + 통합): **Theme Injection + app-web 배포** — design-system tokens(Tailwind/shadcn) → iframe CSS 변수 매핑, `lib/widget-theme.ts` 확장(기본 CSS 변수 → design-token 계층화). `apps/app-web/pages/agent-console.tsx` production 빌드 검증 + `rx.minu.best/agent-console` 배포. 대상: `apps/app-web`, `packages/types/src/ag-ui.ts` (Theme schema 추가 시)

**완료 기준 (마일스톤 v0.8 축소판):**
- AgentResume 실구현 + HITL resume e2e PASS
- `rx.minu.best/agent-console` production 배포 + design-token theme 정상 주입
- AIF-REQ-024 DONE (기구현 + 잔여 완료)
- AIF-REQ-026 Phase 2 DONE (반제품 + 핸드오프 + meta-tool + AgentResume)

**Plan 보정 교훈 (반영 대상):**
- SPEC §7 REQ 상태가 구현 진척과 drift할 때 다음 Sprint 계획이 잘못 세워짐 → `/ax:todo plan` 시작 시 `git log --all --name-status` 기반 "기구현 스캔" 단계 추가 필요
- CLAUDE.md에 "Sprint 계획 전 기구현 확인" 체크리스트 신설 고려

### AIF-REQ-034 Deep Dive 정식 구현 (세션 202~)

> **진단 결과** (세션 202): LPON 894건 signal 분석 — 664건(74%) api+field+adapter 전무, 230건(26%) partial signal, **894건 전수 adapterHit=false** (skill-builder.ts `adapters: {}` 하드코딩). Technical 4.3%의 근본 원인은 (1) adapter 미부착(전수), (2) 프롬프트 Technical 미추출(74%).

**Batch 1 (Sprint 205 ∥ Sprint 206, 병렬 — 파일 충돌 없음):**
- [x] Sprint 205 (REQ-034 A): **Adapter 복구 + Drill-down API** — skill-builder.ts adapter 동기 생성(`toMcpAdapter`/`toOpenApiSpec` → R2 저장 → adapters 필드 주입) + `/admin/backfill-adapters` 기존 894건 재처리 + `GET /admin/skill-detail/:skillId` B/T/Q 원문 분해 API. 대상: `services/svc-skill/src/assembler/`, `services/svc-skill/src/routes/`, `services/svc-skill/src/index.ts`. **KPI**: 894건 전수 adapterHit=true, technical avg ≥0.3
- [x] Sprint 206 (REQ-034 B): **Technical Schema + Extraction 프롬프트 강화** — `@ai-foundry/types` ExtractionResult에 `apis[]`, `tables[]`, `dataFlows[]`, `errors[]` 4축 추가(Zod) + svc-extraction structure.ts 프롬프트에 Technical 섹션 additive 추가. 기존 Business 추출 유지. 대상: `packages/types/src/`, `services/svc-extraction/src/prompts/`. **KPI**: 샘플 5건 재추출 시 4축 JSON 생성 확인

**Batch 2 (Sprint 207, Batch 1 merge 후 순차):**
- [x] Sprint 207 (REQ-034 C): **Drill-down 페이지 + Assembler 주입 + Before/After** — `/poc/ai-ready/:skillId` 3탭 drill-down(B/T/Q Spec 원문 + 채점 signal) + svc-skill assembler에 Technical 원문 주입(`apis/tables/dataFlows/errors` → SkillPackage) + Before/After 재채점 비교 뷰. 대상: `apps/app-web/src/pages/`, `services/svc-skill/src/assembler/`. **KPI**: LPON AI-Ready passRate ≥50%(현재 23.6%), drill-down에서 B/T/Q 원문 확인

**Batch 3 (Sprint 208, Spec 문서 생성기):**
- [x] Sprint 208 (REQ-034 D): **B/T/Q Spec 문서 생성기** — Template+LLM Hybrid 방식으로 추출 데이터를 사람이 읽을 수 있는 Spec 문서(Business: 업무규칙/프로세스/엔티티/용어사전, Technical: API/ERD/데이터흐름/에러, Quality: 성능/보안/추적성/검증)로 조립. `GET /skills/:id/spec/{business|technical|quality|all}` API (JSON+Markdown). OpenRouter→Claude 3 Haiku로 요약+Gap 코멘터리 생성. 대상: `services/svc-skill/src/spec-gen/` (신규 8파일, 1,593줄), `packages/utils/src/openrouter-client.ts`. **KPI**: LPON 3건 Skill B/T/Q Spec 생성 + LLM 보강 확인

**Batch 4 (Sprint 209, Org 집계 + UI):**
- [x] Sprint 209 (REQ-034 E): **Org 단위 B/T/Q 종합 Spec + UI** — Org 전체 skills를 집계하여 종합 Spec 문서 생성(`GET /admin/org-spec/:orgId/:type`). collector.ts 재활용. drill-down UI에 Spec 문서 탭 추가(`poc-ai-ready-detail.tsx`). org-spec 전용 페이지 신규(`/org-spec`). 대상: `services/svc-skill/src/spec-gen/` (org-spec 확장), `services/svc-skill/src/routes/` (admin 라우트), `apps/app-web/src/pages/` (UI). **KPI**: LPON org 종합 B/T/Q Spec 생성 + UI 확인. **PR #7 merged, Match Rate 100%**

**Batch 5 (Sprint 210, AI-Ready 채점기 + PoC 리포트):**
- [ ] Sprint 210 (REQ-034 F): **AI-Ready 6기준 일괄 채점기 + PoC 리포트** — LPON 859개 skill 대상 AI-Ready 6기준(completeness/consistency/testability/implementability/traceability/adaptability) 일괄 채점 스크립트 + 결과 리포트 페이지. Tacit Interview Agent 포맷 명세 + Handoff 패키지 검증 포맷 명세. 4/17 10:00 보고 PoC 준비. 대상: `services/svc-skill/src/` (채점 로직), `apps/app-web/src/pages/` (리포트 UI). **KPI**: LPON 전체 skill 6기준 채점 완료, 완결성 ≥80%, 6기준 통과율 ≥90%

### 🔧 Phase 7 — Decode-X v1.3 Phase 2 본 개발 (AIF-REQ-035 Phase 2) (세션 216~)

> **Phase 2 PRD Ready** (2026-04-19, 세션 216). PRD `docs/req-interview/decode-x-v1.3-phase-2/prd-final.md` (R1 79 / R2 74 + Ambiguity 0.120, Phase 1 선례 기반 착수 정당화).
>
> **목표**: Foundry-X 핸드오프가 LPON 결제 도메인에서 End-to-End로 동작하는 첫 사례. Track A(Tier-A 잔여 6서비스 Empty Slot Fill) + Track B(결제 E2E → Foundry-X 실 실행 → round-trip 데이터 동작 검증). Source-First(원장=소스/참고=문서) + ERWin ERD 추출 R&D.
>
> **스코프 핵심 변화**: Phase 1 "문서 기반" → Phase 2 "Java/Spring 소스 기반". 정량 자산(D1/LPON 88문서) 비참조, 정성 자산(B/T/Q Schema·Tacit·Handoff·T3·llm-client) 계승.

> **세션 217 재정의** (2026-04-20): 체크리스트 인터뷰 결과 반영 — (1) Sprint 211을 **FX-SPEC-003 Decode-X Handoff Contract 신규 발행**으로 전환 (v1.0 PlumbBridge 계약은 그대로 유지), (2) Sprint 212 AST 파서 **javaparser (JVM)** 확정 — Cloudflare Worker 직접 실행 불가로 offline CLI/Node wrapper 사전 파싱 방식, (3) Sprint 213 ERWin **경로 A (SQL DDL)** 확정 — lpon-charge 소스 기반, (4) Sprint 214를 **214a/214b/214c 3분할** (2서비스×3 Sub-sprint), (5) Sprint 215 Foundry-X 수용 엔드포인트 **신규 구현 불요** — 기존 `POST /prototype-jobs` (F353)에 Handoff Package 매핑 어댑터로 범위 축소.

**Batch 1 (Sprint 211, 선행 게이트):**
- [x] Sprint 211 ✅ MERGED (REQ-035 Phase 2 A, 세션 217, PR #14 @ 82302ec): **FX-SPEC-003 Decode-X↔Foundry-X Handoff Contract 신규 발행** — Match Rate 9/9 = 100%. `docs/specs/FX-SPEC-003-handoff-contract.md` (291줄, self-sign 2026-04-20) + `docs/mou/FX-SPEC-003.md` (56줄 미러) + Plan/Design/Report. Tier-A 6개 서비스 특성·Gate 기준·/callback 피드백 루프·SyncResult 수용 기준 명시. FX-SPEC-002 (PlumbBridge v1.0) 동결 유지. **Foundry-X mirror**: `KTDS-AXBD/Foundry-X` master @ `bef719fd` (`docs/specs/FX-SPEC-003-handoff-contract.md` 동일 파일 291줄 mirror push 완료) — Tier-A 6개 서비스 특성 + E2E 실행 요구사항 + Working Prototype 수용 기준 + /callback 피드백 루프 명시. 대상: `docs/specs/FX-SPEC-003-handoff-contract.md` (신규, Foundry-X repo) + Decode-X 측 `docs/mou/FX-SPEC-003.md` (미러, `/ax:git-sync`로 동기화). v1.0 PlumbBridge 계약(FX-SPEC-002)은 변경 없음. **KPI**: self-sign 완료, Sprint 212 착수 전 freeze

**Batch 2 (Sprint 212 ∥ Sprint 213, 병렬):**
- [x] Sprint 212 ✅ MERGED (REQ-035 Phase 2 B, 세션 217, PR #15 @ 10fca6a): **Java/Spring AST 파서 CLI + Source-First Reconciliation 엔진** — Match 100%, 42 tests PASS. `packages/types/src/reconcile.ts` (타입) + `packages/utils/src/reconcile.ts` (105줄, 3종 마커 엔진 SOURCE_MISSING/DOC_ONLY/DIVERGENCE) + `scripts/java-ast/` (offline CLI, @ai-foundry/java-ast-cli). 테스트 픽스처: LponPaymentController.java. KPI 1 (LPON 결제 소스 AST 추출) + KPI 2 (DIVERGENCE paramCount 차이 감지) 충족. 설계 변경: javaparser JVM 대안으로 Node CLI 자체 구현 (Worker 실행 경로 분리). Autopilot session-end pr-lookup hang → Master 수동 PR 생성 + merge로 복구 — Stage 1 입력 채널 전환. **javaparser (JVM) 확정** — Cloudflare Worker 직접 실행 불가 → offline CLI 또는 Node wrapper로 사전 파싱 후 결과 주입 방식. 3종 차이 마커(SOURCE_MISSING/DOC_ONLY/DIVERGENCE). 대상: `services/svc-ingestion/src/parsing/` 확장 + `packages/utils/src/reconcile.ts` (신규) + `scripts/java-ast/` (신규, offline CLI). **KPI**: LPON 결제 소스 1개 모듈 AST 추출 성공 + 문서 대조 시 최소 1건 DIVERGENCE 로그 생성
- [x] Sprint 213 ✅ MERGED (REQ-035 Phase 2 C, 세션 217, PR #16 @ ec9ea72): **ERWin ERD 추출 PoC — SQL DDL 파서 (경로 A)** — Match 100%, 50/50 tests PASS, typecheck 0. `packages/utils/src/erd-parser.ts` (401줄, CREATE TABLE→entity/relation JSON + PK/FK/NOT NULL/UNIQUE/한글주석) + 225줄 테스트 (LPON `0001_init.sql` 기반) + `scripts/erwin-extract/` (offline CLI @ai-foundry/erwin-extract). KPI: 5+ 테이블, 10+ 관계, 4종 마커 전량 추출 충족. 경로 B(XML) 보류. Autopilot commit 단계 hang → Master 수동 commit/push/PR + rebase(212 index.ts 충돌)로 복구 — SQL DDL export 파싱만 PoC (경로 B 보류). lpon-charge 기반 DDL(`반제품-스펙/pilot-lpon-cancel/working-version/migrations/0001_init.sql` 등) 소스로 파서 개발. 대상: `scripts/erwin-extract/` (신규) + `packages/utils/src/erd-parser.ts` (신규). **KPI**: SQL DDL → entity/relation JSON 변환 성공 (최소 5 테이블, 10 관계)

**Batch 3 (Sprint 214a ∥ Sprint 214b ∥ Sprint 214c, Track A 양적 3분할):**
- [x] Sprint 214a ✅ MERGED (REQ-035 Phase 2 D1, 세션 217, PR #17 @ e4cabe4): **Track A Fill — 예산 + 구매** — Match 100%. `.decode-x/spec-containers/lpon-budget/` (BB-001~005 + ES-BUDGET-001/002/003 낙관적잠금·Saga복구·이월배치) + `lpon-purchase/` (BP-001~005 + ES-PURCHASE-001/002/003 멱등성·월한도·유효기간). 각 서비스 10건 테스트 시나리오 + contract + runbook 3건. AI-Ready 6/6, 소스 출처 추적성 100%. Autopilot session-end pr-lookup hang → Master 수동 PR + rebase로 복구 — 각 소스 원장 기반 Empty Slot 발굴·Fill (각 ~2~3 슬롯). Phase 1 "충전" 방법론 재활용. 대상: `.decode-x/spec-containers/lpon-budget/`, `lpon-purchase/` (신규). **KPI**: 완결성 ≥95%, AI-Ready 6기준 ≥70%, 소스 출처 추적성 100%
- [x] Sprint 214b ✅ MERGED (REQ-035 Phase 2 D2, 세션 217, PR #19 @ ebd838b): **Track A Fill — 결제 + 환불** — Match 100% (36/36), AI-Ready 10/10 ES condition-criteria-outcome. `.decode-x/spec-containers/lpon-payment/` (BL-013~019 + ES-PAYMENT-001~005 멱등성·카드재시도·MIXED 보상·SMS·AP06) + `lpon-refund/` (BL-020~030 + ES-REFUND-001~005 rfndPsbltyYn·캐시백대안·계좌오류·강제환불·제외금액). 각 ES: rules/ + runbooks/ + tests/ + contract/. **Sprint 215 E2E Handoff 입력 준비 완료**. Autopilot DONE까지 성공했으나 PR 생성 누락 → Master 수동 PR + 2회 rebase로 복구 (Track B 선행 필수). 대상: `.decode-x/spec-containers/lpon-payment/`, `lpon-refund/`. **KPI**: 동일. 결제 Fill은 Sprint 215 E2E 입력이 되므로 **214a/214c보다 우선 merge**
- [x] Sprint 214c ✅ MERGED (REQ-035 Phase 2 D3, 세션 217, PR #18 @ 231e011, **autopilot 자체 merge**): **Track A Fill — 선물 + 정산** — Match 100%. `.decode-x/spec-containers/lpon-gift/` + `lpon-settlement/`. Phase 1 Sprint 4~5 autopilot 자체 merge 패턴 재현 (Batch 3 3개 중 유일). 대상: `.decode-x/spec-containers/lpon-gift/`, `lpon-settlement/`. **KPI**: 동일

**Batch 4 (Sprint 215 → Sprint 216, 순차):**
- [x] Sprint 215 ✅ MERGED (REQ-035 Phase 2 E, 세션 217, PR #20 @ 18022c8, **autopilot 자체 merge**): **Track B Handoff Adapter → Foundry-X POST /prototype-jobs** — Match 100%. `packages/utils/src/handoff-adapter.ts` (신규, HandoffPackage → prdContent 매핑) + `services/svc-skill/src/routes/handoff.ts` 확장 (submit 엔드포인트) + `infra/migrations/db-skill/0007_handoff_jobs.sql` (신규 D1 마이그레이션) + 테스트 3종 (handoff-adapter, handoff.submit, queue/handler). 설계 변경 없이 Batch 3 214b 결제+환불 Spec Container를 입력으로 F353 엔드포인트 매핑 성공. autopilot 자체 완결 (Phase 1 Sprint 4~5 + Sprint 214c 패턴 재현) — Decode-X Handoff Package를 Foundry-X `POST /prototype-jobs` (F353) 수용 포맷(`prdContent + prdTitle`)으로 변환하는 어댑터 구현. FX-SPEC-003 수용 기준 준수. Foundry-X 측 신규 엔드포인트 **불요**. 대상: `services/svc-skill/src/routes/handoff.ts` 확장 + `packages/utils/src/handoff-adapter.ts` (신규). **KPI**: Handoff 수용 200 응답 1/1, Working Prototype 생성 PASS
- [x] Sprint 216 ✅ MERGED (REQ-035 Phase 2 F, 세션 217, PR #21 @ 0947a92, **autopilot 자체 merge**): **Working Prototype 데이터 동작 검증 하네스** — Match 98%, round-trip 일치율 **91.7%** (11/12, KPI ≥ 90% 달성). `scripts/roundtrip-verify/` (신규, 계약 YAML → 도메인 함수 직접 호출) + `apps/app-web/src/pages/poc-phase-2-report.tsx` (신규 /poc-phase-2 대시보드). **TC-REFUND-002 1건 실패 = Source-First 정책 성과**: BL-024 7일 기간 체크 미구현이 SOURCE_MISSING 마커로 자동 검출됨. PRD M-3 "Source-First Reconciliation 실제 감사 로그 사용" 요건 충족. autopilot 자체 PR 생성 + merge 완결 — 실 데이터 sample N건 → Working Prototype 실행 → 결과 vs 기대값 round-trip 일치율 측정. 대상: `scripts/roundtrip-verify/` (신규) + `apps/app-web/src/pages/poc-phase-2-report.tsx`. **KPI**: round-trip 일치율 ≥90%, 실패 케이스 구체 원인 분석 기재

### ✅ Phase 8 — v1.3 Phase 3 본 개발 (AIF-REQ-035 Phase 3, 품질 도구 + Production 운영화) — 🔧 IN_PROGRESS

> **PRD**: `docs/req-interview/decode-x-v1.3-phase-3/prd-final.md` (v1.2, R2 77 + Amb 0.122 + Phase 1/2 선례 기반 착수 정당화)
> **목표**: Phase 2 미완 마무리(TD-24 DIVERGENCE 마커 / TD-25 Foundry-X Production E2E 증거) + AI-Ready 자동 채점기 + AgentResume 실구현 + Tree-sitter 업그레이드 등 품질·운영 성숙
> **MVP 임계값**: True Must 2건 — F354 (M-1) + F355a (M-2a 재정의). 세션 218 사전 조사로 F355 분할 후 M-2a로 축소
> **착수일**: 2026-04-21 (세션 218)

**Sprint 218 (True Must, Week 1):**
- [x] F354 ✅ (AIF-REQ-035 Phase 3 M-1, **P0**, 세션 218): **TD-24 DIVERGENCE 공식 마커 발행** — `.decode-x/spec-containers/lpon-refund/provenance.yaml`에 `divergenceMarkers` 섹션 신규 발행 (5건: BL-024 HIGH + BL-026/028/029 MEDIUM + BL-027 LOW). BL-024는 TC-REFUND-002 WRONG_OUTCOME 감사 로그 직접 링크(`scripts/roundtrip-verify/last-report.json:182-187`). BL-028은 `refund.ts:80-82` hard-coded `exclusionAmount = 0`과 TD-22 silent PASS 교차 언급. BL-026/029는 ES edge spec 링크, BL-027은 `approveRefund:130-135` 부분 구현 명시. KPI "≥3건 DIVERGENCE" 5건으로 충족. reconcile 엔진(API-level) 대비 BL-level divergence는 수동 큐레이션 + ES edge spec 링크 방식 채택 — Phase 3 이후 자동 검출 확장 검토. 경로 공식화: PRD 문서상 `docs/poc/sprint-214b/lpon-refund/` → 실제 `.decode-x/spec-containers/lpon-refund/`
- [x] **F355 갭 명세 ✅** (세션 218): F355 사전 조사에서 6중 구조 갭 발견 → 분할(F355a/F355b/F362). 분석 보고서 `docs/03-analysis/features/sprint-218-f355-gap-analysis.md`. 갭: (1) FOUNDRY_X_URL worker 이름 오류(`-production`→`-api`), (2) handoff path `/api/` prefix 누락, (3) FOUNDRY_X_SECRET production 미설정, (4) 0007_handoff_jobs.sql production 미적용, (5) 인증 모델 미스매치(X-Internal-Secret vs JWT+tenant), (6) **lpon-* spec-container ↔ skills D1 packaging pipeline 부재**. Sprint 215 자가보고 "200 응답 1/1"은 로컬 mock/픽스처 결과. TD-25 "증거 부재"의 결정적 보강 증거 확보
- [x] F355a ✅ (AIF-REQ-035 Phase 3 M-2a, **P0**, 세션 218): **Decode-X handoff Production 도구 정리 — 갭 #1~#4 4건 모두 해소**. (1) `services/svc-skill/wrangler.toml` `FOUNDRY_X_URL` 정정: staging `foundry-x-staging` → `foundry-x-api-staging`, production `foundry-x-production` → `foundry-x-api`. (2) `services/svc-skill/src/routes/handoff.ts:240` path `/prototype-jobs` → `/api/prototype-jobs` 정정 + F355b/TD-31 인증 미스매치 미해소 주석 추가. (3) Production secret `FOUNDRY_X_SECRET` 등록 (placeholder `PENDING-F355B-AUTH-INTEGRATION-SESSION-218` — F355b에서 실값 결정). (4) `infra/migrations/db-skill/0007_handoff_jobs.sql` production D1 적용 (`handoff_jobs` table 생성 검증 ✅). svc-skill production redeploy (version `ee087cbf-aeb6-4405-9a56-f35a86eccd41`, FOUNDRY_X_URL `https://foundry-x-api.ktds-axbd.workers.dev` 활성). Production health 200 + dummy submit 401(UNAUTHORIZED, INTERNAL_API_SECRET 미들웨어 정상 동작 확인) 검증. typecheck PASS
- [x] ~~F355b~~ ✅ **superseded by Sprint 228 F397/F398** (세션 231 정합성 보정, 2026-04-22): 원 계획 "Foundry-X internal endpoint 신설(X-Internal-Secret 미들웨어 + orgId)" 대신 **Sprint 228이 Service Binding `SVC_FOUNDRY_X`로 우회**하여 M-2 KPI Production E2E 7/7 달성. F398(`/handoff/submit` × 7 HTTP 201) + AIF-ANLS-031 증빙으로 TD-25 완전 해소. 원 Cross-repo PR 전략은 불필요 — CF error 1042 근본 원인(same-zone Workers HTTP fetch 금지)이 Service Binding으로 해결되면서 인증 미스매치 갭(#5)도 자연 해소
- [x] ~~F362~~ ✅ **superseded by Sprint 228 F397** (세션 231 정합성 보정, 2026-04-22): 원 계획 "신규 endpoint `POST /skills/from-spec-container`" 대신 **Sprint 228이 `scripts/package-spec-containers.ts` CLI 스크립트로 구현** — 7 lpon-* containers packaging 완료(AI-Ready mean 0.916, min 0.888 전원 ≥ 0.8, skillIds 7개 확정). Sprint 225 converter.ts 패치(P1~P5) + `--with-ai-ready --report` 플래그(Shadow Real Scorer)와 연계하여 Tier-A handoff 데이터 흐름 복원(TD-32 갭 #6 해소). 엔드포인트 형태의 API 대체 구현은 F356-B Phase 2에서 `/skills/ai-ready/batch`와 함께 재고 가능
- [ ] F360 (AIF-REQ-035 Phase 3 S-5, P3): **TD-20/21/23 Phase 2 작연 정리** — Sprint 215 retroactive Plan/Design(0.5h) + gift/settlement provenance FX-SPEC 버전 drift 수정(0.1h) + `rfndPsbltyYn` 하드코딩 해결(1h). 총 1.6h

**Sprint 219 (M-2b/M-2c 완결 + Should Have 1차, Week 2):**
- [x] ~~F355b~~ ✅ **superseded by Sprint 228 F397/F398** (세션 231 정합성 보정, 2026-04-22): 중복 엔트리 보정 — 상단 Sprint 218 블록 참조. Service Binding `SVC_FOUNDRY_X`로 M-2 KPI Production E2E 7/7 달성
- [x] ~~F362~~ ✅ **superseded by Sprint 228 F397** (세션 231 정합성 보정, 2026-04-22): 중복 엔트리 보정 — 상단 Sprint 218 블록 참조. `scripts/package-spec-containers.ts` CLI로 7 lpon-* packaging 완료(AI-Ready mean 0.916)
- [ ] F359 (AIF-REQ-035 Phase 3 S-4, P2, 체력 여유 시): **TD-22 comparator 8 keys silent PASS 교체** — `scripts/roundtrip-verify/comparator.ts:168-177` 하드코딩 → 실 D1 조회로 교체. round-trip 신뢰도 보강. 예상 2h
- [x] F356-A ✅ (AIF-REQ-035 Phase 3 S-1 Phase 1, P1, Sprint 230, 세션 231 2026-04-22): **AI-Ready 6기준 자동 채점기 Phase 1 (스크립트 + 샘플링)** — PR #31 `b35d514` MERGED. 인프라 구현 완료(수기 검증 실행은 별도): `packages/types/src/ai-ready.ts` Zod 스키마 (AIReadyCriterion/Score/Evaluation/BatchReport) + `services/svc-skill/src/ai-ready/prompts.ts` 6기준 독립 프롬프트(한국어 Rubric) + `scripts/ai-ready/evaluate.ts` PoC CLI (80 skill × 6기준, concurrency=5, 일 $30 비용 가드 3단계) + `scripts/ai-ready/sample-loader.ts` 샘플링(Tier-A 40 + 무작위 40, seed 재현성). 27 테스트 전체 PASS, typecheck clean. autopilot Match **97%** + CI 3/3 SUCCESS (Migration + E2E 45/45 + Typecheck). autopilot session-end pr-lookup 실패 → Master 수동 `gh pr create` 복구(S217/S225/S224 + **S230 4회차 재현** — rules/ 승격 조건 초과). Plan: `docs/01-plan/features/F356-A.plan.md` (AIF-PLAN-038), Design: `docs/02-design/features/F356-A.design.md` (AIF-DSGN-038). **수기 검증은 후속 작업** — 80건 실 실행 + 10% 샘플(8건) 재채점 후 정확도 ≥ 80% 판정 시 Phase 2 (F356-B Sprint 231) 승격 GO

**Sprint 220 (Infra 위생 집중 — CI D1 migration workflow, Week 3):**
- [x] F366 (TD-35 해소, **P1**, Sprint 220 단독 주력, ✅ 코드 merge PR #23 `8b4a31a`, ⚠️ Production 배포 실패 — TD-39): **CI D1 migration workflow 자동화** — (1) `.github/workflows/deploy-services.yml`에 `migrate-d1` job 추가 (environment protection), (2) `.github/workflows/ci.yml`에 `migration-drift` job 추가, (3) `scripts/db-init-staging.sh` + `scripts/check-migration-drift.sh` 신설, (4) 5 서비스 wrangler.toml에 `migrations_dir` 추가, (5) svc-skill local migration → `infra/migrations/db-skill/0010` 통합. autopilot Match 100%, typecheck+lint+test pass, 13 files/406 insertions. **⚠️ Production 배포 실패** (`gh run 24719084237`): `wrangler d1 migrations apply --env production` 시 (a) `--remote` flag 누락 → local DB 대상 실행, (b) `migrations_dir`가 `[env.production]` 섹션 override 필요 (default env에만 있어서 resolve 실패). F366 scope **구조적으로는 달성** but 실 production 배포가 회귀 발생 — **TD-39 신규 등록**으로 세션 223 이후 수정 착수.

**Sprint 221+ (Should Have 3차, Week 4+, 체력 여유 시):**
- [ ] F356-B (AIF-REQ-035 Phase 3 S-1 Phase 2, P1, Sprint 220 → 221+ 이관): **AI-Ready 자동 채점기 전수 배치** — LPON 859 skill + Fill 9건 = 5,214 점수 배치. `/ai-ready/evaluate` API 엔드포인트 + 구조 점수 출력 JSON. 30분 이내 완료 목표
- [ ] F357 (AIF-REQ-035 Phase 3 S-2, P1, Sprint 220 → 221+ 이관): **Sprint 202 AgentResume 실구현** — `services/svc-mcp-server/src/routes/agent.ts:164-181` stub → 실구현. Foundry-X Orchestrator 세션 복구 프로토콜 정의. AIF-REQ-026 Phase 2 잔여 종결. P95 2s + 성공률 95% SLA
- [ ] F358 (AIF-REQ-035 Phase 3 S-3, P1): **TD-28 Tree-sitter 기반 Java 파서** — regex CLI → Tree-sitter. Workers 호환성 PoC(1주) 선행 → WASM/native 바인딩 결정 → CLI 이관 + 테스트. PRD↔Code silent drift 해소. 예상 2~3 Sprint
- [ ] F361 (AIF-REQ-035 Phase 3 S-6, P3): **TD-26 Java 파서 공용 모듈 추출** — `svc-ingestion/parsing/java-*.ts` + `scripts/java-ast/runner.ts` → `packages/utils/src/java-parsing/` 공용화. F358(Tree-sitter)과 자연 통합
- [ ] F364 (AIF-REQ-036 provenance v2, **P2**, Phase 4+ 이관 후보): **Provenance v2 — sourceLineRange 스키마 확장 + 상류 파이프라인 라인 추적** — 세션 221 AIF-REQ-036 Provenance 실측에서 **sourceLineRange 필드 스키마 부재(채움률 0% 확정)** 판명. `PolicySchema.source.lineRange: {start, end}` 추가 + `svc-ingestion` 청크 분할 시 라인 오프셋 보존 + `svc-extraction`/`svc-policy` LLM 프롬프트에 라인 정보 주입 + `svc-skill/converter.ts` 라인 정보 유지 + D1 마이그레이션(skills 또는 `skill_source_lines` 신규 테이블). 기존 3,924 skill 재생성 또는 점진 마이그레이션 전략 필요. AIF-REQ-036 MVP에서 "원본 소스 줄 하이라이트" 요구 제거로 분리. 보고서: `docs/03-analysis/features/provenance-coverage-2026-04-21.md`. 예상 2~3 Sprint
- [ ] F365 (AIF-REQ-036 선제 조사, P3, 선택): **Production pageRef 채움률 실측** — F364 착수 전 pension/giftvoucher 10건 샘플 `Policy.source.pageRef` 채움률 측정. 30% 미만이면 F364에 pageRef 보완 포함, 30% 이상이면 pageRef "있으면 사용 없으면 section 대체" 패턴. 예상 1h

**Out-of-scope (Phase 4 이후)**: 타 도메인 확장, 외부 파일럿, AIF-REQ-021 PAL Router 고도화, AIF-REQ-023 Pipeline Event Sourcing. (유지 but 자연 편입 가능)

**실패/중단 조건**: Sprint 218 말에 F354 또는 F355a 미완 → Phase 3 범위 재협상 또는 aborting. F355b/F362는 Sprint 219~220 이관(M-2b/M-2c Should). LLM 비용 일일 한도 초과 3회 이상 → S-1 샘플링 전환. Cross-repo merge 48h 지연 → F355b mock 하네스로 전환.

> **세션 218 재정의 (2026-04-21)**: F355 사전 조사 결과 6중 갭 발견으로 분할. MVP 임계값 = F354 + F355a (도구 정리 + 갭 명세 보고서). M-2 본질("Foundry-X Production E2E 실 호출 6/6")은 F355b + F362 완결로 Sprint 219~220 달성 예정. 분석: `docs/03-analysis/features/sprint-218-f355-gap-analysis.md`

> **세션 222 재편 (2026-04-21)**: Sprint 219~221 과정에서 production "자가보고 vs 실측" 갭 6건 연속 발견(TD-33~38). 그중 **TD-35(Staging 환경 방치, P1) + migration 자동 파이프라인 부재**가 production 드리프트의 근원 — M-2 KPI Production E2E 실 검증을 쌓기 전에 인프라 위생 선행 필수. Sprint 220 scope = **F366 CI D1 migration workflow 단독**으로 재편. 기존 F356-B(AI-Ready 전수 배치) + F357(AgentResume)은 Sprint 221+로 이관. 이유: Should Have 진도보다 Production 신뢰성 회복이 M-2 KPI 본질에 선행.

### 🔧 Phase 9 — v1.3 Phase 3 UX 재편 (AIF-REQ-036, 듀얼 트랙 + AXIS DS 연동) — 🔧 IN_PROGRESS

> **Plan**: `docs/01-plan/features/AIF-REQ-036.plan.md`
> **Design**: `docs/02-design/features/AIF-REQ-036.design.md`
> **PRD**: `docs/req-interview/decode-x-v1.3-phase-3-ux/prd-final.md` (v0.3, R1 79 + R2 71 평균 75/100 ✅, Ambiguity 0.175 착수 승인)
> **목표**: Audience 우선순위 재정의 (본부장 + 전문 엔지니어 동등 트랙). Spec→Source 역추적 Split View(policy/rule/skill detail 좌측 vs 재구성 마크다운 section 앵커 우측). 기존 24 페이지 사용 빈도 기반 Archive 자동 제안. AXIS DS Full 연동(tokens + react + 도메인 특화 기여).
> **착수일**: 2026-04-21 (세션 225, Sprint 223 MERGED 직후 Phase 9 공식 활성화)
> **MVP 임계값**: S1(인증/기반) + S2(Executive View) + S3(Engineer Workbench) 3 Sprint 모두 DONE. Should(S4)는 체력 여유 시.

**Sprint 223 (S1 — M-UX-1 인증 & 기반, ✅ MERGED PR #24 `c49d2ef`, 세션 225):**
- [x] F370 ✅ (AIF-REQ-036 M-UX-1, **P0**, 세션 225): **Google OAuth (Cloudflare Access + Google IdP + Allowlist)** — `apps/app-web`에 CF Access JWT 검증 + `/auth/me` stub + Allowlist 도메인 필터. `CLOUDFLARE_ACCESS_AUD` + `GOOGLE_OAUTH_ALLOWED_DOMAINS` 환경변수. 앱 코드 OAuth zero, Zero Trust 보안 모델
- [x] F371 ✅ (AIF-REQ-036 M-UX-1, **P0**, 세션 225): **D1 `users` 테이블 신설 + 0011_users.sql** — users 테이블(id/email/name/roles/last_login_at/created_at). CF Access JWT의 `iss/sub` 매핑. RLS 정책 준수
- [x] F372 ✅ (AIF-REQ-036 M-UX-1, **P0**, 세션 225): **Guest 랜딩 페이지 `/welcome`** — 3줄 요약 + Google 로그인 CTA. 비인증 사용자 Auto-redirect. Access 전 화이트페이지 방지
- [x] F373 ✅ (AIF-REQ-036 M-UX-1, **P1**, 세션 225): **AXIS DS Tier 1 `@axis-ds/tokens` CSS variable 주입** — 전역 토큰(color/spacing/typography) CSS 변수 주입. shadcn 기존 토큰과 공존. 단계적 전환 경로 확보
- [x] F374 ✅ (AIF-REQ-036 M-UX-1, **P0**, 세션 225): **Feature Flag `?legacy=1` skeleton** — URL query 기반 듀얼 화면 토글. 롤아웃/롤백 경량. 실 분기 활성화는 Sprint 224 연계(TD-41)
- [x] F385 ✅ (AIF-REQ-036 M-UX-1, **P1**, 세션 225): **§12 Rollout/온보딩 본문 작성** — PRD §12 보완, 2주 롤아웃 플랜(Day 1 Allowlist 5인 → Week 1 30인 → Week 2 전원) + FAQ + Fallback flow. R2 재발 방지
- [x] F389 ✅ (AIF-REQ-036 M-UX-1, **P0**, 세션 225): **DEMO_USERS 폐기 + 5 페르소나 UI 제거 마이그레이션** — 레거시 DEMO_USERS 카드/로직 전수 제거. 부수효과로 E2E 10 spec skip → TD-41로 S224 연계

**Sprint 224 (S2 — M-UX-2 Executive View, ✅ MERGED PR #25 `a475a77` 세션 226):**
- [x] F375 ✅ (AIF-REQ-036 M-UX-2, **P0**, 세션 226 Sprint 224 MERGED): **Executive View Overview + 4 Group 요약 위젯** — `components/executive/ExecutiveOverview.tsx` + `pages/executive/overview.tsx`. 4 Group(문서수집/정책추출/검증품질/핸드오프) 요약 카드. KPI-1 3분 파악 인프라 확보
- [x] F376 ✅ (AIF-REQ-036 M-UX-2, **P0**, 세션 226): **Foundry-X 핸드오프 실사례 타임라인 (6 서비스 round-trip) + hover/expand 상세** — `components/executive/FoundryXTimeline.tsx` + `HandoffCard.tsx`. LPON 6서비스 seed (실 lpon-charge 1건 + 예시 5건, RP-8 완화)
- [x] F377 ✅ (AIF-REQ-036 M-UX-2, **P0**, 세션 226): **Archive 실행 — soft-archive 방침 전환** — `pages/_archived/{analysis,benchmark,poc-ai-ready,poc-ai-ready-detail,poc-phase-2-report}.tsx` 5건 + `tsconfig.json` exclude + `app.tsx:124-128` redirect. **Design 역동기화 (db1febd)**: hard delete → soft archive 정책 변경을 Design doc §2.2에 즉시 기록 (PDCA gap 처리 규칙 준수). 페이지 수 24→14 목표는 Sprint 226 Engineer Workbench 통합 후 최종 판정
- [x] F378 ✅ (AIF-REQ-036 M-UX-2, **P1**, 세션 226): **Evidence 서브메뉴 재배치** — `pages/executive/evidence.tsx` 3탭(analysis-report/org-spec/poc-report) lazy import + URL `?tab=` 동기화
- [x] F386 ✅ (AIF-REQ-036 R2 전이 S220, **P1**, 세션 226): **Spec↔Source 규제 준수/감사 스토리 강화** — `components/executive/ComplianceBadge.tsx` + FoundryXTimeline 임베드 (PII 마스킹/감사 로그 compact + full 모드). R2 DeepSeek "규제 준수 스토리 명시" 조건 해소
- [x] F390 ✅ (AIF-REQ-036 R2 전이 S219, **P0**, 세션 226): **Cloudflare Web Analytics 활성화** — `apps/app-web/vite.config.ts:81-94` cf-beacon-token 플러그인 + `index.html` `__CF_BEACON_TOKEN__` placeholder. Archive 실측 데이터 수집 시작 (Sprint 226 실 측정 대상)
- [ ] TD-41 (Sprint 223→226 F392 이관 확정, **P1**): **CF Access JWT mock E2E 복원** — 세션 226 Sprint 224에서 F374 **실 분기 활성화 ✅ 완료** (`?legacy=1` → Dashboard / 기본 → Executive Overview). E2E mock 복원은 Sprint 226 F392 QA/E2E 자동화 단계와 통합 권장 — Playwright `page.route()` + msw로 `CF_Authorization` cookie 주입 + `/auth/me` stub. 10 spec test.describe.skip 해제 대기. **Gap-1 Minor 연계**: soft-archive 파일 root 중복 5건(redirect로 런타임 정상, IDE 노이즈) Sprint 226 착수 전 정리 권고

**Sprint 225 (AIF-PLAN-037 G-1 Phase 2 — converter.ts 패치, ✅ MERGED 세션 228, PR #26 `710eaca`):**
> **결과 (세션 228, 2026-04-21)**: autopilot 자체 완결 Match **91.6%** + **7/7 PASS @ 0.8 threshold** (mean 0.916, max 0.955 lpon-budget, min 0.888 lpon-refund). 예측값(Phase 1 baseline 0.683 + 산술 상한 +0.233 = 0.916)과 **실측 정확히 일치**. Root Cause 진단 완벽 검증. 번호 재배치(세션 227): AIF-REQ-036 S3 M-UX-3 Sprint 225 → Sprint 226 이관, Should M-UX-4 → Sprint 227 이관.
- [x] F393 (AIF-PLAN-037 G-1 Phase 2 P1~P3, **P0**, Sprint 225, `b3d4003`): **converter.ts Traceable 패치** ✅ — (P1) `policy.source.documentId`를 `provenance.sources[].path` 매핑, (P2) `sourceDocumentIds`를 복수 sources enumeration, (P3) `pipeline.stages`를 4단계(ingestion/extraction/policy-inference/spec-container-import)로 확장. **TR 0.30 → 1.00** (예상 +0.12 → 실측 +0.12)
- [x] F394 (AIF-PLAN-037 G-1 Phase 2 P4~P5, **P0**, Sprint 225, `a9f078e`): **converter.ts Semantic Consistency 패치** ✅ — (P4) `ontologyRef.termUris`를 policy.tags 유니크 → SKOS URI 생성(`https://ai-foundry.ktds.com/terms/{domain}#{tag}`), (P5) `ontologyRef.skosConceptScheme` 설정(`https://ai-foundry.ktds.com/schemes/{domain}`). **SC 0.30 → 1.00** (예상 +0.11 → 실측 +0.11)
- [x] F395 (AIF-PLAN-037 G-1 Phase 2 검증, **P0**, Sprint 225, `2c6dee5`): **converter.test.ts 업데이트 + baseline-2 산출** ✅ — 기존 테스트 84 lines 신규 assertion 추가 + `reports/ai-ready-baseline-2-2026-04-21.json` 127 lines 산출. **7/7 PASS mean 0.916**. G-1 Phase 3 즉시 착수 가능

**Sprint 226 (S3 — M-UX-3 Engineer Workbench, ✅ MERGED PR #27 `4d35270`, 세션 229):**
- [x] F396 ✅ (AIF-REQ-036 위생 선행, **P1**, Sprint 226, 세션 229): **Gap-1 root 중복 5건 정리 + Sidebar 라우트 정합성** — root 5건 삭제 `_archived/` 일원화, Sidebar 14 링크 매칭률 100%
- [x] F379 ✅ (AIF-REQ-036 M-UX-3, **P0**, Sprint 226, 세션 229): **Engineer Workbench Split View** — `/engineer/workbench/:id` 좌 Spec / 우 재구성 마크다운 section 앵커 스크롤
- [x] F380 ✅ (AIF-REQ-036 M-UX-3, **P0**, Sprint 226, 세션 229): **Provenance Inspector** — 우측 drawer + 그래프 탐색, F391 API 소비
- [x] F381 ✅ (AIF-REQ-036 M-UX-3, **P1**, Sprint 226, 세션 229): **AXIS DS Tier 2 `@axis-ds/react` 8종 wrapper** — Button/Card/Tabs/Dialog/Input/Select/Tooltip/Badge 교체
- [x] F382 ✅ (AIF-REQ-036 M-UX-3, **P0**, Sprint 226, 세션 229): **Admin 기본** — Users CRUD + Organization + Health + Usage Dashboard
- [x] F387 ✅ (AIF-REQ-036 R2 전이 S220~221, **P1**, Sprint 226, 세션 229): **Role별 Audit Log + Admin 페이지 노출** — 역할 매트릭스 + 필터/검색 UI
- [x] F388 ✅ (AIF-REQ-036 R2 전이 S221, **P1**, Sprint 226, 세션 229): **Section-only Fallback 실사용자 파일럿** — `docs/03-analysis/features/section-only-pilot-f388.md` 신설
- [x] F391 ✅ (AIF-REQ-036 M-UX-3, **P0**, Sprint 226, 세션 229): **`GET /skills/:id/provenance/resolve` API (svc-skill)** — `services/svc-skill/src/routes/provenance.ts` + 4 unit tests PASS
- [x] F392 ⚠️ (AIF-REQ-036 M-UX-3, **P0 skeleton DONE / TD-41 완전 해소는 F401 이관**, Sprint 226, 세션 229): **QA/E2E skeleton + TD-41 partial** — Playwright 구성 + smoke 세팅 DONE. `test.describe.skip` 15개 해제 후 CF Access mock CI 미작동 → 37/45 fail → `b87ecd7` revert로 skip 복원 → CI 3/3 PASS → merge. KPI-3 95% 미달성분은 **Sprint 227 F401 (TD-41 완전 해소)** 이관

**Sprint 227 (TD-41 완전 해소 전용, ✅ MERGED PR #28 `34d49c6`, 세션 229 2026-04-22):**
- [x] F401 ✅ (AIF-REQ-036 TD-41 완전 해소, **P1**, Sprint 227, 세션 229): **`VITE_DEMO_MODE` + `?demo=1` bypass + legacy route 정비 3단 fix → CI E2E 45/45 PASS** — autopilot 초기 구현(`85c5f34`)은 client-side `VITE_DEMO_MODE` + AuthContext `?demo=1` 감지로 설계. 3개 문제 발견·해결: (1) **React-Router Navigate query drop** (`/?demo=1` → `<Navigate to="/executive/overview" replace />`가 `?demo=1` 제거) → Master `bab6149` AuthContext 모듈 로드 시점 `?demo=1` 캡처 + localStorage 선행 저장으로 fix, (2) **Sprint 224 F374 분기 활성화 이후 legacy Dashboard 전제 E2E 7건 content outdated** (extract/functional/organization/rbac spec 11 goto) → Master `88234ab` `page.goto("/?legacy=1")` 일괄 치환, (3) **병행 pane Sprint 228 MERGED로 main CONFLICTING** → Master `cf53074` merge origin/main (webhook 재trigger). CI 1차 37/45 fail → 2차 7 fail → 3차 webhook 미trigger → **4차 45/45 PASS**. **TD-41 ~~해소~~ + S219/S220/S226 "autopilot local TEST=pass ≠ CI production pass" 4연속 패턴 종결**. KPI-3 95% 통과율 달성 증거 확보. Production 가드(`wrangler.toml` env.vars에 `VITE_DEMO_MODE` 미정의) 유지. F383/F384는 Sprint 229+ 이관
- F383 → Sprint 229 ✅ MERGED (PR #30)
- F384 → Sprint 231로 이관 (Sprint 230 F356-A 점유, 본 pane 세션 232 착수)

**Sprint 229 (AIF-REQ-036 Should M-UX-4 — AXIS DS Tier 3 기여, ✅ MERGED PR #30 `3ad1b73` + 외부 PR #55 OPEN 세션 229, ← Sprint 227 이관):**
- [x] F383 ✅ (AIF-REQ-036 Should M-UX-4, **P2**, Sprint 229, 세션 229): **AXIS DS Tier 3 도메인 특화 컴포넌트 3종 외부 레포 기여 PR** — `IDEA-on-Action/AXIS-Design-System` federation registry에 `decode-x-kit-resources.json` 추가. 3 컴포넌트(`SpecSourceSplitView`/`ProvenanceInspector`/`StageReplayer`) `agentic` category 등록. `apps/app-web/src/components/engineer/decode-x-kit-types.ts` generic props 인터페이스 신규 + `SpecSourceSplitView.tsx`/`ProvenanceInspector.tsx` 추출. AXIS DS fork(`AXBD-Team/AXIS-Design-System`) `feat/decode-x-kit-resources` 브랜치 → **외부 PR #55 OPEN**: https://github.com/IDEA-on-Action/AXIS-Design-System/pull/55. 실 merge는 외부 org maintainer 승인 대기. **Decode-X PR #30 MERGED** (`3ad1b73`): autopilot 8분 자체 완결 Match **95%** + CI 3/3 SUCCESS (Migration + Typecheck + E2E 45/45 F401 fix 효과 지속). AXIS DS 첫 Decode-X 기여 선례 확보 (향후 Foundry-X/Launch-X/Eval-X 확장 시 동일 경로). **DoD 달성**: 외부 PR URL 확보 ✅ + Decode-X re-import 회귀 없음 (E2E green)

**Sprint 230 (AIF-PLAN-037 G-3 Phase 1 — AI-Ready 채점기 PoC 80건, ✅ MERGED PR #31 `b35d514` 세션 231 2026-04-22, ⚠️ 실행 blocked → Sprint 232 F402 재작):**
> **결과**: PoC 인프라 완전 구축(Zod 스키마 + 6기준 프롬프트 + CLI + 샘플러 + 비용 가드). 27 테스트 PASS, autopilot Match 97%, CI 3/3 SUCCESS. **실 실행 blocked** — 세션 231 실측에서 TD-42 데이터 소스 gap 발견(autopilot이 Java 소스 + `/skills` 필드를 가정했으나 production은 R2 메타 + markdown rules/yaml만 반환). Phase 2 판정은 Sprint 231 F402 전면 재작 후 실측.

**Sprint 232 (AIF-PLAN-037 G-3 Phase 1 재작 + Phase 9 E2E 보강, 🟡 PARTIAL 세션 232 2026-04-22 — F402 ✅ 코드 재설계만 / DoD 실행분 TD-43 분리, F403 📋 PLANNED, Sprint 231 F384 점유로 번호 shift):**
> **목표**: (1) TD-42 해소 — F356-A PoC 스크립트를 production 데이터 현실에 정합시켜 실 실행 가능하게 만듦. 기존 인프라(AIReadyScoreSchema + 6기준 프롬프트 뼈대 + CLI + 비용 가드)는 재활용. (2) AIF-ANLS-032에서 도출된 Phase 9 E2E 커버리지 gap(신규 6 라우트 0% 커버) 해소 — Match Rate 82% → 95%+ 복원.
- [x] F402 ✅ **부분 완결** (AIF-REQ-035 Phase 3 S-1 Phase 1 재작, **P1**, Sprint 232, 세션 232 2026-04-22): **F356-A sample-loader + 프롬프트 재설계 (코드 레벨)** — PR #33 `425c3e83` MERGED. **완결분**: (a) `SpecContent` interface 재정의 + Zod 스키마(`packages/types/src/ai-ready.ts` AIReadyScore/Evaluation/BatchReport), (b) `services/svc-skill/src/ai-ready/prompts.ts` 6기준 rubric 프롬프트(spec-container markdown 기반), (c) `scripts/ai-ready/evaluate.ts` CLI + fs 로더 + 비용 가드 3단계($25 warn / $30 abort), (d) `scripts/ai-ready/sample-loader.ts` fs-based 7 lpon-* 로더. 25 테스트 PASS + typecheck/lint clean + CI 3/3 SUCCESS (E2E 1m52s + Migration 6s + Typecheck 1m9s). **Match Rate 98%** (Effective, WAIVED 7건 정당화: skillId UUID→string / `--sample`/`--tier-a-ratio` 제거 / `--opus-cross-check 10` WAIVED 등). Plan: `docs/01-plan/features/F356-A.plan.md` (AIF-PLAN-038 재활용). Design: `docs/02-design/features/F356-A.design.md` (AIF-DSGN-038 재활용). Analysis: `docs/03-analysis/sprint-232.analysis.md` (AIF-ANLS-039 신규). Report: `docs/04-report/features/sprint-232-F402.report.md` (AIF-RPRT-039 신규). **미완결분 (TD-43으로 이관)**: (e) evaluate.ts **실 실행 미수행** (42 LLM 호출 증거 없음), (f) `reports/ai-ready-poc-2026-04-22.json` **DoD 파일 미생성**, (g) 수기 검증 10%(1건) **미수행**, (h) accuracy MD **미생성** → Phase 2 (F356-B) GO/NO-GO 판정 **유보**. 리포트 §4.3 "실제 $0.22"는 예상치 hallucination (Master 실측 reports/ 산출물 부재 확인). **`feedback_autopilot_production_smoke` 패턴 6회차 재현** (S215/S219/S220/S228/S230 + **S232**). 후속: **TD-43 참조**
- [ ] F403 (AIF-ANLS-032 remediation / AIF-REQ-036 Phase 9 E2E 잔여, **P1**, Sprint 232, 📋 PLANNED 세션 229): **Phase 9 신규 라우트 E2E 커버리지 보강** — AIF-ANLS-032 도출 P0 4건 구현. (a) `apps/app-web/e2e/executive-evidence.spec.ts` 신규 — `/executive/evidence` cards/links 렌더 (F378), (b) `apps/app-web/e2e/engineer-workbench.spec.ts` 신규 — `/engineer/workbench` SplitView + ProvenanceInspector 기본 흐름 + `/engineer/workbench/:id` detail (F379/F380), (c) `apps/app-web/e2e/admin.spec.ts` 확장 — `/admin` 렌더 + AuditLog 탭 전환 (F382/F387), (d) `apps/app-web/e2e/guest-mode.spec.ts` 신규 — `/?demo=guest` → read-only + `/upload` 접근 시 GuestBlockedView + "🎭 Demo Mode" 배지 + 로그인 CTA (F384). 예상 3h (실행 준비 0.5h + 스모크 4건 2h + CI 검증 0.5h). **DoD**: CI E2E 47 → 51+ PASS (4 테스트 추가 이상), AIF-ANLS-032 Match Rate 82% → 95%+ 복원, 모든 신규 spec test.describe.skip 없음. **실행 순서**: F402 완료 후 F403 순차 진행 권장 (병행 시 스코프 교착 + WT 간 충돌 위험)
> **재작 근거 (F402)**: TD-42 참조. autopilot Match 97%는 설계↔코드 기준이었고 production 호환 미검증 — `feedback_autopilot_production_smoke` 패턴 5회차 (S215/S219/S220/S228/S230)
> **신규 근거 (F403)**: AIF-ANLS-032 §6 Gap #1 참조. Phase 9 13 F-item 기능은 DONE이나 UI 신규 6 라우트 E2E 0% 커버 — "기능 DONE ≠ 검증 DONE" 패턴 실증. 교훈: Phase 10+ UX F-item 정의에 "E2E 1건 이상 Must 인수 기준 포함" 원칙 명문화 후보(SPEC §4 또는 CLAUDE.md)

**Sprint 233 (AIF-REQ-036 Phase 9 후속 — F390 실 주입 완결, 📋 PLANNED 세션 233 착수 예정 2026-04-22):**
> **배경**: 프로덕션 `https://rx.minu.best/welcome` 콘솔에 CF Web Analytics 404/CORS 노이즈 상시 발생. 진단: F390(Sprint 224 MERGED)이 `vite.config.ts`에 `CF_BEACON_TOKEN` env 기반 transform을 구현했으나 `.github/workflows/deploy-pages.yml` Build step에 env 주입이 누락됨. 결과 — fallback `"PLACEHOLDER_DEV"`가 프로덕션 HTML에 구워져 CF가 invalid token 요청을 404 + no-CORS로 거절. 페이지 기능 영향 없음, RUM 수집만 실패 상태. F390 DoD "실측 데이터 수집 시작"은 실질 미달성 → Sprint 233에서 완결.
> **목표**: (1) CI 파이프라인에 `CF_BEACON_TOKEN` secret 주입 경로 확립, (2) 빌드 타임에 토큰이 placeholder/빈 값이면 beacon `<script>` 블록 자체를 제거하는 defensive fallback, (3) `/welcome` E2E 스모크로 console error 0건 검증(원칙 #6 UX F-item = 기능 + E2E 1건 Must 준수).
- [ ] F404 (AIF-REQ-036 Phase 9 후속 — CF Web Analytics 실 활성화, **P2**, Sprint 233, 📋 PLANNED 세션 233): **CF Web Analytics 토큰 CI 주입 + beacon defensive rendering + welcome E2E 스모크** — 3 Step: (1) `.github/workflows/deploy-pages.yml` Build step에 `env: CF_BEACON_TOKEN: ${{ secrets.CF_BEACON_TOKEN }}` 추가(line 88-89 확장), (2) `apps/app-web/vite.config.ts:82-93` defensive fallback — token이 `"PLACEHOLDER_DEV"` 또는 빈 값이면 `transformIndexHtml`에서 `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" ...></script>` 블록 통째 제거(regex 또는 marker 기반), (3) `apps/app-web/e2e/welcome.spec.ts` 신규 — `/?demo=guest`로 `/welcome` 접근(CF Access bypass) → `page.on('console', ...)` error 레벨 수집 → asserts 0건 + "Decode-X" 제목 + Google 로그인 버튼 visible. GitHub repo secret `CF_BEACON_TOKEN` = `102744c5...d718`(세션 233 사용자 등록 완료). **DoD**: (a) 프로덕션 `curl https://rx.minu.best/welcome | grep data-cf-beacon` 실 토큰 확인, (b) 브라우저 시크릿 창 콘솔 CF insights 404/CORS 에러 0건, (c) welcome.spec.ts CI PASS (E2E 47→48+), (d) CF Web Analytics 대시보드에 hit 1건 이상 기록. **DoD 검증은 session-end 시 Master가 실측(리포트 hallucination 방지, `feedback_autopilot_production_smoke` 원칙 준수)**
> **검증 기준**: DoD 4항 전원 PASS. 원칙 #6 E2E 1건 Must 충족.
> **실패/중단**: CF Pages 환경 변수 주입 경로 불일치로 token 미치환 → vite.config.ts `transformIndexHtml` 실행 시점 디버그 로그 추가 후 재배포. welcome.spec.ts CI flake → waitForTimeout 회피 + `expect.poll()` 전환 (anti-pattern 방지).
> **목표**: LPON 80 skill × 6기준 = 480 점수 PoC. LLM vs 수기 재채점 정확도 ≥ 80% 달성 시 Phase 2 (F356-B, 전수 5,214) 승격 판정. Sprint 229(F383)와 병렬 독립 진행.
> **Plan**: `docs/01-plan/features/F356-A.plan.md`
> **Design**: `docs/02-design/features/F356-A.design.md`
- [ ] F356-A (AIF-REQ-035 Phase 3 S-1 Phase 1, **P1**, Sprint 230 주력, 🔧 IN_PROGRESS 세션 231 착수, 8h 예상): **AI-Ready 6기준 자동 채점기 Phase 1 (스크립트 + 샘플링)** — 4 Step: (1) 스키마 설계 2h — `packages/types/src/ai-ready.ts` `AIReadyScoreSchema` (6 criteria × {score:0~1, rationale, passThreshold:0.75} + 총점 산식), (2) LLM 프롬프트 2h — `services/svc-skill/src/ai-ready/prompts.ts` 6기준 독립 평가 프롬프트(입력=Java 소스 + YAML/JSON metadata, 출력=JSON 구조 강제), (3) PoC 스크립트 2h — `scripts/ai-ready/evaluate.ts` 80 샘플 배치(Tier-A 집중 40 + 무작위 40), svc-llm-router HTTP REST, 일 $30 비용 가드(사전 usage 체크 + 초과 시 AskUserQuestion), (4) 수기 검증 2h — 10%(8건) 수기 재채점 vs LLM 점수 ±0.1 이내. **DoD**: `reports/ai-ready-poc-{date}.json` 480 점수 + `reports/ai-ready-poc-accuracy-{date}.md` 정확도 리포트. 정확도 ≥ 80% 시 Phase 2 승격 GO 판정
> **검증 기준**: PoC 80건 평가 + 수기 검증 정확도 ≥ 80% + 일 $30 비용 가드 정상 작동
> **실패/중단**: LLM 비용 $30/일 가드 3회 초과 → 10% 샘플링(85건) 전환 + 정확도 신뢰구간 제시. 수기 검증 정확도 < 80% → 프롬프트 개선 iterate 후 재실행 (Phase 2 진입 전 반드시 통과)

**Sprint 231 (AIF-REQ-036 Should M-UX-4 — F384 Guest/Demo 모드, ✅ MERGED PR #32 `331127c` 세션 229 2026-04-22, ← Sprint 227 이관, Sprint 230 F356-A 점유 우회):**
- [x] F384 ✅ (AIF-REQ-036 Should M-UX-4, **P2**, Sprint 231, 세션 229): **Guest/Demo 읽기 전용 데이터 모드** — Sprint 227 F401 `VITE_DEMO_MODE` + `?demo=1` + AuthContext 모듈 로드 시점 capture 인프라 재활용. `apps/app-web/src/lib/guest-access.ts` 신규 (guest role 권한 판정 + route guard 유틸). `/?demo=guest` 진입 → Executive Overview/Evidence/Skill Catalog 조회, write 액션 차단, "🎭 Demo Mode" 배지 + 로그인 CTA. autopilot 10분 자체 완결 Match **100%** + CI 3/3 SUCCESS (Migration 6s + Typecheck/E2E ~2분). **pr-lookup 5회차 재현 (false negative)** — PR 실 생성 성공했으나 signal만 FAILED 오판. Master `gh pr create` 시도 → "already exists" 확인(#32). Master 수동 squash merge. Production 가드(`wrangler.toml` env.vars `VITE_DEMO_MODE` 미정의) 유지. **DoD 달성**: 외부 데모/영업용 모드 확보 ✅. **AIF-REQ-036 Phase 9 UX 재편 100% 종결** (S1 F370~F389 / S2 F375~F390 / S3 F379~F392 / TD-41 F401 / Should F383+F384)

**Sprint 228 (AIF-PLAN-037 G-1 Phase 3 — Packaging + Submit + 증빙, ✅ MERGED 세션 230, PR #29 `7b396872`):**
> **결과**: 7 lpon-* spec-container packaging → Production `/handoff/submit` × 7 (HTTP 201 전원 PASS) → Foundry-X D1 `prototype_jobs` 7 rows confirmed → AIF-ANLS-031 증빙 리포트 완성. **M-2 Production E2E 1/7 → 7/7 ✅**. CF error 1042 근본 원인 해소(SVC_FOUNDRY_X Service Binding). AI-Ready mean 0.916, min 0.888 전원 ≥ 0.8. AIF-PLAN-037 G-1 Phase 3 ✅ 완료.
- [x] F397 (AIF-PLAN-037 G-1 Phase 3 Packaging, **P0**, Sprint 228, ✅): **7 lpon-* containers packaging 실행** — 7/7 성공. AI-Ready mean 0.916. skillIds: budget(5d59e8d7)/charge(4591b69e)/gift(17bc6d1d)/payment(7dd016bb)/purchase(b923a11b)/refund(fc4204c8)/settlement(5c872ee3). `reports/packaging-2026-04-21.json`. Service Binding fix(CF error 1042): `SVC_FOUNDRY_X` 바인딩 wrangler.toml 3곳 추가
- [x] F398 (AIF-PLAN-037 G-1 Phase 3 Submit, **P0**, Sprint 228, ✅): **`POST /handoff/submit` × 7 Production 실 호출** — 7/7 HTTP 201 (Gate PASS, AI-Ready mean 0.916 > 0.8). handoff_jobs 7 rows (status=submitted). `reports/handoff-jobs-d1-2026-04-21.json`
- [x] F399 (AIF-PLAN-037 G-1 Phase 3 D1 Verify, **P0**, Sprint 228, ✅): **Foundry-X production D1 `prototype_jobs` 7 rows 확인** — 7/7 cross-check PASS. svc-skill handoff_jobs × Foundry-X prototype_jobs 전건 일치. `reports/handoff-jobs-d1-2026-04-21.json`
- [x] F400 (AIF-PLAN-037 G-1 Phase 3 증빙, **P0**, Sprint 228, ✅): **AIF-ANLS-031 증빙 리포트 작성** — `docs/03-analysis/AIF-ANLS-031_m2-tier-a-production-evidence.md` 완성. SPEC.md §5 "1/7 → 7/7" 갱신. ~~TD-25 Production E2E 미완~~ 완전 해소

**완료 기준 (DoD, S221 완료 시)**:
- KPI-1 본부장 3분 테스트 PASS
- KPI-2 Split View 클릭 ≤ 3 (10건 샘플)
- KPI-3 QA/E2E 95% 통과
- Legacy Feature Flag 삭제 가능 상태 (스모크 PASS)
- Production 배포 완료 (Cloudflare Pages + Access)
- Ambiguity 0.175 → ≤ 0.15 실행 중 해소
- AXIS DS 핵심 컴포넌트 교체율 ≥ 80%
- 페이지 수 40% 감축 (24 → 14 이하)
- SPEC.md §7 AIF-REQ-036 **IN_PROGRESS → DONE** 전환

**Out-of-scope (Phase 4+ 이후)**: F364 Provenance v2(sourceLineRange 스키마 확장, 2~3 Sprint) + F365 pageRef 실측 조사. 타 도메인 확장, 외부 파일럿.

**실패/중단 조건**: Sprint 224 말 Executive View 3분 인사이트 도달 실패 → S3 범위 재협상. AXIS DS npm 미성숙 감지 → Tier 3 S226 유예 + Tier 1~2 shadcn 유지. Split View 복잡도 spike > 1일 → scope 축소. Archive 실측 2~4주 수집 미흡 → Archive 결정 보류 + F377 Sprint 225+ 이관.

> **세션 226 Sprint 224 ✅ MERGED (2026-04-21, PR #25 `a475a77`)**: Sprint 223 S1 MERGED 직후 Master에서 SPEC §6 Phase 9 신설 + F370~F392 15건 공식 등록 (`1ed08c5`). Sprint 224 WT autopilot 자체 19분 17초 완결 + PR 수동 복구(autopilot pr-lookup 3회차 실패 패턴) + Master gap-detector 독립 검증 **96% ±1 일치** (autopilot 97%) + CI all green(E2E ✅ + Typecheck ✅ + Migration Sequence ✅) + squash merge `a475a77`. **6 F-item DONE**: F375 Executive Overview + F376 Foundry-X 타임라인 + F377 Archive soft-archive 전환 + F378 Evidence 허브 + F386 Compliance 뱃지 + F390 CF Web Analytics. **F374 실 분기 활성화 (S1 연계 DONE)**. **F377 Design 역동기화 성공 사례** (hard delete → soft archive, `db1febd`). **교훈**: autopilot pr-lookup 실패는 정상 fallback 패턴 (feedback memory 승격 후보), Match Rate 메타 검증 정착. 병행 pane 세션 227 AIF-PLAN-037 G-1 Phase 1 완결(`4a8352c`+`33918b0`)로 Sprint 225 번호가 converter.ts 패치로 재배치됨 → AIF-REQ-036 S3 M-UX-3 Sprint 226 이관, Should M-UX-4 Sprint 227 이관. 완료 보고서: `docs/04-report/features/sprint-224-AIF-REQ-036-S2.report.md` (commit `e073864`).

---

## 7) Requirements Backlog

> GOV-003 요구사항 관리 표준 적용. ID: `AIF-REQ-{NNN}`, 우선순위: P0~P3.
> 상태: OPEN → TRIAGED → PLANNED → IN_PROGRESS → DONE / REJECTED

### 분류 체계

**유형**: Feature / Bug / Improvement / Chore
**도메인**: Pipeline / UX / Infra / Governance / Data / Integration

### 미완료 항목 (Phase 2-D, Phase 3에서 이관)

| ID | 유형 | 도메인 | 우선순위 | 상태 | 제목 |
|----|------|--------|:--------:|:----:|------|
| ~~AIF-REQ-001~~ | ~~Improvement~~ | ~~Pipeline~~ | ~~P2~~ | REJECTED | ~~SCDSA002 비표준 XLSX 파싱 조사~~ — 거부: DRM 암호화 파일 파싱 제외 |
| AIF-REQ-002 | Improvement | Pipeline | P3 | IN_PROGRESS | Anthropic vs OpenAI extraction 품질 비교 (크레딧 충전 후) |
| AIF-REQ-003 | Feature | Data | P2 | TRIAGED | 추가 문서 업로드 (764건 XLSX 중 선별) |
| AIF-REQ-004 | Bug | Pipeline | P2 | DONE | PDF/PPTX 대용량 문서 524 timeout 해결 — pdf-lib 페이지 분할 + fflate 슬라이드 분할 + auto→fast 전략 fallback + PARSE_TIMEOUT 60s + PPTX >10MB size guard. Production 실문서 **8/8 전량 성공** (15.9MB PPTX→200, 7.2MB→390, 5.2MB→386, 5.0MB→382, 2.8MB PDF→200, 2.2MB→200, 2.0MB→200, 1.9MB PPTX→181) (세션 160) |
| AIF-REQ-005 | Feature | Integration | P1 | DONE | MCP adapter 실제 클라이언트(Claude Desktop) E2E 테스트 |
| AIF-REQ-006 | Feature | Integration | P2 | DONE | OpenAPI adapter 외부 시스템 연동 검증 — servers/examples/externalDocs 추가, swagger-parser+validator 검증, staging+production 배포 (세션 157) |

### 온누리상품권 도메인 파일럿 (신규 등록)

| ID | 유형 | 도메인 | 우선순위 | 상태 | 제목 |
|----|------|--------|:--------:|:----:|------|
| AIF-REQ-007 | Feature | Pipeline | P0 | DONE | 온누리상품권 Stage 1-2 triage 완료 (88건/85 parsed/85 extracted, 3건 failed: 쿼터+타임아웃) |
| AIF-REQ-008 | Feature | Pipeline | P0 | DONE | 온누리상품권 정책 추론 완료 — policies 848 전량 approved, Neo4j 3,880건 synced, HITL 전건 처리 |
| AIF-REQ-009 | Feature | Pipeline | P1 | DONE | 온누리상품권 Skill 패키징 + MCP 어댑터 완료 — KV 3환경, 515건 published, MCP E2E 7/7 PASS, R2 domain 859건 갱신 완료 |
| AIF-REQ-010 | Feature | Data | P1 | DONE | SI 산출물 재구성 + As-Is/To-Be Gap 분석 완료 — 4-perspective API, 캐싱(TTL 1h), CSV 내보내기, trace matrix |
| AIF-REQ-011 | Feature | UX | P1 | DONE | 분석 보고서 동적화 — 하드코딩→API/DB, 버전별 스냅샷, 마크다운 문서 자동 생성 (LPON+Miraeasset 동시) |
| AIF-REQ-012 | Feature | UX | P2 | DONE | 3축 벤치마크 비교 보고서 페이지 — Cross-Domain + AI vs Manual + Stage Performance, 98% match rate (세션 153) |
| AIF-REQ-013 | Feature | UX | P1 | DONE | Cross-Org Comparison 대시보드 — 조직 비교 + 4-Group 시각화, org별 보고서 분리 |

### Phase 4 실문서 파이프라인 (신규 등록)

| ID | 유형 | 도메인 | 우선순위 | 상태 | 제목 |
|----|------|--------|:--------:|:----:|------|
| AIF-REQ-014 | Feature | Pipeline | P0 | DONE | Phase 4 Sprint 1 실문서 파이프라인 — screen-design-parser + Batch 3 (7/11 파싱) + Queue fix + SCDSA002 탐지 + 배치 자동화 (세션 071~078) |
| AIF-REQ-015 | Feature | Pipeline | P0 | DONE | Phase 4 Sprint 2 벌크 승인 + 파이프라인 완결 — bulk-approve 3,046건 + Tier 2+3 87건 업로드 (26,825 terms, 3,104 skills) (세션 079~085) |
| AIF-REQ-016 | Feature | Data | P1 | DONE | LPON FactCheck 소스코드↔문서 API 커버리지 분석 — 382 source/109 doc, 115건 매칭(구조 98+LLM 17), 커버리지 30.1%, 외부API 83.7%, 문서역방향 90.4%. AST파서+미문서화 16건 명세 역공학 완료 (세션 107~156) |

### 온누리상품권 산출물 검증 (신규 등록)

| ID | 유형 | 도메인 | 우선순위 | 상태 | 제목 |
|----|------|--------|:--------:|:----:|------|
| AIF-REQ-017 | Feature | Data | P0 | DONE | 온누리상품권 분석 산출물 Export API 완료 — `/deliverables/export/*` 6종 API, 마크다운 렌더러 5종(인터페이스설계서/업무규칙/용어사전/Gap보고서/비교표), Service Binding 3개×3환경, 1,869줄 신규, 20 tests, PDCA Full Cycle Match Rate 90.6% (세션 159). **UI 확장** (세션 164): Export Center에 SI 산출물 탭 + 마크다운 미리보기 + 테이블 렌더링, +545줄, Pages 배포 완료 |

### 진행 현황 리포트 개선 (신규 등록)

| ID | 유형 | 도메인 | 우선순위 | 상태 | 제목 |
|----|------|--------|:--------:|:----:|------|
| AIF-REQ-018 | Improvement | UX | P1 | IN_PROGRESS | 진행 현황 리포트 UX 개선 — 3단계 구조(Executive Summary + accordion 상세), 중복 섹션 통합(FactCheck·종합판정), 게이지/스코어카드 시각화, 신호등+점수+비교 프레임 결론 강화, 메트릭 카드 설명 추가, 향후과제 접기/펼치기 |

### Working Mock-up 사이트 (신규 등록)

| ID | 유형 | 도메인 | 우선순위 | 상태 | 제목 |
|----|------|--------|:--------:|:----:|------|
| AIF-REQ-019 | Feature | Integration | P0 | DONE | Working Mock-up 사이트 — 추출된 결과물(Skill, 정책, 온톨로지) 기반 핵심 엔진 동작 검증. PDCA 91% (세션 166b). 세션 169: app-web 통합. **세션 174: Export 탭 + AutoEvalPanel + UX 폴리싱(Skeleton/EmptyState/Toast) + 5탭 완성. PDCA 98% → DONE** |

### 계정/인프라 이전 (신규 등록)

| ID | 유형 | 도메인 | 우선순위 | 상태 | 제목 |
|----|------|--------|:--------:|:----:|------|
| AIF-REQ-020 | Chore | Infra | P0 | DONE | 계정/인프라 이전 — GitHub(sinclairseo→ktds.axbd) + Cloudflare(sinclair.seo→ktds.axbd) 리소스 이전 완료. D1 20+R2 4+KV 6+Queue 4 프로비저닝, Workers 36/36 배포, D1 10 data import, Secrets 63개, R2 5,625파일 rclone 이전, Pages+DNS 전환. URL: *.ktds-axbd.workers.dev. **세션 176: Phase 0~5 전체 완료** |

### 파이프라인 고도화 — Ouroboros 패턴 반영 (신규 등록)

| ID | 유형 | 도메인 | 우선순위 | 상태 | 제목 |
|----|------|--------|:--------:|:----:|------|
| AIF-REQ-021 | Improvement | Pipeline | P2 | OPEN | Adaptive LLM Router 고도화 — PAL Router 패턴(복잡도 기반 자동 에스컬레이션/다운그레이드), TaskContext 기반 stateless routing, Result Type 에러 핸들링 표준화. 대상: svc-llm-router (SVC-06). 참조: [Q00/ouroboros](https://github.com/Q00/ouroboros) |
| AIF-REQ-022 | Feature | Pipeline | P1 | DONE | Pipeline Quality Evaluation System — 3-Stage auto evaluator(mechanical→semantic→consensus) 구현. svc-governance evaluators/ + pipeline-evaluations API. Queue Router skill.packaged 자동 트리거. 31 tests. **세션 174: PDCA 98% → DONE** |
| AIF-REQ-023 | Feature | Pipeline | P2 | OPEN | Pipeline Event Sourcing & Observability — 5-Stage 이벤트 리니지(append-only 로그), Drift Detection(목표/제약/온톨로지 드리프트 추적), 감사/재현/롤백 지원. 대상: 전 서비스(SVC-01~05 + Queue Router). 참조: [Q00/ouroboros](https://github.com/Q00/ouroboros) |

### Generative UI Framework — OpenGenerativeUI 패턴 반영 (신규 등록)

| ID | 유형 | 도메인 | 우선순위 | 상태 | 제목 |
|----|------|--------|:--------:|:----:|------|
| AIF-REQ-024 | Feature | UX | P1 | IN_PROGRESS | Generative UI Framework — **기구현 소급**(세션 166~199): Sandboxed Widget Renderer(`apps/app-mockup/src/lib/widget-bridge.ts` + `components/shared/WidgetRenderer.tsx`, 47 tests `803489c`), Decision Matrix(`lib/decision-matrix.ts` 7종 시각화 자동 선택), AG-UI Protocol(`packages/types/src/ag-ui.ts` 22종 event `9ea00e9`), HITL Components 3종(`components/shared/hitl/` `1a90b78`), app-web 포트(`components/generative-ui/` + `pages/agent-console.tsx` `1dc0d5d`). **잔여**: HITL backend state management (Sprint 203), Theme Injection + app-web 배포 (Sprint 204). 참조: [CopilotKit/OpenGenerativeUI](https://github.com/CopilotKit/OpenGenerativeUI) |

### Skill 번들링 — LLM 의미 분류 기반 재패키징 (신규 등록)

| ID | 유형 | 도메인 | 우선순위 | 상태 | 제목 |
|----|------|--------|:--------:|:----:|------|
| AIF-REQ-025 | Improvement | Pipeline | P1 | DONE | Skill 번들링 재설계 + CC Export — LLM 의미 분류 번들링 완료 (LPON 848→11, Miraeasset 3065→15). CC Skill ZIP Export API (GET /skills/:id/export-cc). SKILL.md + rules/policies/*.md 구조. 19 tests. **세션 174: CC Export 추가, PDCA 98% → DONE** |

### Foundry-X 통합 — 제품군 통합 및 포지셔닝 (신규 등록)

| ID | 유형 | 도메인 | 우선순위 | 상태 | 제목 |
|----|------|--------|:--------:|:----:|------|
| AIF-REQ-026 | Feature | Integration | P1 | IN_PROGRESS | Foundry-X 통합 — Phase 1-3 MCP 완료, Phase 2 Sprint 1(반제품 생성) 완료, **Sprint 201(핸드오프 포맷 검증) 완료** (`07f64db`, 315 tests PASS). **기구현 소급**: meta-tool 3종(`foundry_policy_eval/skill_query/ontology_lookup`) + SSE 스트리밍(`services/svc-mcp-server` `b959d09`, 56 tests PASS, 619 tools production). **잔여**: AgentResume state 복구 stub 실구현 (Sprint 202). 참조: [KTDS-AXBD/Foundry-X](https://github.com/KTDS-AXBD/Foundry-X) |

### 반제품 스펙 — 역공학 결과물의 개발 스펙 변환 (신규 등록)

| ID | 유형 | 도메인 | 우선순위 | 상태 | 제목 |
|----|------|--------|:--------:|:----:|------|
| AIF-REQ-027 | Feature | Pipeline | P0 | DONE | 반제품 스펙 포맷 정의 및 파일럿 생성 — AI Foundry 역공학 결과물(policies 3,675, skills 26, ontologies 848)을 AI Agent가 바로 구현 가능한 6개 스펙 문서(비즈니스 로직 명세, 데이터 모델 명세, 기능 정의서, 아키텍처 정의서, API 명세, 화면 정의)로 변환. 파일럿 1개 도메인(퇴직연금 or LPON)에서 Working Version 생성 검증. 참조: `반제품-스펙/prd-final.md`, AIF-REQ-026 |

### 반제품 스펙 PoC 보고서 — Production 게시 (신규 등록)

| ID | 유형 | 도메인 | 우선순위 | 상태 | 제목 |
|----|------|--------|:--------:|:----:|------|
| AIF-REQ-028 | Feature | UX | P0 | DONE | 반제품 스펙 PoC 전체 과정 보고서 Production 게시 — AIF-REQ-027의 인터뷰→PRD→PDCA→6개 스펙 문서→Working Version 자동 생성까지 전 과정을 보고서로 구성하여 Production 사이트에 게시. 본부장 리뷰용. 포함 내용: 인터뷰 로그, PRD(3라운드 AI 검토), 6개 스펙 문서(BL 95건, 테이블 17개, FN 10개, API 28개), Working Version(14파일 1,610줄, 24 테스트 100%), PDCA Plan/Design/Report. 924줄 poc-report.tsx + 147줄 data. rx.minu.best/poc-report 배포 완료. 세션 200: 소급 DONE 전환 |

### Custom 스킬 구조화 — Skill Framework (신규 등록)

| ID | 유형 | 도메인 | 우선순위 | 상태 | 제목 |
|----|------|--------|:--------:|:----:|------|
| AIF-REQ-029 | Feature | Governance | P1 | DONE | Custom 스킬 구조화 (Skill Framework) — Phase 1a~3 완료. 8 CLI + 훅 + 가이드라인 + 템플릿 3종 + 분류 100%(210/210) + 팀 배포(deploy.mjs) + 사용량 추적(usage-tracker.sh) + 리포트(usage.mjs) + 리팩토링(refactor.mjs) + 의존성(deps.mjs) + 폐기 정책. PRD 13/16 기능. 43 tests, PDCA 97%/90%/96%/100%. 참조: `skill-framework/prd-final.md` |

### Recon-X MSA 재조정 (신규 등록)

| ID | 유형 | 도메인 | 우선순위 | 상태 | 제목 |
|----|------|--------|:--------:|:----:|------|
| AIF-REQ-030 | Feature | Infra | P0 | DONE | Recon-X MSA 재조정 — 플랫폼 SVC 5개 분리(llm-router/security/governance/notification/analytics), LLM 라우팅 전환, 프론트엔드 정리(20→~10페이지), 리포 리네임 준비, E2E 테스트 조정, 서비스 연동 인터페이스 정의. 참조: `docs/recon-x-restructuring/prd-final.md` |
| AIF-REQ-031 | Chore | Infra | P1 | DONE | Recon-X 부가 작업 — CI/CD 파이프라인 조정, 모니터링 독립화, Turborepo 워크스페이스 정리, 문서 갱신(CLAUDE.md/SPEC.md → Recon-X 관점) |
| AIF-REQ-032 | Chore | Infra | P1 | DONE | Recon-X 리브랜딩 정리 — 로컬 디렉토리명 변경(res-ai-foundry→Recon-X), 커스텀 도메인 변경(ai-foundry.minu.best→rx.minu.best), CORS/OpenAPI/vite proxy/deploy-verifier 코드 갱신, Cloudflare Pages 도메인+DNS 전환. 세션 200: health check 전체 PASS (7 Workers + Gateway + Pages + CORS) |
| AIF-REQ-033 | Chore | Infra | P1 | DONE | **Decode-X 리브랜딩** — Recon-X(Reconnaissance) → Decode-X(Decoding) 프로젝트 정체성 재정의. **범위**: (1) GitHub 리포 KTDS-AXBD/Recon-X → KTDS-AXBD/Decode-X (완료, push redirect로 확인), (2) 로컬 git remote URL 갱신 (완료), (3) 프로젝트 정체성 파일(CLAUDE.md/SPEC.md/MEMORY.md/README.md/package.json) 갱신, (4) docs/recon-x-restructuring/ → docs/decode-x-restructuring/ 디렉토리 rename (git mv), (5) 로컬 워킹 디렉토리 /home/sinclair/work/axbd/Recon-X/ → Decode-X/ rename. **범위 제외**(infrastructure 보존): Cloudflare Worker 이름(recon-x-api 유지), 배포 URL, service binding, DO script_name. 역사적 PDCA 기록(docs/CHANGELOG.md, 기존 DONE REQ 설명)은 보존 |
| AIF-REQ-034 | Feature | Pipeline | P0 | IN_PROGRESS | **Decode-X Deep Dive** — Deep Dive v0.3 문서 기반 Spec 완결성 심화. **3 Must Have**: (1) B/T/Q 3종 Spec Schema + AI-Ready 6기준 자동 채점기, (2) Tacit Interview Agent, (3) Handoff 패키지 검증. **KPI**: 완결성 ≥80%, 6기준 통과율 ≥90%. **Out-of-scope**: KG Relationship Registry(→REQ-023), Ontology MCP, Foundry-X Orchestrator, 외부 파일럿. **PoC (2026-04-17 10:00 보고, 1명, 18h)**: LPON 859개 skill 6기준 일괄 채점 스크립트 + 리포트 + B/T/Q 샘플 20건 매핑. Tacit/Handoff는 포맷 명세만. **참조**: `docs/req-interview/decode-x-deep-dive/prd-final.md` (R2 82/100). **오픈 이슈**: 역호환(외부 Skill 사용자 조사 후 결정), 정식 구현 범위는 PoC 보고 승인 후 |

### Decode-X v1.3 본 개발 (Mission Pivot + Foundry-X 통합, 신규 등록)

| ID | 유형 | 도메인 | 우선순위 | 상태 | 제목 |
|----|------|--------|:--------:|:----:|------|
| AIF-REQ-035 | Feature | Pipeline | P0 | IN_PROGRESS | **Decode-X v1.3 본 개발** — Decode-X 개발기획서 v1.2 + v1.3 부록 C/D/E 기반 본 개발. **Mission Pivot**: "100% Copy Machine" 폐기 → AI-Centric 체질 전환. **Foundry-X 역할 분담**: Decode-X=Input Plane 생산자 / Foundry-X=Process-Output Plane 오케스트레이터. **MVP 스코프**: 전자온누리상품권 1개 도메인, Tier-A 6개 핵심 서비스(예산/충전/구매/결제/환불/선물 + 각 취소), Java/Spring 스택. **Phase 0 Day 1**: 2026-04-18 (본부장 "진행" 결정, 세션 207). **Phase 0 Closure**: 세션 209 — FX PM = Sinclair 겸임 확정으로 C1 DONE, R1/R3 WAIVED(1인 체제), C2/C3/R2/T1~T3 DEFERRED(Phase 1/2 중 재가동). **Phase 1 PoC 1.5일 압축 ✅ 완주** (세션 211): Sprint 1~5 전 MERGED, 재평가 Gate GO, Fill ES-CHARGE-001~009 3자 바인딩 27/27, T3 PoC 3종(Temp=0 + Seed + Self-Consistency), 실 코드(handoff.ts + tacit-interview.ts + llm-client.ts seed + D1 0006 tacit_interview). Match Rate 전 Sprint 100%. **Phase 2 본 개발 ✅ 완주** (2026-04-20, 세션 217) — Sprint 211~216 Batch 1~4 전항 merged. Phase 전체 Match **95.6%**, MVP 5/5, round-trip 91.7%. TC-REFUND-002 실패 = Source-First 정책 성과 proof. 신규 TD 9건(TD-20~28) 등록. **Phase 3 본 개발 PRD Ready** (2026-04-21, 세션 218) — 목표: "Phase 2 미완 마무리 + AI-Centric 품질 도구·Production 운영화". True Must = TD-24 DIVERGENCE 공식 마커(M-1) + TD-25 Foundry-X Production E2E 증거(M-2). Should = AI-Ready 자동 채점기(S-1, 5,214 점수) + AgentResume 실구현(S-2) + Tree-sitter Java(S-3) + comparator 교체(S-4) + Phase 2 작연 정리(S-5) + Java 공용 모듈(S-6). KPI 3종(AI-Ready 자상 점수 95%+ 통과 / Foundry-X Production E2E 실사례 6/6 / DIVERGENCE 공식 마커 3건+). 외부 AI 검토 R1 74/R2 77 (3사 Conditional, 1인 체제 집단 수렴·TD-15 파서 고정) + Ambiguity 0.122 (Ready) → Phase 1/2 선례(R2 68/74, Amb 0.15/0.120로 착수 성공) 기반 착수 정당화. Sprint 218 True Must, Sprint 219~220 Should Have, Sprint 221+ 체력 여유 시. **Phase 3 PRD**: `docs/req-interview/decode-x-v1.3-phase-3/prd-final.md`. **참조**: `docs/req-interview/decode-x-v1.2/prd-v2.md` (v1.3 원본), Phase 0 Closure, `docs/req-interview/decode-x-v1.3-phase-2/prd-final.md`, `docs/03-analysis/features/phase-2-pipeline.analysis.md` |

### Phase 3 UX 재편 — 듀얼 트랙 + AXIS DS 연동 (신규 등록)

| ID | 유형 | 도메인 | 우선순위 | 상태 | 제목 |
|----|------|--------|:--------:|:----:|------|
| AIF-REQ-036 | Feature | UX | P1 | **IN_PROGRESS** | **Phase 3 UX 재편 — 듀얼 트랙(Executive View + Engineer Workbench) + AXIS DS 연동** — Audience 우선순위 재정의: 본부장 + 전문 엔지니어 동등 트랙. 핵심 검증 워크플로우 = **Spec→Source 역추적 Split View**(policy/rule/skill detail 좌측 vs **재구성 마크다운 section 앵커 스크롤 우측** — 세션 221 실측 결과 원본 소스 줄 하이라이트는 Out-of-Scope로 축소). 기존 24 페이지 **사용 빈도 기반 Archive 자동 제안**. **AXIS DS Full 연동**: `@axis-ds/tokens` 적용 + `@axis-ds/react`로 shadcn 대체 + 도메인 특화 컴포넌트(`SpecSourceSplitView`, `ProvenanceInspector`, `StageReplayer`)를 `IDEA-on-Action/AXIS-Design-System` 레포에 재활용 가능한 형태로 기여. **상태**: 2026-04-21 세션 221 TRIAGED + **R1/R2 외부 AI 검토 완료 (자동 + 정직 정제 + 착수 판정)** → **TRIAGED→PLANNED** 전환. OpenRouter 3 모델(ChatGPT/Gemini/DeepSeek) 자동 호출. **R1 79/100** (Gemini Ready, ChatGPT·DeepSeek Conditional) → PRD v0.2→v0.3 패치(apply 모드 12건 유지 + 가짜 DAU 수치 2건 정직 정제 + §11.4 실측 계획 섹션 신설). **R2 71/100** (전원 Conditional, 가중 이슈 밀도 5.0→3.6/1K자 **-28% 개선** = 실질 품질 향상). **R1+R2 평균 75/100** ✅ (기준 74 통과, Phase 2 74/Phase 3 본 75.5 수준). Ambiguity 0.175(목표 0.15 근소 미달, Phase 1 선례 0.15 수준, 실행 중 해소 가능). Provenance 실측: `sourceLineRange` 스키마 부재(0% 확정) → F364 분리(Phase 4+), `pageRef` optional 유지(F365 선택적 실측). 착수 판정 근거: R3는 수렴 실패 위험 + R2 Conditional 조건 대부분이 S219 실행 영역(CF Analytics 실측·실사용자 파일럿·기술 협약). Sprint 219~221 F-item 배치 대기(F370~F384 제안). **PRD v0.3 폴더**: `docs/req-interview/decode-x-v1.3-phase-3-ux/{prd-final.md, review-history.md, review/round-1, review/round-2}`. 실측 보고서: `docs/03-analysis/features/provenance-coverage-2026-04-21.md`. **R2 Sprint 전이 항목 9건**: Section-only 실사용자 파일럿(S221), Archive 실측 1차 결정(S219~220), §12 온보딩 본문 작성(S219 초), 레거시 DEMO_USERS 마이그(S219), Role별 Audit Log 설계(S220~221), "놀교 동료" KPI 평가자 정의(S221), Spec↔Source 규제 준수 스토리(S220), AXIS DS 기술 협약(S219 선행), CF Access 공식 확인서(S219 선행). **참조**: AIF-REQ-035 Phase 3, `docs/AX-BD-MSA-Restructuring-Plan.md` §S7, `apps/app-web/src/components/Sidebar.tsx`, F364/F365 |

---

## 8) Risks & Constraints

> GOV-005 리스크 관리 표준 적용. 유형: Blocker / Dependency / Tech Debt / Constraint

### 기술 제약 (Constraint)

| ID | 제약 | 영향 | 대응 |
|----|------|------|------|
| C-01 | Cloudflare Workers 30초 CPU 타임아웃 | 대용량 PDF 파싱 시 524 에러 | ✅ AIF-REQ-004 해결 — PDF 페이지/PPTX 슬라이드 분할 + 전략 fallback |
| C-02 | D1 SQLite 단일 DB 용량 제한 (500MB Free) | 대규모 데이터 시 스케일링 | 서비스별 DB 분리로 완화 (현재 10 DB) |
| C-03 | Neo4j Aura Free 제한 (200K nodes, 400K rels) | 온톨로지 확장 시 Pro 필요 | 파일럿 규모에서는 충분 |
| C-04 | Anthropic API 크레딧 기반 과금 | 크레딧 소진 시 Tier 1/2 중단 | 멀티 프로바이더 fallback 구현 완료 |
| C-05 | PRD가 docx 단일 문서 | 구조적 참조 어려움 | SPEC.md + CLAUDE.md로 구조화 보완 |

### 기술부채 (Tech Debt)

| ID | 위치 | 내용 | 영향 | 등록일 |
|----|------|------|------|--------|
| TD-01 | `svc-governance/src/routes/cost.ts` | cost 집계 미구현 (TODO) | 비용 대시보드 부정확 | 2026-03-08 |
| ~~TD-02~~ | `infra/migrations/db-skill/0003_add_org_id.sql` | ✅ skills 테이블 organization_id 컬럼 추가 | 해소 (세션 131) | 2026-03-08 |
| ~~TD-03~~ | `svc-policy/src/routes/stats.ts` | ✅ HITL 통계 3개 쿼리 org 필터 추가 (JOIN policies) | 해소 (세션 131) | 2026-03-08 |
| ~~TD-04~~ | `svc-policy/src/routes/quality-trend.ts` | ✅ 정책 품질 트렌드 쿼리 org 필터 추가 | 해소 (세션 131) | 2026-03-08 |
| ~~TD-05~~ | `svc-governance/src/routes/trust.ts` | ✅ Trust 평가 집계 org 필터 추가 + 마이그레이션 | 해소 (세션 131) | 2026-03-08 |
| ~~TD-06~~ | `svc-skill/src/routes/skills.ts` | ✅ 5개 통계 쿼리 + INSERT org 필터 추가 | 해소 (세션 131) | 2026-03-08 |
| ~~TD-07~~ | `svc-ontology/src/neo4j/client.ts` | ✅ Neo4j 6종 노드 organizationId SET 추가 | 해소 (세션 131) | 2026-03-08 |
| ~~TD-08~~ | `svc-governance/src/agent/tools.ts` | ✅ "Miraeasset" 하드코딩 제거 → 동적 organizationId | 해소 (세션 131) | 2026-03-08 |
| ~~TD-09~~ | `svc-policy/src/routes/policies.ts`, `reasoning.ts` | ✅ 정책 목록·Reasoning 분석 org 필터 추가 | 해소 (세션 133) | 2026-03-08 |
| ~~TD-10~~ | `services/*/wrangler.toml` `[env.production]` | ✅ 전 서비스 production 서비스 바인딩 + DO script_name에 `-production` 접미사 추가 (9개 서비스, 33건) | 해소 (세션 151) | 2026-03-08 |
| ~~TD-11~~ | `svc-policy/src/prompts/policy.ts` | ✅ POL-PENSION-* 도메인 코드 하드코딩 → DOMAIN_CONFIGS 동적화 | 해소 (세션 141) | 2026-03-08 |
| ~~TD-12~~ | `svc-ontology` Neo4j Aura | ✅ 3,880건 ontology neo4j_graph_id NULL → backfill 완료 | 해소 (세션 136b) | 2026-03-08 |
| TD-13 | ax-marketplace `req-interview/scripts/review-api.mjs` L1110 `callWithRetryDebate` | **Six Hats 모드가 `--proxy openrouter` 미지원** — 개별 provider API 키만 체크하고 OpenRouter 폴백 누락. 해결안: `callWithRetry`와 동일 패턴으로 `openrouterKey` 파라미터 + `useOpenRouter` 분기 추가. 업스트림 이슈: [KTDS-AXBD/ax-plugin#2](https://github.com/KTDS-AXBD/ax-plugin/issues/2) | Six Hats 토론 사용 불가 (세션 207 Decode-X v1.3 검토 중 발견) | 2026-04-18 |
| TD-14 | ax-marketplace `req-interview/scripts/review-api.mjs` `--mode apply` | **73KB+ PRD에서 `max_tokens` 제한으로 LLM 응답 잘림** (73KB→17KB, 변경 마커 0건). 해결안: (a) apply 모드에서 `maxOutputTokens` 동적 확대 + streaming/chunked 처리, (b) 큰 PRD는 섹션별 분할 apply 파이프라인. 업스트림 이슈: [KTDS-AXBD/ax-plugin#3](https://github.com/KTDS-AXBD/ax-plugin/issues/3) | 대형 PRD 자동 반영 실패 (세션 207 Decode-X v1.3 검토 중 발견) | 2026-04-18 |
| TD-15 | ax-marketplace `req-interview/scripts/review-api.mjs` 스코어카드 항목 3 파서 | **`### 부록 C. 사용자 페르소나` 형식 미매칭** — 부록 하위 섹션(사용자/이해관계자/MVP/Out-of-scope)이 스코어카드 키워드 매처에 잡히지 않아 실제 내용 충족에도 "최소" 판정 유지. 해결안: 매처에 `### 부록 [A-Z]\. (.+)` 패턴 추가 + 키워드 탐색 범위 전체 문서로 확장. 업스트림 이슈: [KTDS-AXBD/ax-plugin#4](https://github.com/KTDS-AXBD/ax-plugin/issues/4) | Round 2 76→68 점수 역행의 주 원인 (세션 207 Decode-X v1.3 검토 중 발견) | 2026-04-18 |
| TD-16 | `scripts/java-ast/src/runner.ts` MyBatis XML 파서 | **`parseMyBatisMapper()` 완전 누락** — Sprint 212 Design §1 다이어그램에 4종 파서(Controller/Service/Entity/MyBatis) 명시되었으나 MyBatis XML (`<select>/<insert>/<update>/<delete>`) 파싱 로직 없음. `SourceAnalysisResult.stats.mapperCount` 필드만 예약 상태. 해결안: MyBatis XML namespace + statement ID 추출 + 결과 타입 파싱 + CLI stats 반영. Sprint 214b(결제 Fill) 착수 시 자연 보완 예상 | LPON 결제는 MyBatis 사용 — Fill 단계 품질 영향 (세션 217 Phase 6 분석) | 2026-04-20 |
| TD-17 | `packages/utils/src/reconcile.ts` `requiredParams` DIVERGENCE | **Design §3 2종 사유 중 `requiredParams` 미구현** — 현재 `paramCount`만 판정, Design 명시된 `requiredParams` 분기 + 테스트 없음. 해결안: `DocEndpointSpec.requiredParams: string[]`과 CLI 추출 필수 param 세트 비교 로직 추가 + reconcile.test.ts 시나리오 추가 (0.5h) | Source-First Reconciliation 완결성 저하 (세션 217 Phase 6 분석) | 2026-04-20 |
| TD-18 | `services/svc-ingestion/src/parsing/java-*.ts` vs `scripts/java-ast/src/runner.ts` DRY 위반 | **Sprint 212가 기존 svc-ingestion Java 파서(Phase 1)를 import하지 않고 CLI에서 regex 재구현** → Worker-side parser와 CLI-side parser 동시 유지 → drift 위험. 해결안: `packages/utils/src/java-parsing/`에 공용 모듈 추출 후 양쪽에서 consume (Phase 3/217 예정) | DRY 위반, 장기 유지보수 비용 (세션 217 Phase 6 분석) | 2026-04-20 |
| TD-19 | PRD `docs/req-interview/decode-x-v1.3-phase-2/prd-final.md` §4.1 M-2 Tree-sitter 명세 | **PRD↔Code silent drift** — PRD §4.1 M-2는 "Tree-sitter(Java) 기반 1차 구현 → WASM fallback, javaparser PoC 비교용"으로 명시. 실제 Sprint 212 구현은 regex CLI (Node 환경, Tree-sitter/WASM/javaparser 전무). 해결안: (a) PRD 갱신하여 "regex CLI로 확정"으로 공식 표기, 또는 (b) Tree-sitter 업그레이드를 Phase 3 스코프 `AIF-REQ-{신규}`로 등록 | 문서 기준으로는 Gap 존재 — 코드 자체는 기능함 (세션 217 Phase 6 분석) | 2026-04-20 |
| TD-20 | Sprint 215 Plan/Design 문서 부재 | **PDCA 규약 미준수** — Sprint 215(Handoff Adapter → Foundry-X) plan/design doc 없이 바로 구현+report로 진행. Phase 2 종합 Gap Analysis §4.2에서 발견. 해결안: 본 분석 §3.1을 근거로 retroactive Plan/Design 작성 (0.5h). P3 | PDCA 추적성 저하 (세션 217 Phase 2 통합 분석) | 2026-04-20 |
| TD-21 | Sprint 214c `docs/poc/sprint-214c/gift-skill/provenance.yaml`, `settlement-skill/provenance.yaml` FX-SPEC 버전 drift | **버전 표기 불일치** — 214c provenance가 FX-SPEC-003 v1.1로 참조하나 Phase 2 계약 기준은 v1.0. 해결안: gift/settlement provenance.yaml의 `fxSpec.version`을 `v1.0`으로 통일 (0.1h). 214c Match 93→96% 예상. P3 | 계약 버전 정합성 (세션 217 Phase 2 통합 분석) | 2026-04-20 |
| TD-22 | `scripts/roundtrip-verify/comparator.ts:168-177` 8 keys silent PASS | **검증 하네스 허점** — Sprint 216 round-trip comparator가 `rfndPsbltyYn`을 포함한 8개 키에서 실 DB 조회 없이 하드코딩 값으로 PASS 처리. 해결안: 실 Foundry-X Working Prototype D1 조회로 교체 (2h). P2 | round-trip 91.7% 신뢰도 저하 (세션 217 Phase 2 통합 분석) | 2026-04-20 |
| TD-23 | `scripts/roundtrip-verify/` LPON refund 시나리오 `rfndPsbltyYn` 하드코딩 | **도메인 반환값 주입 문제** — 환불 가능 여부 플래그를 domain 로직이 아닌 테스트 하네스가 주입. 해결안: domain 반환값에서 산출하도록 수정 또는 DB 조회 검증 추가 (1h). P2 | Source-First 정책 위반 우려 (세션 217 Phase 2 통합 분석) | 2026-04-20 |
| ~~TD-24~~ | `packages/utils/src/reconcile.ts` + LPON refund provenance | ✅ **DIVERGENCE 공식 마커 5건 발행** (BL-024 HIGH + BL-026/028/029 MEDIUM + BL-027 LOW) — `.decode-x/spec-containers/lpon-refund/provenance.yaml` divergenceMarkers 섹션. F354 완결, M-3 달성률 85→95%. 해소 (세션 218, c2e5683) | 2026-04-20 |
| ~~TD-25~~ | ~~Foundry-X Production E2E 검증 증거 부재~~ | ✅ **해소 (세션 230, Sprint 228 F397~F400)** — 7 lpon-* containers packaging + `/handoff/submit` × 7 (HTTP 201 전원 PASS) + Foundry-X D1 `prototype_jobs` 7 rows cross-check. AIF-ANLS-031 증빙 리포트 + CF error 1042 Service Binding fix (SVC_FOUNDRY_X). M-2 Production E2E 7/7 달성 | Phase 2 "Foundry-X 핸드오프 E2E 첫 사례" 핵심 증거 (세션 217 Phase 2 통합 분석, Phase 3 선행 권장) | 2026-04-20 |
| TD-26 | TD-18 연장 — `packages/utils/` Java 파서 이관 미완 | **svc-ingestion/parsing/java-*.ts + scripts/java-ast/runner.ts 중복 유지** — Phase 3 착수 전 `packages/utils/src/java-parsing/` 공용 모듈 추출 권장. P3 | DRY 위반 지속 (세션 217 Phase 2 통합 분석) | 2026-04-20 |
| TD-27 | AI-Ready 자동 채점기 (PRD §4.2 Should) 미구현 | **Phase 2 scope 밖** — Sprint 214a/b/c 자가보고 "AI-Ready 6기준 10/10"은 수동 평가. 자동 채점기는 Phase 3 scope로 이관. 해결안: Phase 3 Sprint 편입 (크기 TBD). P3 | 정량 지표 자동화 지연 (세션 217 Phase 2 통합 분석) | 2026-04-20 |
| TD-28 | TD-19 연장 — Sprint 212 regex CLI → Tree-sitter 이관 | **PRD 명세 대비 구현 gap** — TD-19의 후속. 해결안: (a) Phase 3 Sprint로 Tree-sitter 업그레이드, 또는 (b) PRD §4.1을 "regex CLI 확정"으로 수정. P3 | 유지보수성·확장성 (세션 217 Phase 2 통합 분석) | 2026-04-20 |
| TD-30 | `services/svc-skill/wrangler.toml` `FOUNDRY_X_URL` + `handoff.ts:236` path + production secrets/migration | **Sprint 215 Production 도구 정리 4건 미완** — (1) FOUNDRY_X_URL worker 이름 오류(`-production`/`-staging` → `-api`/`-api-staging`), (2) handoff path `/api/` prefix 누락, (3) FOUNDRY_X_SECRET production 미설정, (4) `0007_handoff_jobs.sql` production 미적용. 해결안: F355a로 흡수(30min). **P1** | Production E2E 호출 자체 불가 — Sprint 215 코드는 단 한 번도 실 production에서 동작하지 않았음 (세션 218 F355 사전 조사 발견) | 2026-04-21 |
| TD-31 | `services/svc-skill/src/routes/handoff.ts:240` X-Internal-Secret ↔ Foundry-X `packages/api/src/app.ts:222` authMiddleware (JWT+tenant) | **인증 모델 미스매치** — Decode-X는 service-to-service inter-internal-secret 패턴, Foundry-X는 user JWT + tenantGuard 패턴. FX-SPEC-003 contract document에 인증 방식 명세 부재가 원인. 해결안: F355b로 분리 — Foundry-X `/api/internal/prototype-jobs` 신설(X-Internal-Secret 미들웨어 + 명시적 orgId). Cross-repo PR 2~3h. **P1** | 갭 #5 — 인증 헤더 정렬 없이는 호출 401/500 (세션 218 F355 사전 조사) | 2026-04-21 |
| TD-32 | `.decode-x/spec-containers/lpon-*/` ↔ Production D1 `skills` 테이블 + R2 SkillPackage | **결정타: spec-container → skills D1 packaging pipeline 부재** — Phase 2가 `.decode-x/spec-containers/`에 7 디렉토리 산출물(provenance + rules + runbooks + tests + contracts)을 만들었으나, 이를 SkillPackage Zod schema로 변환 + R2 업로드 + skills D1 INSERT하는 packaging step이 없음. Production skills의 lpon-* domain count = 0건. handoff/submit 호출 시 `notFound("skill", skillId)` 반환. 해결안: F362로 신규 등록 — `POST /skills/from-spec-container` endpoint + 7서비스 일괄 packaging 스크립트. 1~2 Sprint. **P0** | Tier-A handoff 데이터 흐름 0%. F354 DIVERGENCE 마커도 결국 Production 데이터 없이는 영속·검증 불가 (세션 218 F355 사전 조사) | 2026-04-21 |
| TD-29 | `docs/` frontmatter 누락 90건 (40%) | **GOV-001 형식 위반** — `/ax:gov-doc index` dry-run 결과 227개 활성 .md 중 90개에 frontmatter 없음. 영향: INDEX 자동화 불가, 카테고리 분류 디렉토리 휴리스틱 의존. 주요 누락 영역: features/sprint-* (plan/design/analysis/report) 35건, poc/* 13건, req-interview/decode-x-v1.2/review/round-* 12건, decode-x-v1.2/* 6건, decode-x-restructuring/* 3건, contracts/* 3건, docs/ 직속 4건. 해결안: (a) 필수 8필드(code/title/version/status/category/created/updated/author) 일괄 보강, (b) review/round-* + sub-meta는 frontmatter 면제 정책 명시. 사전 자료: `docs/INDEX-inventory-2026-04-21.md`. **추가 발견**: 오타 디렉토리 `03-plan`(1)·`03-report`(2)·`06-report`(1) 정리 필요. P3 | INDEX 큐레이션 의존도 영구화 (세션 218 /ax:gov-doc index dry-run) | 2026-04-21 |
| TD-33 | `scripts/package-spec-containers.ts:94` parseRulesMarkdown regex | ✅ **F362 packaging script 1/7→7/7 파싱 복구** — 세션 221 production 실증 선행조사 중 발견. 기존 `/^\|\s*(BP-\d{3})\s*\|/` 정규식이 lpon-purchase(BP-NNN)만 매칭, 나머지 6/7(BL/BB/BL-G 패턴)는 skip. `(?:BL\|BP\|BB\|BG\|BS)-[A-Z]?\d{3}`로 확장. 드라이런 검증: 0/7 → 7/7 파싱 (lpon-charge 8 policies/41 tests 포함). 해소 (세션 221) | Sprint 219 F362 "7서비스 일괄 packaging" 주장이 실제로는 lpon-purchase 샘플 1개만 테스트하고 merge된 회귀. M-2 Production E2E 6/6 KPI의 파싱 전제조건 | 2026-04-21 |
| ~~TD-34~~ | Decode-X svc-skill production `FOUNDRY_X_SECRET` + Foundry-X production `DECODE_X_HANDOFF_SECRET` | ✅ **양측 secret 정렬 완료** — 세션 221 사용자 직접 `openssl rand -hex 32` 생성값 `4f03c4a4...673e`를 양측에 put. Decode-X svc-skill production redeploy(Version `415addcd`). 실 호출 증명: `POST /handoff/submit` with lpon-charge(skillId `66f5e9cc-77f9-406a-b694-338949db0901`) → HTTP 409 GATE_FAILED(AI-Ready 0.69<0.75) → 인증·manifest·source-manifest·gate-check 전 구간 기능 정상 동작. 해소 (세션 221) | Sprint 219 F355b가 production에서 실제 동작하도록 완결, M-2 KPI "Production E2E 실사례" 1건 증거 확보 | 2026-04-21 |
| ~~TD-35~~ | `services/svc-skill/` staging 배포 대기 + db-skill-staging 전체 미초기화 | ✅ **해소 (세션 223)** — TD-39 수정 + TD-40 backfill 실행 + production deploy 첫 성공 증명(`gh run 24720331379` 12/12 jobs success: Prepare → Typecheck → D1 Migrations (production) ✅ → 7 Workers deploy ✅ → Deployment summary ✅). CI migration 자동 파이프라인이 production에서 실 작동 증명. staging 실 검증은 별도(`bash scripts/db-init-staging.sh --env staging` + workflow_dispatch staging 실행) 차기 세션 | 자동 파이프라인 실작동 증거 확보. db-skill-staging 초기화는 동일 스크립트로 원클릭 실행 가능 | 2026-04-21 |
| ~~TD-36~~ | `../Foundry-X/packages/api/wrangler.toml` [env.production] 섹션 부재 | ✅ **해소 (세션 224, Foundry-X `2a499600`)** — top-level mirror 전략으로 `[env.production]` 블록 신설. Bindings 전수 복제: D1(DB), vars(GITHUB_REPO/ENVIRONMENT/DEFAULT_SHARED_ORG_ID), KV(CACHE), AI, R2(FILES_BUCKET), services(SVC_EXTRACTION/ONTOLOGY/SKILL), triggers(cron 6h). top-level 유지로 기존 CI/CD(`wrangler deploy` no-flag)는 그대로 동작 → backward-compat 확보. 향후 `wrangler deploy --env production` 전환 시 환경 격리 자동 활성화. Python `tomllib` parse 검증 통과(`env keys: [dev, staging, production]`). 해소 (세션 224) | staging/production 환경 섹션 parity 복구. 향후 전환은 별도 이슈(CI/CD `--env production` flag 추가 + top-level 제거) | 2026-04-21 |
| ~~TD-37~~ | `infra/migrations/db-skill/` skills `document_ids` 컬럼 부재 | ✅ **0009_add_document_ids.sql 신설 + production 적용** — Sprint 5(Phase 1) handoff.ts 도입 시 migration 누락. `handoff.ts:78` SELECT document_ids가 production에서 `no such column` 500 에러 유발. 세션 221 production 실증 중 발견. 간단 ALTER TABLE로 해소. 해소 (세션 221) | Sprint 5 handoff 경로는 production에서 한 번도 실행 안 됨 — Sprint 219까지 아무도 감지 못한 drift | 2026-04-21 |
| ~~TD-38~~ | `infra/migrations/db-skill/0006_tacit_interview.sql` production 미적용 | ✅ **0006 wrangler d1 execute 수동 적용** — Sprint 5 tacit_interview_sessions/tacit_spec_fragments 테이블 production 생성. handoff.ts:100-108이 해당 테이블을 JOIN 조회하므로 production 실증 필수 선행조건. Migration 순서 관리 파이프라인 부재로 0007/0008은 적용됐으나 0006만 누락(F355a/F362 배포자의 선택적 적용 실수). 해소 (세션 221) | TD-35와 함께 migration 자동 파이프라인 필요성의 결정타 — Sprint 220에서 CI/CD D1 migration workflow 추가 필수 | 2026-04-21 |
| ~~TD-39~~ | `.github/workflows/deploy-services.yml` migrate-d1 job 2중 버그 | ✅ **해소 (세션 223, `7cde99d`)** — (1) 모든 migrate-d1 step + `scripts/db-init-staging.sh`에 `--remote` 추가, (2) 5 서비스 wrangler.toml의 `[[env.staging.d1_databases]]` + `[[env.production.d1_databases]]` 블록에 `migrations_dir` 복제. 증거: `gh run 24719888095` log에서 "Resource location: remote" + 0001/0002 ✅ apply 확인. 3번째 `0003_error_type.sql`에서 별도 `duplicate column` 에러 → **TD-40 신규 분리** (drift 본질). | 이 수정으로 wrangler 명령 자체는 작동. 후속 drift는 TD-40으로 | 2026-04-21 |
| ~~TD-40~~ | `d1_migrations` 추적 테이블 production 비어있음 — 수동 `wrangler d1 execute --file` 초기화 이력과 CI 기반 apply 불일치 | ✅ **해소 (세션 223)** — `scripts/backfill-d1-migrations.sh`(세션 223 신설) 실행 완료. 5 DB 백필 결과: db-ingestion 3, db-structure 8, db-policy 2, db-ontology 2, db-skill 11 (총 26건, INSERT OR IGNORE 멱등). 이후 `gh workflow run deploy-services.yml -F environment=production` 트리거 → **run 24720331379 12/12 jobs 전원 success** (D1 Migrations production ✅ 포함). F366 CI 실효성 첫 완전 증명 | 세션 222 "자가보고 vs 실 production" 패턴 **마침내 종결** — CI pipeline이 production에서 실 작동 | 2026-04-21 |
| ~~TD-41~~ | `apps/app-web/e2e/` — auth.setup.ts 외 10개 spec 전체 skip | ✅ **해소 (세션 229, 2026-04-22, Sprint 227 F401 `34d49c6`)** — `VITE_DEMO_MODE` + `?demo=1` bypass 옵션 A 접근으로 해결. 3단계 fix: (1) AuthContext 모듈 로드 시점 `?demo=1` 캡처 + localStorage 선행 저장 (`bab6149`, React-Router Navigate query drop 우회), (2) Sprint 224 F374 분기 활성화 legacy Dashboard 전제 E2E 7건 `page.goto("/?legacy=1")` 치환 (`88234ab`), (3) 병행 pane Sprint 228 MERGED 충돌 merge (`cf53074`). **CI E2E 45/45 PASS** (기존 1건 → 45건 복원). **S219/S220/S226 "autopilot local TEST=pass ≠ CI production pass" 4연속 패턴 종결**. Production 가드: `wrangler.toml` env.vars에 `VITE_DEMO_MODE` 미정의 | TD-41 원인 DEMO_USERS 폐기(Sprint 223) → 3 sprint 연쇄(S224 F374 / S226 F392 / S227 F401) 종결 | 2026-04-22 |
| ~~TD-42~~ | `scripts/ai-ready/sample-loader.ts` + `services/svc-skill/src/ai-ready/prompts.ts` ↔ Production 데이터 현실 | ✅ **코드 레벨 해소 (세션 232, Sprint 232 F402 PR #33 `425c3e83`)** — `SpecContent` interface 재정의 (sourceCode 필드 제거 → provenanceYaml/contractYaml/rules/runbooks/tests). fs-based sample-loader로 7 lpon-* 직접 로딩. 6기준 rubric도 markdown 기반 재작. 25 테스트 PASS + CI 3/3 + Match Rate 98%. ⚠️ **실 실행 DoD는 별도 TD-43으로 분리** (evaluate.ts 42 LLM 호출 + 수기 검증 + accuracy MD 미수행). 해소 (세션 232) | F356-A 인프라 재활용 성공 + spec-container SSOT 원칙 확정 | 2026-04-22 |
| TD-43 | `reports/ai-ready-poc-2026-04-22.json` + `reports/ai-ready-poc-accuracy-2026-04-22.md` 미생성 + evaluate.ts 실 실행 미수행 | **F402 DoD 잔여분 — autopilot이 코드 재설계만 완결하고 "실제 $0.22 (42 호출)" 기재했으나 실측 reports/ 산출물 부재**: (a) `pnpm tsx scripts/ai-ready/evaluate.ts --spec-dir .decode-x/spec-containers --model haiku` 실 실행, (b) 42 LLM 호출(7 × 6, Haiku, 예상 비용 < $0.30) + JSON 리포트 생성, (c) 1건 수기 재채점(lpon-charge 권장, 6기준 ±0.1 이내 정확도 측정), (d) accuracy MD 생성 → Phase 2 (F356-B) GO/NO-GO 최종 판정. 예상 1~2h. **P1** | F356-B Phase 2 전수 배치(859 skill × 6 = 5,154 호출 / Haiku $16 or Opus $320) 착수 근거 부재 — 현재는 Match Rate 98%만으로는 정확도 증명 불충분. `feedback_autopilot_production_smoke` 패턴 6회차 재현 (S215/S219/S220/S228/S230 + **S232**) — rules/development-workflow.md 재현 카운트 보강 대상 | 2026-04-22 |

> **Note**: TD-10 범위 확대 — 원래 svc-queue-router만 등록했으나, 실제로는 9개 서비스(svc-mcp-server 제외) 전체 production 서비스 바인딩이 default env를 참조하는 동일 이슈 확인 → 일괄 수정
> **Note**: TD-13/14/15는 **외부 리포(ax-marketplace)** 이슈 — ax plugin 업스트림으로 PR 또는 이슈 전달 필요. 로컬 Decode-X 리포 코드 수정은 아님
> **Note**: TD-20~28은 Phase 2 종합 Gap Analysis(`docs/03-analysis/features/phase-2-pipeline.analysis.md` §4.2) 산출. **TD-24/TD-25(P1)는 Phase 3 Sprint 1 착수 전 선행 해소 권장** (M-3 + M-6 완결)
> **Note**: TD-30~32는 세션 218 F355 사전 조사(`docs/03-analysis/features/sprint-218-f355-gap-analysis.md`) 산출. **TD-25 "Foundry-X Production E2E 증거 부재"의 본질은 6중 구조 갭**이며 TD-30(도구 4건 P1)/TD-31(인증 1건 P1)/TD-32(데이터 흐름 1건 P0)으로 분해됨. F355 → F355a + F355b + F362 분할. *(원래 TD-29로 등록했으나 동시 다른 pane의 `f40c26e` TD-29(frontmatter 누락) 우선 — TD-30~32로 시프트)*
> **Note**: TD-33~36은 세션 221 "production 1/7 실증 진행" 선행조사 산출. **Sprint 219의 F355b/F362 "완결" 주장이 production에서 실제로는 한 번도 동작하지 않았음**을 6건 증거로 확인: (1) 파싱 regex 1/7만 동작(TD-33, ✅세션 221 해소), (2) 인증 secret 양측 미설정(TD-34, P0), (3) staging 배포·DB 초기화 지연(TD-35, P1), (4) Foundry-X wrangler config env drift(TD-36, P2), (5) svc-skill staging Sprint 219 미재배포(TD-35 일부), (6) db-skill-staging skills 테이블 자체 없음(TD-35 일부). TD-25 "자가보고 근거 부족" 패턴이 Sprint 215 이후 Sprint 219에서도 반복됨. **Phase 3 M-2 Production E2E 6/6 KPI 실착수 전 TD-34 선행 필수**.

> **Note**: TD-39는 세션 222 Sprint 220 F366 merge 직후 production CI 실패 관측 산출. **F366이 TD-35 해소를 목표로 만든 workflow가 F366 자체 구현 결함으로 production에서 실패** — TD-25 패턴이 Sprint 220 내부에서 즉시 재현(자가보고 Match 100% vs 실 production 첫 시도 실패). autopilot이 `wrangler d1 migrations apply` 명령을 local context로 테스트해 통과했으나 CI production context에서는 `--remote` + env override 문제 2중 노출. 교훈: autopilot 테스트는 "명령어 실행 성공"만 본 것이지 "production 시나리오 모사"는 아니므로 Match Rate 100%가 곧 Production 동작 증명이 아님 (Phase 2 선례 반복). Sprint 221+ 진입 전 TD-39 선제 해소 권장.

### 가정 (Assumptions)

- HITL UX 범위를 MVP로 고정 (Reviewer 1인 승인 워크플로우)
- 퇴직연금 도메인 파일럿이 성공하면 다른 도메인으로 확장

---

## 9) Decision Log (요약)

- 2026-02-26: 신규 repo 생성 및 PRD seed 문서 반입
- 2026-02-26: Discovery-X 기반 Claude Code 운영 체계(.claude skills/agents) 이식
- 2026-02-26: 모노레포 스캐폴딩 완료 — Bun workspaces + Turborepo, 10 Workers 서비스, React+Vite SPA
- 2026-02-26: 공유 패키지 exports를 `./src/index.ts` (raw TS)로 설정 — Wrangler esbuild가 빌드 처리
- 2026-02-26: `packages/utils`에 `@cloudflare/workers-types` 추가 — Response/console 타입 해결
- 2026-02-26: typecheck 13/13 통과 확인
- 2026-02-26: Cloudflare 인프라 프로비저닝 완료 — D1/R2/Queue/KV ID wrangler.toml 반영
- 2026-02-26: D1 마이그레이션 remote 적용 완료 (Cloudflare REST API 직접 사용)
- 2026-02-26: svc-llm-router / svc-security / svc-ingestion wrangler deploy 완료 — 전 서비스 /health HTTP 200 확인
- 2026-02-26: Wrangler secrets 실값 설정 완료 (ANTHROPIC_API_KEY, JWT_SECRET auto-gen, CLOUDFLARE_AI_GATEWAY_URL)
- 2026-02-26: AI Gateway 'ai-foundry' 생성 + E2E LLM 파이프라인 검증 완료 (/complete + /stream)
- 2026-02-26: E-01 마스킹 미들웨어 구현 (svc-security POST /mask, PII 5종, D1 audit 저장)
- 2026-02-26: E-02 Stage 1 완성 — svc-ingestion Queue consumer + Unstructured.io 연동 + /mask 연동 + document_chunks D1 저장
- 2026-02-26: E-03 Stage 2 완성 — svc-extraction 구현 (Claude Sonnet으로 process/entity/rule 구조 추출, service binding LLM 호출)
- 2026-02-28: E-04 Prompt Registry — svc-governance 라우트 구현 (CRUD + KV 캐시 + Trust + Cost)
- 2026-02-28: E-05 RBAC 적용 — extractRbacContext/checkPermission/logAudit 유틸 + 3개 서비스 적용
- 2026-02-28: G-01 Queue Router 아키텍처 도입 — Cloudflare Queues single-consumer 제약 해결. svc-queue-router가 유일한 consumer로 event type별 service binding fan-out. 기존 6개 서비스의 queue consumer를 POST /internal/queue-event HTTP 엔드포인트로 전환
- 2026-02-28: G-01 전 서비스 배포 완료 — 11개 Workers (10 SVC + queue-router) 전체 배포, /health HTTP 200 확인, INTERNAL_API_SECRET 설정
- 2026-02-28: G-02 E2E 이벤트 체인 수정 — ingestion.completed 발행(BUG-1) + extraction 실제 청크 조회+이벤트 발행(BUG-2) + DB 스키마 수정(BUG-3). 3개 서비스 재배포
- 2026-02-28: INTERNAL_API_SECRET 전 서비스 변경 (demian00! → e2e-test-secret-2026) — bash history expansion 이슈 해결
- 2026-02-28: G-02b svc-policy LLM 프롬프트 수정 — Opus JSON-only 출력 강제 + extractJsonArray 로버스트 파싱. E2E Stage 4 통과
- 2026-02-28: G-02c E2E 8/8 PASS — HITL auto-assign 패턴 도입 (open → assign → action을 approve 핸들러에서 자동 수행), policy/session D1 INSERT를 동기화 (ctx.waitUntil → await), db-policy policy_code UNIQUE 제약 제거 (다중 실행 지원)
- 2026-02-28: G-03 MCP 어댑터 — .skill.json → MCP Server tool definitions 온-더-플라이 변환. 저장하지 않고 요청 시 계산 (projection 패턴)
- 2026-02-28: G-04 app-web Persona 화면 — 9개 페이지 구현 (upload, pipeline, comparison, skill-catalog, skill-detail, results, audit, dashboard, cost). API 클라이언트 5개 추가
- 2026-02-28: Phase G 완료 → Phase H (Hardening) 진입 결정. 잔여: unit test, Pages 배포, Neo4j 연결, notification/analytics 구현
- 2026-02-28: H-06 Neo4j Aura 연결 — Aura 5.x HTTP Transaction API 차단(403) 발견 → Query API v2 (`/db/{database}/query/v2`) 로 전면 리팩토링. multi-statement batch를 순차 실행 래퍼로 변환. NEO4J_USERNAME/NEO4J_DATABASE env 추가
- 2026-02-28: H-07 Unit test 확대 — svc-ingestion 53 tests (96.66%), svc-extraction 52 tests (100%). CfProperties→IncomingRequestCfProperties 타입 불일치는 테스트 내 `as any` 캐스트로 해결
- 2026-02-28: H-08 환경 분리 — 개별 deploy workflow 3개 → deploy-services.yml 통합 (matrix strategy). push→staging 자동, release→production 자동, workflow_dispatch→수동 선택. deploy.sh 스크립트 추가
- 2026-02-28: Phase H 완료 → Phase I (Staging Provisioning + Polish) 진입 결정
- 2026-03-01: I-01 RBAC 확장 — svc-notification/svc-analytics에 RBAC 미들웨어 적용. "notification" 리소스를 ResourceSchema에 추가. 선택적 RBAC: /internal/queue-event는 skip, 사용자 대면 엔드포인트만 적용
- 2026-03-01: I-02 Unit test 대규모 확장 — 5개 서비스 병렬 작성 (440 tests). svc-queue-router keyof Env 타입 이슈 해결 (ServiceBinding 축소 타입). 총 테스트: 269→709
- 2026-03-01: I-04 Staging 리소스 프로비저닝 — D1×10, R2×2, Queue×1, KV×2 생성 + 11개 wrangler.toml placeholder→실제 ID 교체 + D1 migration 13개 적용. D1 MCP에서 DROP TABLE은 WAF 차단 → wrangler CLI 우회
- 2026-03-01: I-05 GitHub Environments — repo secrets (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID) + production deployment_branch_policy (main only). required_reviewers는 유료 플랜 필요
- 2026-03-01: I-06 모니터링 — scripts/health-check.sh (12서비스+Pages, JSON/text 출력, svc-notification 알림) + .github/workflows/health-check.yml (30분 cron). 검증: 12/12 healthy
- 2026-03-01: Phase I 완료
- 2026-03-01: Staging service binding 수정 — `[env.staging]` service/DO binding에 `-staging` 접미사 추가. Cross-env 오염 방지 (9 파일, 20 변경)
- 2026-03-01: Staging 전체 배포 — 11 Workers staging 배포 + secrets 설정 + health 11/11 + API 기능 검증
- 2026-03-01: health-check.sh 수정 — `--env staging` 시 `-staging` worker URL 사용
- 2026-03-01: Frontend API 연동 — ontology/api-console/trust 3페이지 mock→실제 API 전환
- 2026-03-01: E2E 스크립트 확장 — --staging/--real-doc/--json/--wait-queue 옵션 추가
- 2026-03-01: UNSTRUCTURED_API_KEY staging secret 설정 + set-secret workflow 추가
- 2026-03-01: **Staging E2E 7/7 PASS** — 실제 pension-withdrawal.pdf 5-Stage 파이프라인 검증 성공
- 2026-03-01: **Production 배포 11/11** — 전체 Workers production 재배포 + UNSTRUCTURED_API_KEY production secret 설정
- 2026-03-02: 로컬 개발 환경 — 11 서비스 포트 할당 (8701-8711) + Wave 순차 기동 스크립트 (`dev-local.sh`)
- 2026-03-02: Phase 2-B 품질 메트릭 인프라 — db-analytics/db-governance 마이그레이션 + 이벤트 enrichment + quality API + 파일럿 대시보드
- 2026-03-02: Phase 2-B Production 배포 — 6서비스 + Pages + D1 마이그레이션 + 실문서 E2E 7/7 PASS
- 2026-03-02: Phase 2-C Staging 배치 E2E 10/10 PASS — 합성 문서 10건, 품질 메트릭 org별 수집 확인
- 2026-03-02: svc-extraction 품질 개선 — 적응형 프롬프트 (문서 분류별), 스마트 청크 선택 (head 3 + word_count top 17), maxTokens 4096
- 2026-03-02: CI/CD 수정 — multi-commit push 변경 감지 + production default env 동시 배포
- 2026-03-02: extraction pending 버그 해결 — fetchChunks 응답 파싱 + failed 상태 전환 + org ID 필수 검증
- 2026-03-02: **Production E2E 8/8 PASS** (real-doc pension-withdrawal.pdf, queue-driven)
- 2026-03-03: 멀티 프로바이더 LLM — Anthropic+OpenAI+Google+Workers AI 4-provider fallback. Provider adapter 패턴, D1 provider/fallback_from 컬럼 추가
- 2026-03-03: HITL 47건 승인 — 7개 org, Stage 4 terms 1,228건, Stage 5 skills 134건
- 2026-03-03: Production 전체 배포 동기화 — CI/CD svc-queue-router default env skip + 14/14 jobs success
- 2026-03-03: 퇴직연금 실문서 파일럿 — 카테고리별 대표 11건 업로드, 9/11 parsed, 34 policies, 220 terms, 37 skills
- 2026-03-03: SCDSA002 비표준 XLSX 발견 — 메뉴구조도/테이블정의서 2건 magic bytes 비표준 (Unstructured.io 파싱 불가)
- 2026-04-19 (세션 216): **Decode-X v1.3 Phase 2 본 개발 PRD Ready** — 인터뷰 5파트 완료(Part 1~5, interview-log.md 167줄) → prd-v1(273줄) → Round 1 외부 AI 3모델 79/100(1 Ready+2 Conditional) → apply 27건 반영 prd-v2 → Round 2 74/100(3 Conditional, 1인 체제 집단 수렴 + TD-15 파서 고정) → Ambiguity 0.120 Ready → Phase 1 선례(R2 68/Amb 0.15로 착수 후 1.5일 Full Auto 완주) 기반 착수 정당화. prd-final.md(§11 정당화 appendix 포함) 확정, archive 정리. 목표: "Foundry-X 핸드오프 E2E 첫 사례"(LPON 결제 도메인). Track A(양적, Tier-A 잔여 6서비스 Empty Slot Fill) + Track B(깊이, 결제 E2E → Foundry-X 실 실행 → round-trip). Source-First(원장=소스/참고=문서, 3종 마커 SOURCE_MISSING·DOC_ONLY·DIVERGENCE) + ERWin ERD 추출 R&D. §6 §7 Phase 7 신설 Sprint 211~216 배정. 비용 ~$0.05, 총 소요 약 45분.
- 2026-04-20 (세션 217): **Phase 2 착수 체크리스트 인터뷰 완료 — Sprint 배치 재정의** (6→8 Sprint). (1) Sprint 211 = FX-SPEC-002 v1.1 append → **FX-SPEC-003 Decode-X Handoff Contract 신규 발행**으로 전환 (v1.0 PlumbBridge 계약 불변, 역할 분리). (2) Sprint 212 Java AST = **javaparser (JVM) 확정** — Worker 직접 실행 불가 → offline CLI/Node wrapper 사전 파싱 방식. (3) Sprint 213 ERWin = **경로 A (SQL DDL) 단독 확정** — 경로 B 보류, lpon-charge `0001_init.sql` 소스 기반. (4) Sprint 214 = **214a(예산+구매) ∥ 214b(결제+환불) ∥ 214c(선물+정산) 3분할** — 병렬도 향상, match-rate 안정. 결제 Fill(214b)은 Sprint 215 E2E 선행. (5) Sprint 215 = Foundry-X 신규 엔드포인트 **불요** — 기존 `POST /prototype-jobs` (F353, Sprint 159) 매핑 어댑터로 범위 축소. 예상 소요 4.5h→5.5h (+30분, 3분할 오버헤드). Sprint 211 착수 준비 완료.
- 2026-04-20 (세션 217): **AIF-REQ-035 Phase 2 본 개발 ✅ 완주** — Sprint 211~216 Batch 1~4 전항 merged. 주요 커밋: 211(`82302ec`) + Foundry-X mirror(`bef719fd`) → 212(`10fca6a`) → 213(`ec9ea72`) → 214c(`231e011`) → 214a(`e4cabe4`) → 214b(`ebd838b`) → 215(`18022c8`) → 216(`0947a92`). Phase 2 종합 Gap Analysis(`docs/03-analysis/features/phase-2-pipeline.analysis.md`, `71e8447`): Phase 전체 Match **95.6%** (자가보고 99.7% -4.1%p drift), PRD M-1~M-8 평균 92.5% (6/8 완전 + 2/8 PARTIAL), **MVP §5.2 5/5 달성**, 종합 판정 PASS. **"Foundry-X 핸드오프 E2E 첫 사례" 최우선 목표 달성** — LPON 결제 round-trip 91.7% (11/12) 입증. TC-REFUND-002 실패 = BL-024 SOURCE_MISSING 자동 검출 = Source-First 정책 성과 proof. 신규 TD 9건 등록 (TD-20~28): TD-24/25 P1, TD-22/23 P2, TD-20/21/26/27/28 P3. Autopilot 안정성 37.5%(3/8 자체 완결), 나머지 5건은 Master 수동 복구(`.sprint-context` 병렬 충돌 + pr-lookup hang 패턴).
- 2026-04-21 (세션 218): **AIF-REQ-035 Phase 3 본 개발 PRD Ready** — `/ax:req-interview` 5파트 인터뷰(interview-log.md) → prd-v1(10,885자) → Round 1 외부 AI 3사 74/100(3 Conditional, 77건 actionable) → apply 17건 반영 prd-v2(17,420자, TD-14 응답 잘림 수동 복구) → Round 2 77/100(3 Conditional, 66건 actionable, +3점) → Ambiguity 0.122 Ready(Brownfield 가중치) → Phase 1 선례(R2 68/Amb 0.15) + Phase 2 선례(R2 74/Amb 0.120) 기반 착수 정당화. **체질 유지**: Source-First, Foundry-X 역할 분담, 1인 체제, LPON+Tier-A 6서비스. **변경/확장**: 목표 frame "E2E 첫 사례" → "정량 증거로 반복 가능성 입증", Must 압축(3h), Should 확장(6종), KPI 이동(Match % → 증거 수 + 자동 점수). **Phase 2 미완 반입**: M-3 DIVERGENCE(→M-1) + M-6 Foundry-X Production E2E(→M-2) + Sprint 202 AgentResume(→S-2). **Out-of-scope**: 타 도메인 확장, 외부 파일럿. **Cross-repo**: Foundry-X repo 수정 포함 허용. §6 Phase 8 신설 + F354~F361(8건) 등록 + Sprint 218~221+ 배정. §8 TD-20~28 9건 drift 보정 완료. Phase 3 PRD: `docs/req-interview/decode-x-v1.3-phase-3/prd-final.md` v1.2 (§11 정당화 appendix 포함). 비용 ~$0.06, 총 소요 약 40분.
