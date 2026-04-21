---
code: AIF-ANLS-INDEX-inventory-2026-04-21
title: docs/ 전수 Inventory 보고서 (INDEX.md 보강 사전 자료)
version: 1.0
status: Active
category: ANALYSIS
created: 2026-04-21
updated: 2026-04-21
author: Sinclair Seo
related:
  - docs/INDEX.md (공식 큐레이션 인덱스, 이 보고서는 보조 자료)
  - SPEC.md §8 Tech Debt (frontmatter 누락 90건 정리 필요)
---

# docs/ 전수 Inventory 보고서 (2026-04-21)

> **이 문서는 `docs/INDEX.md` 교체용이 아니에요.** `/ax:gov-doc index`의 dry-run 결과로 생성된 **raw inventory 스냅샷**입니다. 공식 인덱스(INDEX.md)는 의도적 큐레이션(review/round-* 제외 + frontmatter 정돈된 것만 + 카테고리 의미 부여)이 적용된 반면, 이 보고서는 `docs/` 하위 모든 활성 .md 파일을 디렉토리 휴리스틱으로 일괄 등록한 결과예요.
>
> **활용 목적**:
> 1. frontmatter 누락 90건(40%)을 일괄 보강할 때 대상 목록으로 사용
> 2. 카테고리 분포·오타 디렉토리(`03-plan`, `03-report`, `06-report`)·비표준 디렉토리(`LPON 전자식 온누리상품권 플랫폼` 등) 식별
> 3. 기존 INDEX.md와의 누락 격차(PoC +17, REQ-INTERVIEW +25 등) 가시화
>
> **생성 시각**: 2026-04-21 08:53 (세션 218, `/ax:gov-doc index` dry-run)
> **데이터 소스**: `docs/` 하위 .md 파일 (archive/ 제외) frontmatter + 디렉토리 휴리스틱
> **총 수집**: 227건 (frontmatter 있음 137 / 없음 90)

---

## SPEC (3)

| 코드 | 제목 | 버전 | 상태 | 파일 |
|------|------|:----:|:----:|------|
| AIF-SPEC-001 | 퇴직연금 프로세스 정밀분석 PRD v0.1 | "1.0" | Active | `AI_Foundry_퇴직연금_프로세스_정밀분석_PRD_v0.1.md` |
| AIF-SPEC-002 | 퇴직연금 프로세스 정밀분석 PRD v0.2 | "1.0" | Active | `AI_Foundry_퇴직연금_프로세스_정밀분석_PRD_v0.2.md` |
| FX-SPEC-003 | Decode-X ↔ Foundry-X Handoff Contract | 1.0 | Signed | `specs/FX-SPEC-003-handoff-contract.md` |

## PLAN (46)

