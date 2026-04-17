---
code: AIF-ANLS-029
title: Gap Analysis — Sprint 209~210
version: "1.0"
status: Active
category: analysis
created: 2026-04-16
updated: 2026-04-16
author: Sinclair Seo
feature: sprint-209-210
phase: check
---

# Gap Analysis — Sprint 209~210 (AIF-REQ-034 E~F)

## Executive Summary

| Sprint | Match Rate | Design Items | Matched | Gaps |
|--------|:---------:|:------------:|:-------:|:----:|
| **209** (Org B/T/Q Spec + UI) | **100%** | 20 | 20 | 0 |
| **210** (AI-Ready 채점기 + PoC) | **95%** | 19 | 18 | 1 real + 6 expected scope |
| **종합** | **97.5%** | 39 | 38 | 1 |

---

## Sprint 209 — Org 단위 B/T/Q 종합 Spec + UI (PR #7)

### Match Rate: 100% (20/20)

모든 Design 항목이 구현 완료. 일부 Design에 없는 추가 구현도 존재.

#### Matched Items (20/20)

| # | Category | Item | Status |
|---|----------|------|:------:|
| 1 | API | `GET /admin/org-spec/:orgId/:type` + `/skills/org/:orgId/spec/:type` 이중 라우팅 | PASS |
| 2 | API | Path params (orgId, type), Query params (format, llm, limit) | PASS |
| 3 | API | Type validation (business/technical/quality/all) | PASS |
| 4 | Response | Single type JSON (organizationId, type, sections, metadata) | PASS |
| 5 | Response | All type JSON (specs array) | PASS |
| 6 | Response | Markdown 출력 (Content-Type, Content-Disposition) | PASS |
| 7 | Types | OrgSpecData, OrgSpecDocument, OrgSpecMetadata 인터페이스 | PASS |
| 8 | Collector | collectOrgSpecData() — D1 쿼리 + R2 배치 로딩(5건) | PASS |
| 9 | Collector | Policy 요약, Technical 집계, Trust 평균, Adapter 카운트 | PASS |
| 10 | Collector | Domain 빈도 계산 + Ontology term SVC_ONTOLOGY 바인딩 | PASS |
| 11 | Generator | generateOrgSpec() + generateAllOrgSpecs() | PASS |
| 12 | Generator | orgToSkillSpecData() 변환 + computeOrgMetadata() | PASS |
| 13 | Renderer | renderOrgSpecToMarkdown() — YAML frontmatter + sections | PASS |
| 14 | Routes | index.ts 라우트 등록 (handleOrgSpec import) | PASS |
| 15 | API Client | fetchOrgSpec(), fetchAllOrgSpecs(), fetchSkillSpec() | PASS |
| 16 | UI | org-spec.tsx — 3탭(B/T/Q), 요약 카드, 섹션 렌더링 | PASS |
| 17 | UI | poc-ai-ready-detail.tsx — Spec 4번째 탭 추가 | PASS |
| 18 | UI | SkillSpecTab — B/T/Q 토글 + Spec 로딩 | PASS |
| 19 | Quality | TypeScript 타입 안전성, 에러 핸들링, 로깅 | PASS |
| 20 | Quality | RBAC 인증 유지, inter-service secret 검증 | PASS |

#### Extra (Design에 없지만 구현됨)

- 이중 URL 라우팅 (`/admin/org-spec/` + `/skills/org/`) — vite proxy 호환
- `orgToSkillSpecData()` 변환 함수 — 기존 generator 재사용
- `computeOrgMetadata()` 헬퍼 — 일관된 aiReadyScore 계산

#### Gaps: 없음

---

## Sprint 210 — AI-Ready 채점기 + PoC 리포트 (PR #8)

### Match Rate: 95% (18/19)

핵심 기능 전량 구현. 1건 minor gap (링크 경로), 6건 expected scope gap (PoC 범위 외).

#### Matched Items (18/19)

