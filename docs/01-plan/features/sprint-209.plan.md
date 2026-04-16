---
sprint: 209
requirement: AIF-REQ-034 E
title: Org 단위 B/T/Q 종합 Spec + UI
status: draft
created: 2026-04-16
---

# Sprint 209 Plan — Org 단위 B/T/Q 종합 Spec + UI

## 1) 목표

Org(조직) 전체 skills를 집계하여 B/T/Q 종합 Spec 문서를 생성하는 API를 만들고,
UI에서 org-spec 전용 페이지와 drill-down 페이지의 Spec 탭을 추가한다.

## 2) 범위

### Backend (svc-skill)
- **org-collector.ts**: Org 내 모든 skills를 D1에서 조회 → R2에서 SkillPackage 로드 → 집계 데이터 구성
- **org-spec 라우트**: `GET /admin/org-spec/:orgId/:type` (type = business|technical|quality|all)
  - format=json|markdown, llm=true|false 쿼리 파라미터
- **spec-gen/index.ts 확장**: `generateOrgSpec()` / `generateAllOrgSpecs()` 함수 추가
- **types.ts 확장**: `OrgSpecData`, `OrgSpecDocument` 타입 추가

### Frontend (app-web)
- **org-spec 전용 페이지**: `/org-spec` — Org 종합 Spec 조회 (B/T/Q 탭)
- **drill-down Spec 탭**: `poc-ai-ready-detail.tsx`에 "Spec" 탭 추가 (개별 skill spec 조회)
- **API client**: `api/org-spec.ts` — org-spec API 호출
- **라우팅 + Sidebar**: app.tsx, Sidebar.tsx에 org-spec 페이지 등록

## 3) 제외 범위
- LLM 보강은 기존 OpenRouter 로직 재사용 (새로운 LLM 연동 없음)
- 기존 spec-gen 모듈의 개별 Skill Spec 로직 변경 없음
- org-spec 결과 캐싱 (향후 Sprint)

## 4) 의존성
- Sprint 208에서 구현된 spec-gen 모듈 (collector.ts, generators/, llm-enhancer.ts)
- 기존 svc-skill D1 스키마 (skills 테이블, organization_id 컬럼)

## 5) KPI
- LPON org 종합 B/T/Q Spec 생성 확인
- UI에서 org-spec 페이지 + drill-down Spec 탭 동작 확인
- typecheck + lint PASS

## 6) 리스크
- Org에 skills가 수백 건이면 R2 조회 시간이 길어질 수 있음 → batch 처리 + 최대 50건 제한