| 코드 | 제목 | 버전 | 상태 | 파일 |
|------|------|:----:|:----:|------|
| (no-fm) | AI-Ready 6기준 일괄 채점기 + PoC 리포트 | - | Draft | `01-plan/features/sprint-210.plan.md` |
| (no-fm) | B/T/Q Spec 문서 생성기 — 추출 데이터 → 사람이 읽을 수 있는 Spec 문서 조립 | - | - | `01-plan/features/btq-spec-generator.plan.md` |
| (no-fm) | Org 단위 B/T/Q 종합 Spec + UI | - | Draft | `01-plan/features/sprint-209.plan.md` |
| (no-fm) | Sprint 2 Plan — R2 LLM 예산 + T2 Shadow Mode + Empty Slot Fill 첫 3건 | - | Confirmed | `01-plan/features/sprint-2.plan.md` |
| (no-fm) | Sprint 206 — Technical Schema + Extraction 프롬프트 강화 | - | - | `01-plan/features/sprint-206.plan.md` |
| (no-fm) | Sprint 211 — FX-SPEC-003 Decode-X Handoff Contract 신규 발행 | - | In-Progress | `01-plan/features/sprint-211.plan.md` |
| (no-fm) | Sprint 213 — ERWin SQL DDL 파서 PoC (경로 A) | - | In-Progress | `01-plan/features/sprint-213.plan.md` |
| (no-fm) | Sprint 214a — Track A Fill: 예산 + 구매 spec-container 신규 생성 | - | In-Progress | `01-plan/features/sprint-214a.plan.md` |
| (no-fm) | Sprint 3 Plan — T3 결정적 생성 PoC 2종 + 재평가 Gate + ES-CHARGE-004/005/008 Fill | - | Confirmed | `01-plan/features/sprint-3.plan.md` |
| (no-fm) | Track A Fill — 선물 + 정산 | - | In-Progress | `01-plan/features/sprint-214c.plan.md` |
| (no-fm) | deliverable-export-ui.plan.md | - | - | `01-plan/features/deliverable-export-ui.plan.md` |
| (no-fm) | lpon-deliverable-validation.plan.md | - | - | `01-plan/features/lpon-deliverable-validation.plan.md` |
| (no-fm) | recon-x-restructuring.plan.md | - | - | `01-plan/features/recon-x-restructuring.plan.md` |
| (no-fm) | report-ux-improvement.plan.md | - | - | `01-plan/features/report-ux-improvement.plan.md` |
| (no-fm) | skill-framework-1b.plan.md | - | - | `01-plan/features/skill-framework-1b.plan.md` |
| (no-fm) | skill-framework-2.plan.md | - | - | `01-plan/features/skill-framework-2.plan.md` |
| (no-fm) | skill-framework-3.plan.md | - | - | `01-plan/features/skill-framework-3.plan.md` |
| (no-fm) | skill-framework-plugin.plan.md | - | - | `01-plan/features/skill-framework-plugin.plan.md` |
| (no-fm) | skill-framework.plan.md | - | - | `01-plan/features/skill-framework.plan.md` |
| (no-fm) | sprint-214b.plan.md | - | - | `01-plan/features/sprint-214b.plan.md` |
| (no-fm) | sprint-216.plan.md | - | - | `01-plan/features/sprint-216.plan.md` |
| (no-fm) | svc-ingestion Java/Spring AST 파서 + Source-First Reconciliation 엔진 | - | In-Progress | `01-plan/features/sprint-212.plan.md` |
| AIF-PLAN-001 | Phase 2 Pilot 실문서 파일럿 | "1.0" | Active | `01-plan/features/phase-2-pilot.plan.md` |
| AIF-PLAN-002 | Pipeline Hardening | "1.0" | Active | `01-plan/features/pipeline-hardening.plan.md` |
| AIF-PLAN-003 | Phase 3 MCP/OpenAPI 검증 | "1.0" | Active | `01-plan/features/phase-3-mcp-openapi.plan.md` |
| AIF-PLAN-004 | Phase 3 Sprint 3 MCP Server | "1.0" | Active | `01-plan/features/phase-3-sprint-3-mcp-server.plan.md` |
| AIF-PLAN-005 | Phase 4 Sprint 1 문서 스케일업 | "1.0" | Active | `01-plan/features/phase-4-sprint-1.plan.md` |
| AIF-PLAN-006 | 퇴직연금 일괄 분석 | "1.0" | Active | `01-plan/features/retirement-pension-batch-analysis.plan.md` |
| AIF-PLAN-008 | v0.7.4 Pivot Plan | "1.0" | Active | `01-plan/features/v074-pivot.plan.md` |
| AIF-PLAN-009 | LPON 온누리상품권 온보딩 | "1.0" | Active | `01-plan/features/lpon-onboarding.plan.md` |
| AIF-PLAN-017 | FactCheck API 커버리지 개선 로드맵 | "1.0" | Active | `01-plan/features/factcheck-coverage-roadmap.plan.md` |
| AIF-PLAN-020 | Working Mock-up 사이트 — Skill 결과물 기반 핵심 엔진 동작 검증 | "1.0" | Draft | `01-plan/features/working-mockup.plan.md` |
| AIF-PLAN-020 | 계정/인프라 이전 계획서 | "1.0" | Active | `03-plan/AIF-PLAN-020_account-migration.md` |
| AIF-PLAN-021 | Recon-X API Gateway (packages/api) | "1.0" | Draft | `01-plan/features/api-gateway.plan.md` |
| AIF-PLAN-022 | Pipeline Quality Evaluation System | "1.0" | Draft | `01-plan/features/pipeline-quality-evaluation.plan.md` |
| AIF-PLAN-024 | Generative UI Framework | "1.0" | Draft | `01-plan/features/generative-ui-framework.plan.md` |
| AIF-PLAN-025 | Skill 번들링 — LLM 의미 분류 기반 재패키징 | "1.0" | Draft | `01-plan/features/skill-bundling.plan.md` |
| AIF-PLAN-026 | Foundry-X 통합 — 제품군 통합 로드맵 | "1.0" | Draft | `01-plan/features/foundry-x-integration.plan.md` |
| AIF-PLAN-026B | Foundry-X MCP 통합 Phase 1-2 — 다중 Skill 등록 + R2 수정 | "1.0" | Active | `01-plan/features/req-026-phase-1-2.plan.md` |
| AIF-PLAN-026C | Foundry-X TaskType 확장 Phase 1-3 — policy-evaluation, skill-query, ontology-lookup | "1.0" | Active | `01-plan/features/req-026-phase-1-3.plan.md` |
| AIF-PLAN-026D | 반제품 생성 엔진 — Working Prototype Generator (Phase 2) | "1.0" | Active | `01-plan/features/req-026-phase-2.plan.md` |
| AIF-PLAN-026E | 반제품 생성 엔진 Sprint 2 — LLM 생성기 5종 추가 | "1.0" | Active | `01-plan/features/req-026-phase-2-sprint-2.plan.md` |
| AIF-PLAN-027 | 반제품 스펙 포맷 정의 및 파일럿 생성 | "1.0" | Active | `01-plan/features/halfproduct-spec.plan.md` |
| AIF-PLAN-027 | 반제품 스펙 포맷 정의 및 파일럿 생성 | "1.0" | Active | `01-plan/features/req-027-semi-finished-spec.plan.md` |
| AIF-PLAN-028 | 반제품 스펙 PoC 전체 과정 보고서 — Production 게시 | "1.0" | Active | `01-plan/features/req-028-poc-report-page.plan.md` |
| AIF-PLAN-201 | Sprint 201 — Working Prototype Generator 검증 + Foundry-X 핸드오프 포맷 | "1.0" | Active | `01-plan/features/sprint-201.plan.md` |