| # | Category | Item | Status |
|---|----------|------|:------:|
| 1 | Scoring | Completeness.technical 가중치 보정 (apiHit 0.40, dataFieldHit 0.40, adapterHit 0.20) | PASS |
| 2 | Scoring | Completeness.quality trustScore 완화 (trust.level fallback) | PASS |
| 3 | Scoring | Testable 최소 길이 20→10자 | PASS |
| 4 | Scoring | Completeness threshold 0.67→0.50 | PASS |
| 5 | Scoring | 6개 채점 함수 전수 (machine-readable~human-reviewable) | PASS |
| 6 | Types | AI_READY_THRESHOLDS.completeness 0.50 갱신 | PASS |
| 7 | UI | KPI hero cards 4개 (통과율, Overall, Business, Technical) | PASS |
| 8 | UI | Deep Dive Must-Have 체크리스트 3항목 | PASS |
| 9 | UI | Before/After 비교 시뮬레이션 (Adapter + Technical) | PASS |
| 10 | UI | 6기준 Bar Chart 시각화 | PASS |
| 11 | UI | B/T/Q 차원 분해 표시 | PASS |
| 12 | UI | Top Failures 랭킹 테이블 | PASS |
| 13 | UI | Sample 상세 테이블 (Top/Bottom 10) | PASS |
| 14 | UI | Calibration 보정 사유 노트 | PASS |
| 15 | UI | Phase 1/2 로드맵 섹션 | PASS |
| 16 | Spec | Tacit Interview Agent 포맷 명세 (205줄) | PASS |
| 17 | Spec | Handoff Package 포맷 명세 (273줄) | PASS |
| 18 | UI | Footer (엔드포인트, 채점 로직 경로, 문서 참조) | PASS |

#### Gap (1건 real)

| # | Item | Severity | Detail |
|---|------|:--------:|--------|
| 1 | Deep Dive 링크 `/docs/poc/...` 경로 | LOW | 웹앱 라우팅에서 정적 파일 접근 불가 가능성. PoC 수준에서는 허용 |

#### Expected Scope Gaps (6건 — Design에서 "정식 단계 구현" 명시)

| # | Item | Status |
|---|------|--------|
| 1 | Tacit Interview Agent 실행 엔진 | 포맷 명세만 (정식 단계 이관) |
| 2 | Handoff Package 생성 API | 포맷 명세만 (정식 단계 이관) |
| 3 | Interview PII 마스킹 구현 | 스펙만 (정식 단계 이관) |
| 4 | D1 스토리지 통합 | 스펙만 (정식 단계 이관) |
| 5 | SKU fragment 추출 워크플로우 | 스펙만 (정식 단계 이관) |
| 6 | HITL 리뷰 워크플로우 | 스펙만 (정식 단계 이관) |

#### Extra (Design에 없지만 구현됨)

- 기준별 평균 점수 상세 (criterion avg score)
- Before/After 동적 재계산 (단순 계수가 아닌 실제 재채점)
- Top/Bottom 10 개별 skill 상세 테이블

---

## 종합 평가

### 품질 지표

| 지표 | Sprint 209 | Sprint 210 | 종합 |
|------|:----------:|:----------:|:----:|
| Match Rate | 100% | 95% | 97.5% |
| 변경량 | +1,111줄, 15파일 | +953줄, 9파일 | +2,064줄, 24파일 |
| PR | #7 | #8 | — |
| Extra 구현 | 3건 | 3건 | 6건 |
| Risk Level | LOW | LOW | LOW |

### 강점

- **패턴 재사용**: collector.ts, spec-gen 구조를 Sprint 208에서 확장
- **타입 안전성**: 전 구간 TypeScript strict 준수
- **에러 핸들링**: R2 미존재, Ontology fetch 실패 등 graceful fallback
- **설계 초과 구현**: vite proxy 호환 이중 라우팅, 동적 Before/After 재계산

### 보완 사항

- org-spec 캐싱 미구현 (매 요청 재생성) — 트래픽 증가 시 고려
- Deep Dive 링크 경로 검증 필요 (웹앱 정적 파일 서빙)
- Sprint 210 Tacit/Handoff는 포맷 명세만 — 정식 구현은 REQ-034 후속

---

_Generated: 2026-04-16 | Analyzer: gap-detector (parallel)_