## DSGN (39)

| 코드 | 제목 | 버전 | 상태 | 파일 |
|------|------|:----:|:----:|------|
| (no-fm) | AI-Ready 6기준 일괄 채점기 + PoC 리포트 | - | Draft | `02-design/features/sprint-210.design.md` |
| (no-fm) | Design — Sprint 214a: lpon-budget + lpon-purchase spec-container | - | In-Progress | `02-design/features/sprint-214a.design.md` |
| (no-fm) | Org 단위 B/T/Q 종합 Spec + UI | - | Draft | `02-design/features/sprint-209.design.md` |
| (no-fm) | Sprint 2 Design — R2 LLM 예산 + T2 Shadow Mode + Empty Slot Fill 첫 3건 | - | Confirmed | `02-design/features/sprint-2.design.md` |
| (no-fm) | Sprint 206 Design — Technical 4축 스키마 + 프롬프트 | - | - | `02-design/features/sprint-206.design.md` |
| (no-fm) | Sprint 211 Design — FX-SPEC-003 Handoff Contract | - | In-Progress | `02-design/features/sprint-211.design.md` |
| (no-fm) | Sprint 213 — ERWin SQL DDL 파서 설계 | - | In-Progress | `02-design/features/sprint-213.design.md` |
| (no-fm) | Sprint 3 Design — T3 결정적 생성 PoC 2종 + 재평가 Gate + ES-CHARGE-004/005/008 Fill | - | Confirmed | `02-design/features/sprint-3.design.md` |
| (no-fm) | Sprint 4 Design — B/T/Q Spec Schema 완결성 + T3 Self-Consistency Voting PoC | - | Draft | `02-design/features/sprint-4.design.md` |
| (no-fm) | Track A Fill — 선물 + 정산 (Design) | - | In-Progress | `02-design/features/sprint-214c.design.md` |
| (no-fm) | deliverable-export-ui.design.md | - | - | `02-design/features/deliverable-export-ui.design.md` |
| (no-fm) | lpon-deliverable-validation.design.md | - | - | `02-design/features/lpon-deliverable-validation.design.md` |
| (no-fm) | recon-x-restructuring.design.md | - | - | `02-design/features/recon-x-restructuring.design.md` |
| (no-fm) | skill-framework-1b.design.md | - | - | `02-design/features/skill-framework-1b.design.md` |
| (no-fm) | skill-framework-2.design.md | - | - | `02-design/features/skill-framework-2.design.md` |
| (no-fm) | skill-framework-3.design.md | - | - | `02-design/features/skill-framework-3.design.md` |
| (no-fm) | skill-framework-plugin.design.md | - | - | `02-design/features/skill-framework-plugin.design.md` |
| (no-fm) | skill-framework.design.md | - | - | `02-design/features/skill-framework.design.md` |
| (no-fm) | sprint-214b.design.md | - | - | `02-design/features/sprint-214b.design.md` |
| (no-fm) | sprint-216.design.md | - | - | `02-design/features/sprint-216.design.md` |
| (no-fm) | sprint-5.design.md | - | - | `02-design/features/sprint-5.design.md` |
| (no-fm) | svc-ingestion Java/Spring AST 파서 + Source-First Reconciliation 엔진 | - | In-Progress | `02-design/features/sprint-212.design.md` |
| AIF-DESIGN-201 | Sprint 201 Design — README 갱신 + Handoff Format 검증 | "1.0" | Active | `02-design/features/sprint-201.design.md` |
| AIF-DSGN-001 | Phase 2 Pilot Design | "1.0" | Active | `02-design/features/phase-2-pilot.design.md` |
| AIF-DSGN-002 | Pipeline Hardening Design | "1.0" | Active | `02-design/features/pipeline-hardening.design.md` |
| AIF-DSGN-003 | Phase 3 MCP/OpenAPI Design | "1.0" | Active | `02-design/features/phase-3-mcp-openapi.design.md` |
| AIF-DSGN-004 | v0.7.4 Phase 2-A Source Code Parsing | "1.0" | Active | `02-design/features/v074-pivot-phase2a.design.md` |
| AIF-DSGN-005 | v0.7.4 Phase 2-B Fact Check Engine | "1.0" | Active | `02-design/features/v074-pivot-phase2b.design.md` |
| AIF-DSGN-006 | v0.7.4 Phase 2-C Spec Export & KPI | "1.0" | Active | `02-design/features/v074-pivot-phase2c.design.md` |
| AIF-DSGN-020 | Working Mock-up 사이트 — 컴포넌트 설계 + API 인터페이스 상세 | "1.0" | Draft | `02-design/features/working-mockup.design.md` |
| AIF-DSGN-021 | Recon-X API Gateway 상세 설계 | "1.0" | Draft | `02-design/features/api-gateway.design.md` |
| AIF-DSGN-022 | Pipeline Quality Evaluation System — Design Document | "1.0" | Draft | `02-design/features/pipeline-quality-evaluation.design.md` |
| AIF-DSGN-024 | Generative UI Framework — Design Document | "1.0" | Draft | `02-design/features/generative-ui-framework.design.md` |
| AIF-DSGN-025 | Skill 번들링 — LLM 의미 분류 기반 재패키징 | "1.0" | Draft | `02-design/features/skill-bundling.design.md` |
| AIF-DSGN-026B | Foundry-X MCP 통합 Phase 1-2 — 상세 설계 | "1.0" | Active | `02-design/features/req-026-phase-1-2.design.md` |
| AIF-DSGN-026C | Foundry-X TaskType 확장 Phase 1-3 — 상세 설계 | "1.0" | Active | `02-design/features/req-026-phase-1-3.design.md` |
| AIF-DSGN-026D | 반제품 생성 엔진 — Working Prototype Generator Design | "1.0" | Active | `02-design/features/req-026-phase-2.design.md` |
| AIF-DSGN-026E | 반제품 생성 엔진 Sprint 2 — LLM 생성기 5종 설계 | "1.0" | Active | `02-design/features/req-026-phase-2-sprint-2.design.md` |
| AIF-DSGN-027 | 반제품 스펙 포맷 정의 및 파일럿 생성 — 설계 | "1.0" | Active | `02-design/features/req-027-semi-finished-spec.design.md` |

## ANLS (39)

| 코드 | 제목 | 버전 | 상태 | 파일 |
|------|------|:----:|:----:|------|
| (no-fm) | AIF-ANLS-016_deliverable-export-ui.md | - | - | `03-analysis/AIF-ANLS-016_deliverable-export-ui.md` |
| (no-fm) | AIF-ANLS-019_lpon-deliverable-validation.md | - | - | `03-analysis/AIF-ANLS-019_lpon-deliverable-validation.md` |
| (no-fm) | recon-x-restructuring.analysis.md | - | - | `03-analysis/features/recon-x-restructuring.analysis.md` |
| (no-fm) | report-ux-improvement.analysis.md | - | - | `03-analysis/features/report-ux-improvement.analysis.md` |
| (no-fm) | skill-framework-1b.analysis.md | - | - | `03-analysis/features/skill-framework-1b.analysis.md` |
| (no-fm) | skill-framework-2.analysis.md | - | - | `03-analysis/features/skill-framework-2.analysis.md` |
| (no-fm) | skill-framework-3.analysis.md | - | - | `03-analysis/features/skill-framework-3.analysis.md` |
| (no-fm) | skill-framework.analysis.md | - | - | `03-analysis/features/skill-framework.analysis.md` |
| (no-fm) | sprint-214b-report.md | - | - | `03-analysis/features/sprint-214b-report.md` |
| AIF-ANLS-001 | Full Project Gap Analysis | "1.0" | Active | `03-analysis/AIF-ANLS-001_full-project.md` |
| AIF-ANLS-002 | Phase 2 Pilot Analysis | "1.0" | Active | `03-analysis/features/phase-2-pilot.analysis.md` |
| AIF-ANLS-003 | Pipeline Hardening Analysis | "1.0" | Active | `03-analysis/AIF-ANLS-003_pipeline-hardening.md` |
| AIF-ANLS-004 | Phase 2-E 프로세스 정밀분석 Gap Analysis | "1.0" | Active | `03-analysis/features/process-diagnosis.analysis.md` |
| AIF-ANLS-005 | 퇴직연금 실문서 구조 분석 | "1.0" | Active | `03-analysis/AIF-ANLS-005_retirement-pension-doc.md` |
| AIF-ANLS-006 | Architecture Gap Analysis | "1.0" | Active | `03-analysis/AIF-ANLS-006_architecture-gap.md` |
| AIF-ANLS-007 | Phase 4 Sprint 1 Analysis | "1.0" | Active | `03-analysis/AIF-ANLS-007_phase-4-sprint-1.md` |
| AIF-ANLS-008 | Comprehensive Gap Analysis | "1.0" | Active | `03-analysis/AIF-ANLS-008_comprehensive-gap.md` |
| AIF-ANLS-009 | v0.7.4 Phase 2-A Gap Analysis | "1.0" | Active | `03-analysis/AIF-ANLS-009_v074-pivot.md` |
| AIF-ANLS-010 | v0.7.4 Phase 2-B Session 3 Gap Analysis | "1.0" | Active | `03-analysis/AIF-ANLS-010_v074-pivot-phase2b-session3.md` |
| AIF-ANLS-011 | v0.7.4 Phase 2-B Final Gap Analysis | "1.0" | Active | `03-analysis/AIF-ANLS-011_v074-pivot-phase2b-final.md` |
| AIF-ANLS-012 | Benchmark Feature Gap Analysis | "1.0" | Active | `03-analysis/AIF-ANLS-015_benchmark.md` |
| AIF-ANLS-012 | v0.7.4 Phase 2-C/2-D Gap Analysis | "1.0" | Active | `03-analysis/AIF-ANLS-012_v074-pivot-phase2cd.md` |
| AIF-ANLS-013 | v0.7.4 Phase 2-E Full Gap Analysis | "1.0" | Active | `03-analysis/AIF-ANLS-013_v074-pivot-phase2e-full.md` |
| AIF-ANLS-014 | v0.7.4 PRD vs Implementation Gap Analysis v2.0 | "1.0" | Active | `03-analysis/AIF-ANLS-014_v074-pivot-prd-impl-gap.md` |
| AIF-ANLS-018 | LPON 미문서화 외부 API 보완 제안서 | "1.0" | Active | `03-analysis/AIF-ANLS-018_undocumented-api-remediation.md` |
| AIF-ANLS-018-P1 | LPON 미문서화 P1 API 인터페이스 명세 | "1.0" | Active | `03-analysis/AIF-ANLS-018_interface-spec-p1.md` |
| AIF-ANLS-018-P2 | LPON 미문서화 P2/P3 API 인터페이스 명세 | "1.0" | Active | `03-analysis/AIF-ANLS-018_interface-spec-p2.md` |
| AIF-ANLS-022 | Pipeline Quality Evaluation System — Gap Analysis | "1.0" | Active | `03-analysis/AIF-ANLS-021_pipeline-quality-evaluation.md` |
| AIF-ANLS-024 | Generative UI Framework — Gap Analysis | "1.0" | Active | `03-analysis/AIF-ANLS-020_generative-ui-framework.md` |
| AIF-ANLS-025 | Skill 번들링 — Gap Analysis | "1.0" | Active | `03-analysis/AIF-ANLS-022_skill-bundling.md` |
| AIF-ANLS-026 | Foundry-X 통합 비교 분석서 | 1.0 | Draft | `03-analysis/AIF-ANLS-026_foundry-x-integration-analysis.md` |
| AIF-ANLS-026B | Foundry-X MCP 통합 Phase 1-2 — Gap Analysis | "1.0" | Active | `03-analysis/features/req-026-phase-1-2.analysis.md` |
| AIF-ANLS-026C | Foundry-X TaskType 확장 Phase 1-3 — Gap 분석 | "1.0" | Active | `03-analysis/features/req-026-phase-1-3.analysis.md` |
| AIF-ANLS-026D | 반제품 생성 엔진 Phase 2 — Gap Analysis | "1.1" | Active | `03-analysis/features/req-026-phase-2.analysis.md` |
| AIF-ANLS-027 | E2E Test Audit Report | 1.0 | Active | `03-analysis/AIF-ANLS-027_e2e-audit-20260407.md` |
| AIF-ANLS-028 | API Gateway Gap Analysis (v2 — 테스트 추가 후 재분석) | "2.0" | Active | `03-analysis/AIF-ANLS-028_api-gateway.md` |
| AIF-ANLS-029 | Gap Analysis — Sprint 209~210 | "1.0" | Active | `03-analysis/AIF-ANLS-029_sprint-209-210.md` |
| AIF-ANLY-phase-2-batch2 | Phase 2 Batch 2 (Sprint 212 + 213) 통합 Gap Analysis + E2E Audit | 1.0 | Active | `03-analysis/features/phase-2-batch2-pipeline.analysis.md` |
| AIF-ANLY-phase-2-pipeline | Phase 2 본 개발 종합 통합 Gap Analysis (Sprint 211~216) | 1.0 | Active | `03-analysis/features/phase-2-pipeline.analysis.md` |

## RPRT (33)

| 코드 | 제목 | 버전 | 상태 | 파일 |
|------|------|:----:|:----:|------|
| (no-fm) | AIF-RPRT-011_lpon-analysis-report.md | - | - | `04-report/AIF-RPRT-011_lpon-analysis-report.md` |
| (no-fm) | AIF-RPRT-012_miraeasset-analysis-report.md | - | - | `04-report/AIF-RPRT-012_miraeasset-analysis-report.md` |
| (no-fm) | Sprint 211 완료 보고 — FX-SPEC-003 Handoff Contract 신규 발행 | - | Done | `04-report/AIF-RPRT-015_sprint-211.md` |
| (no-fm) | lpon-deliverable-validation.report.md | - | - | `04-report/features/lpon-deliverable-validation.report.md` |
| (no-fm) | report-ux-improvement.report.md | - | - | `04-report/features/report-ux-improvement.report.md` |
| (no-fm) | skill-framework-1b.report.md | - | - | `04-report/features/skill-framework-1b.report.md` |
| (no-fm) | skill-framework-2.report.md | - | - | `04-report/features/skill-framework-2.report.md` |
| (no-fm) | skill-framework-3.report.md | - | - | `04-report/features/skill-framework-3.report.md` |
| (no-fm) | skill-framework.report.md | - | - | `04-report/features/skill-framework.report.md` |
| AIF-RPRT-001 | Phase 2 Pilot 완료 보고서 | "1.0" | Active | `04-report/features/phase-2-pilot.report.md` |
| AIF-RPRT-002 | Pipeline Hardening 완료 보고서 | "1.0" | Active | `04-report/AIF-RPRT-002_pipeline-hardening.md` |
| AIF-RPRT-003 | Phase 4 Sprint 1 완료 보고서 | "1.0" | Active | `04-report/features/phase-4-sprint-1.report.md` |
| AIF-RPRT-004 | Architecture Quality Hardening 보고서 | "1.0" | Active | `04-report/features/architecture-quality-hardening.report.md` |
| AIF-RPRT-005 | AI Chat Agent Tool Use 전환 보고서 | "1.0" | Active | `04-report/features/chat-agent-tool-use.report.md` |
| AIF-RPRT-006 | User Onboarding System 보고서 | "1.0" | Active | `04-report/features/user-onboarding.report.md` |
| AIF-RPRT-007 | v0.7.4 데모 시나리오 | "1.0" | Active | `04-report/features/v074-demo-scenario.md` |
| AIF-RPRT-008 | Process-Diagnosis Executive Summary | "1.0" | Active | `04-report/AIF-RPRT-008_executive-summary.md` |
| AIF-RPRT-008 | Production UI/UX 전체 점검 리포트 | "1.0" | Active | `04-report/features/production-ui-test.report.md` |
| AIF-RPRT-012 | Benchmark Report Page Completion Report | "1.0" | Active | `04-report/features/benchmark.report.md` |
| AIF-RPRT-013 | AI-Ready 6기준 일괄 채점기 + PoC 리포트 | "1.0" | Active | `04-report/AIF-RPRT-013_sprint-210.md` |
| AIF-RPRT-014 | Sprint 206 Report — Technical 4축 스키마 + 프롬프트 강화 | "1.0" | Active | `04-report/AIF-RPRT-014_sprint-206.md` |
| AIF-RPRT-020 | Working Mock-up 사이트 — PDCA 완료 보고서 | "1.0" | Active | `04-report/features/working-mockup.report.md` |
| AIF-RPRT-021 | Recon-X API Gateway PDCA 완료 보고서 | "1.0" | Active | `04-report/features/api-gateway.report.md` |
| AIF-RPRT-022 | Pipeline Quality Evaluation System — Completion Report | "1.0" | Active | `04-report/features/pipeline-quality-evaluation.report.md` |
| AIF-RPRT-024 | Generative UI Framework — Phase 1 Completion Report | "1.0" | Active | `04-report/features/generative-ui-framework.report.md` |
| AIF-RPRT-025 | Skill 번들링 — PDCA 완료 보고서 | "1.0" | Active | `04-report/features/skill-bundling.report.md` |
| AIF-RPRT-026B | Foundry-X MCP 통합 Phase 1-2 — 완료 보고서 | "1.0" | Active | `04-report/features/req-026-phase-1-2.report.md` |
| AIF-RPRT-026C | Foundry-X TaskType 확장 Phase 1-3 — 완료 보고서 | "1.0" | Active | `04-report/features/req-026-phase-1-3.report.md` |
| AIF-RPRT-026D | 반제품 생성 엔진 Phase 2 — PDCA 완료 보고서 | "1.0" | Active | `04-report/features/req-026-phase-2.report.md` |
| AIF-RPRT-026E | 반제품 생성 엔진 Sprint 2 — LLM 생성기 5종 완료 보고서 | "1.0" | Active | `04-report/features/req-026-phase-2-sprint-2.report.md` |
| AIF-RPRT-027 | 반제품 스펙 포맷 정의 및 파일럿 생성 — 완료 보고서 | "1.1" | Active | `04-report/features/req-027-semi-finished-spec.report.md` |
| AIF-RPRT-028 | Foundry-X MCP 통합 Phase 1-1 PoC 완료 보고서 | 1.0 | Active | `04-report/features/mcp-verification.report.md` |
| AIF-RPRT-201 | Sprint 201 Report — Working Prototype Generator 검증 완료 | "1.0" | Done | `AX-BD-RPRT-201.md` |

## RPRT(typo:03-report) (2)

| 코드 | 제목 | 버전 | 상태 | 파일 |
|------|------|:----:|:----:|------|
| (no-fm) | sprint-216.report.md | - | - | `03-report/sprints/sprint-216.report.md` |
| (no-fm) | svc-ingestion Java/Spring AST 파서 + Source-First Reconciliation 엔진 | - | Done | `03-report/sprint-212.report.md` |

## RPRT(typo:06-report) (1)

| 코드 | 제목 | 버전 | 상태 | 파일 |
|------|------|:----:|:----:|------|
| (no-fm) | Org 단위 B/T/Q 종합 Spec + UI | - | Done | `06-report/features/sprint-209.report.md` |

## GUID (1)

| 코드 | 제목 | 버전 | 상태 | 파일 |
|------|------|:----:|:----:|------|
| AIF-GUID-001 | Claude Desktop MCP 연동 테스트 가이드 | "1.0" | Active | `mcp-desktop-test-guide.md` |

## CONTRACTS (3)

| 코드 | 제목 | 버전 | 상태 | 파일 |
|------|------|:----:|:----:|------|
| (no-fm) | foundry-x-mou.v0.1-draft.md | - | - | `contracts/foundry-x-mou.v0.1-draft.md` |
| (no-fm) | foundry-x-mou.v0.2-draft.md | - | - | `contracts/foundry-x-mou.v0.2-draft.md` |
| FX-SPEC-003 | FX-SPEC-003 Decode-X Handoff Contract — Decode-X 미러 | 1.0 | Signed | `mou/FX-SPEC-003.md` |

## PoC (23)

| 코드 | 제목 | 버전 | 상태 | 파일 |
|------|------|:----:|:----:|------|
| (no-fm) | Fill Seed — ES-CHARGE-001 (충전 멱등성) | - | - | `poc/sprint-1-fill-seed-01.md` |
| (no-fm) | Input Completeness Score (S_input) — 충전 서비스 | - | - | `poc/sprint-1-input-completeness.md` |
| (no-fm) | Plumb E2E 대상 Skill 선정 | - | - | `poc/sprint-1-selected-skill.md` |
| (no-fm) | Plumb First Run 결과 | - | - | `poc/sprint-1-plumb-first-run.md` |
| (no-fm) | T3 결정적 생성 PoC — Self-Consistency Voting (3번째 기법) | - | Done | `poc/sprint-4-t3-self-consistency-poc.md` |
| (no-fm) | ai-ready-criteria-design.md | - | - | `poc/ai-ready-criteria-design.md` |
| (no-fm) | ai-ready-score-lpon.md | - | - | `poc/ai-ready-score-lpon.md` |
| (no-fm) | handoff-package-format.md | - | - | `poc/handoff-package-format.md` |
| (no-fm) | report-2026-04-17.md | - | - | `poc/report-2026-04-17.md` |
| (no-fm) | spec-btq-sample.md | - | - | `poc/spec-btq-sample.md` |
| (no-fm) | sprint-1-exit-check.md | - | - | `poc/sprint-1-exit-check.md` |
| (no-fm) | sprint-1-plan.md | - | - | `poc/sprint-1-plan.md` |
| (no-fm) | sprint-2-exit-check.md | - | - | `poc/sprint-2-exit-check.md` |
| (no-fm) | sprint-2-llm-budget-schema.md | - | - | `poc/sprint-2-llm-budget-schema.md` |
| (no-fm) | sprint-2-shadow-mode.md | - | - | `poc/sprint-2-shadow-mode.md` |
| (no-fm) | sprint-3-exit-check.md | - | - | `poc/sprint-3-exit-check.md` |
| (no-fm) | sprint-3-t3-deterministic-poc.md | - | - | `poc/sprint-3-t3-deterministic-poc.md` |
| (no-fm) | sprint-4-exit-check.md | - | - | `poc/sprint-4-exit-check.md` |
| (no-fm) | sprint-5-exit-check.md | - | - | `poc/sprint-5-exit-check.md` |
| (no-fm) | tacit-interview-agent-format.md | - | - | `poc/tacit-interview-agent-format.md` |
| (no-fm) | 충전 서비스 Empty Slot Long-list (15~20건) | - | - | `poc/sprint-1-empty-slot-longlist.md` |
| (no-fm) | 충전 서비스 Empty Slot Short-list (≥6건) | - | - | `poc/sprint-1-empty-slot-shortlist.md` |
| (no-fm) | 충전 서비스 범위 확정 + LPON 자산 매핑 | - | - | `poc/sprint-1-charge-service-scope.md` |

## REQ-INTERVIEW (30)

| 코드 | 제목 | 버전 | 상태 | 파일 |
|------|------|:----:|:----:|------|
| (no-fm) | ambiguity-score.md | - | - | `req-interview/decode-x-v1.2/review/round-1/ambiguity-score.md` |
| (no-fm) | apply-diff.md | - | - | `req-interview/decode-x-v1.2/review/round-1/apply-diff.md` |
| (no-fm) | chatgpt-feedback.md | - | - | `req-interview/decode-x-v1.2/review/round-1/chatgpt-feedback.md` |
| (no-fm) | chatgpt-feedback.md | - | - | `req-interview/decode-x-v1.2/review/round-2/chatgpt-feedback.md` |
| (no-fm) | deepseek-feedback.md | - | - | `req-interview/decode-x-v1.2/review/round-1/deepseek-feedback.md` |
| (no-fm) | deepseek-feedback.md | - | - | `req-interview/decode-x-v1.2/review/round-2/deepseek-feedback.md` |
| (no-fm) | feedback.md | - | - | `req-interview/decode-x-v1.2/review/round-1/feedback.md` |
| (no-fm) | feedback.md | - | - | `req-interview/decode-x-v1.2/review/round-2/feedback.md` |
| (no-fm) | gemini-feedback.md | - | - | `req-interview/decode-x-v1.2/review/round-1/gemini-feedback.md` |
| (no-fm) | gemini-feedback.md | - | - | `req-interview/decode-x-v1.2/review/round-2/gemini-feedback.md` |
| (no-fm) | interview-log.md | - | - | `decode-x-restructuring/interview-log.md` |
| (no-fm) | interview-log.md | - | - | `req-interview/decode-x-deep-dive/interview-log.md` |
| (no-fm) | interview-log.md | - | - | `req-interview/decode-x-v1.2/interview-log.md` |
| (no-fm) | interview-log.md | - | - | `req-interview/decode-x-v1.3-phase-2/interview-log.md` |
| (no-fm) | phase-0-closure-report.md | - | - | `req-interview/decode-x-v1.2/phase-0-closure-report.md` |
| (no-fm) | phase-0-kickoff.md | - | - | `req-interview/decode-x-v1.2/phase-0-kickoff.md` |
| (no-fm) | prd-final.md | - | - | `decode-x-restructuring/prd-final.md` |
| (no-fm) | prd-final.md | - | - | `req-interview/decode-x-deep-dive/prd-final.md` |
| (no-fm) | prd-final.md | - | - | `req-interview/decode-x-v1.3-phase-2/prd-final.md` |
| (no-fm) | prd-v1.md | - | - | `req-interview/decode-x-v1.2/prd-v1.md` |
| (no-fm) | prd-v2.md | - | - | `req-interview/decode-x-v1.2/prd-v2.md` |
| (no-fm) | review-history.md | - | - | `decode-x-restructuring/review-history.md` |
| (no-fm) | review-history.md | - | - | `req-interview/decode-x-deep-dive/review-history.md` |
| (no-fm) | review-history.md | - | - | `req-interview/decode-x-v1.2/review-history.md` |
| (no-fm) | review-history.md | - | - | `req-interview/decode-x-v1.3-phase-2/review-history.md` |
| (no-fm) | review-history.md | - | - | `req-interview/decode-x-v1.3-phase-3/review-history.md` |
| (no-fm) | scorecard.md | - | - | `req-interview/decode-x-v1.2/review/round-1/scorecard.md` |
| (no-fm) | scorecard.md | - | - | `req-interview/decode-x-v1.2/review/round-2/scorecard.md` |
| AIF-INTV-decode-x-v1.3-phase-3 | Decode-X v1.3 Phase 3 요구사항 인터뷰 로그 | 1.0 | Active | `req-interview/decode-x-v1.3-phase-3/interview-log.md` |
| AIF-PRD-decode-x-v1.3-phase-3 | Decode-X v1.3 Phase 3 본 개발 PRD | 1.2 | Ready | `req-interview/decode-x-v1.3-phase-3/prd-final.md` |

## RESEARCH (4)

| 코드 | 제목 | 버전 | 상태 | 파일 |
|------|------|:----:|:----:|------|
| (no-fm) | INVENTORY.md | - | - | `retirement-pension-source/INVENTORY.md` |
| (no-fm) | LPON-API갭분석리포트.md | - | - | `LPON 전자식 온누리상품권 플랫폼/LPON-API갭분석리포트.md` |
| (no-fm) | LPON-파싱전략.md | - | - | `LPON 전자식 온누리상품권 플랫폼/LPON-파싱전략.md` |
| FX-RESEARCH-014 | 외부 레포 분석 — open-swe & ClawTeam Foundry-X 적용 검토 | 1.0 | Active | `FX-RESEARCH-014-external-repos.md` |

## ROOT (3)

| 코드 | 제목 | 버전 | 상태 | 파일 |
|------|------|:----:|:----:|------|
| (no-fm) | AI_Foundry_Identity.md | - | - | `AI_Foundry_Identity.md` |
| (no-fm) | AX-BD-MSA-Restructuring-Plan.md | - | - | `AX-BD-MSA-Restructuring-Plan.md` |
| (no-fm) | Decode-X_개발기획서_v1.2.md | - | - | `Decode-X_개발기획서_v1.2.md` |

---

## 자동 인벤토리 통계

- **총 활성 문서**: 227
- **frontmatter 있음**: 136 (59%)
- **frontmatter 없음**: 91 (40%)
- 카테고리별: ANLS 39, CONTRACTS 3, DSGN 39, GUID 1, PLAN 46, PoC 23, REQ-INTERVIEW 30, RESEARCH 4, ROOT 3, RPRT 33, RPRT(typo:03-report) 2, RPRT(typo:06-report) 1, SPEC 3

## Archive

> `docs/archive/2026-03/` — 별도 인덱스 참조

