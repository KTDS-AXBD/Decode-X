---
code: AIF-PLAN-deliverable-export-ui-plan
title: "SI 산출물 Export UI Planning Document"
version: 1.0
status: active
category: plan
created: 2026-03-10
updated: 2026-03-10
author: Sinclair Seo
---

# SI 산출물 Export UI Planning Document

> **Summary**: AIF-REQ-017 확장 — 기존 Export Center 페이지에 "SI 산출물" 탭을 추가하여 5종 마크다운 산출물(D1~D5)을 미리보기·다운로드할 수 있는 UI를 제공한다.

---

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem** | SI 산출물 Export API(`/deliverables/export/*`)가 구현되어 있으나 프론트엔드 UI가 없어 API 직접 호출(curl)로만 접근 가능. 비개발자(Analyst, Reviewer, Executive)가 사용할 수 없음 |
| **Solution** | 기존 Export Center(`/export`) 페이지에 "SI 산출물" 탭을 추가. 조직 선택 → 5종 산출물 목록 → 개별/일괄 다운로드 + 마크다운 미리보기 패널 제공 |
| **Function/UX Effect** | 탭 클릭 → 산출물 선택 → 미리보기 패널에서 실시간 렌더링 확인 → 다운로드 버튼으로 .md 파일 즉시 저장. 비개발 페르소나도 SI 산출물에 접근 가능 |
| **Core Value** | AI 역공학 결과물을 현장에서 바로 확인·공유할 수 있게 함으로써, 3-Tier 인터뷰 기반 평가·조정 워크플로우의 실질적 진입점 완성 |

---

## 1. Background

### 1.1 현재 상황

- **AIF-REQ-017 DONE**: svc-analytics에 `/deliverables/export/*` 6종 API 구현 완료 (세션 159)
- 5종 마크다운 렌더러 + data-collector + 20개 테스트 전량 PASS
- **UI 미구현**: Plan 문서에서 "프로덕션 UI 개발"을 명시적으로 Out of Scope 처리
- 현재 접근법: `curl` 또는 Pages Function 경유 직접 호출만 가능

### 1.2 문제

- 비개발자(Analyst, Reviewer, Executive) 페르소나가 산출물에 접근 불가
- 3-Tier 인터뷰(현업/SI/내부) 검증 시 산출물을 별도로 공유해야 하는 불편
- 기존 Export Center(`/export`)에 Spec Package만 있어 SI 산출물과의 연결 부재

### 1.3 관련 요구사항

- [[AIF-REQ-017]] SI 산출물 Export API — DONE (이번 작업은 UI 확장)
- [[AIF-REQ-010]] SI 산출물 재구성 + Gap 분석 — DONE (데이터 기반)

---

## 2. Scope

### 2.1 In Scope

- Export Center 페이지에 Tabs UI 적용 (Spec Package / SI 산출물)
- SI 산출물 탭: 5종 산출물 카드 목록 + 개별 다운로드 + 전체 다운로드
- 마크다운 미리보기 패널: 산출물 선택 시 렌더링된 마크다운 표시
- MarkdownContent 컴포넌트 테이블 렌더링 지원 확장
- Pages Function API 프록시에 `deliverables` 라우트 추가
- Vite dev proxy에 `deliverables` 라우트 추가

### 2.2 Out of Scope

- 산출물 편집 기능 (읽기 전용)
- 산출물 PDF/DOCX 변환 (마크다운 다운로드만)
- 신규 API 엔드포인트 (기존 `/deliverables/export/*` 활용)
- 산출물 버전 관리 (매 호출 시 실시간 생성)
- RBAC 변경 (기존 analytics 권한 활용)

---

## 3. Technical Approach

### 3.1 아키텍처 개요

```
Export Center (/export)
├── [Spec Package 탭]  ← 기존 코드 그대로
└── [SI 산출물 탭]     ← 신규
    ├── 산출물 카드 목록 (좌측)
    │   ├── D1 인터페이스 설계서    [미리보기] [⬇]
    │   ├── D2 업무규칙 정의서      [미리보기] [⬇]
    │   ├── D3 용어사전             [미리보기] [⬇]
    │   ├── D4 Gap 분석 보고서      [미리보기] [⬇]
    │   ├── D5 As-Is/To-Be 비교표   [미리보기] [⬇]
    │   └── [📦 전체 다운로드 (D1~D5)]
    └── 미리보기 패널 (우측)
        └── MarkdownContent 렌더링
```

### 3.2 데이터 흐름

```
사용자 클릭 "미리보기"
  → fetch /api/deliverables/export/{type}?organizationId={org}
  → Pages Function proxy → svc-analytics → 마크다운 텍스트 반환
  → 미리보기 패널에 MarkdownContent로 렌더링

사용자 클릭 "다운로드"
  → 동일 fetch → Blob 변환 → triggerBlobDownload()
```

### 3.3 주요 결정사항

| ID | 결정 | 근거 |
|----|------|------|
| D-1 | 기존 MarkdownContent 확장 (react-markdown 미도입) | 번들 크기 절약, 테이블만 추가하면 충분 |
| D-2 | Tabs는 Radix UI 사용 (이미 설치됨) | 기존 tabs.tsx 컴포넌트 활용 |
| D-3 | API 호출은 미리보기 클릭 시 lazy fetch | 탭 진입만으로 5개 API 동시 호출 방지 |
| D-4 | 캐싱은 React state (세션 내) | 동일 산출물 재클릭 시 재호출 방지 |

---

## 4. Implementation Items

### 4.1 프론트엔드 변경

| # | 파일 | 변경 | 설명 |
|---|------|------|------|
| F-1 | `pages/export-center.tsx` | 수정 | Tabs 래핑, 기존 내용을 Spec Package 탭으로 이동 |
| F-2 | `components/export/DeliverableTab.tsx` | **신규** | SI 산출물 탭 메인 컴포넌트 |
| F-3 | `components/export/DeliverableCard.tsx` | **신규** | 개별 산출물 카드 (제목, 설명, 미리보기/다운로드 버튼) |
| F-4 | `components/export/DeliverablePreview.tsx` | **신규** | 마크다운 미리보기 패널 |
| F-5 | `api/deliverables.ts` | **신규** | `/deliverables/export/*` API 클라이언트 |
| F-6 | `components/markdown-content.tsx` | 수정 | 테이블(`| ... |`) 파싱·렌더링 추가 |

### 4.2 인프라 변경

| # | 파일 | 변경 | 설명 |
|---|------|------|------|
| I-1 | `functions/api/[[path]].ts` | 수정 | ROUTE_TABLE에 `deliverables: "svc-analytics"` 추가 |
| I-2 | `vite.config.ts` | 수정 | dev proxy에 `deliverables` 라우트 추가 |

### 4.3 변경 없음

- svc-analytics 백엔드 코드: 기존 6종 API 그대로 사용
- wrangler.toml: Service Binding 변경 없음
- RBAC: 기존 analytics 권한으로 충분

---

## 5. Deliverable Card 정의

| 코드 | 산출물명 | API 경로 | 아이콘 | 설명 |
|------|---------|----------|--------|------|
| D1 | 인터페이스 설계서 | `/export/interface-spec` | FileText | API/테이블 매칭 현황 + Gap 목록 |
| D2 | 업무규칙 정의서 | `/export/business-rules` | BookOpen | 도메인별 정책 (조건-기준-결과 3-tuple) |
| D3 | 용어사전 | `/export/glossary` | GraduationCap | SKOS/JSON-LD 용어 계층 트리 |
| D4 | Gap 분석 보고서 | `/export/gap-report` | BarChart3 | 4-perspective 커버리지 + 도메인별 Gap |
| D5 | As-Is/To-Be 비교표 | `/export/comparison` | GitCompare | 소스 vs 문서 매트릭스 + 품질 비교 |
| ALL | 전체 다운로드 | `/export/all` | Package | D1~D5 통합 마크다운 |

---

## 6. MarkdownContent 테이블 확장

현재 `markdown-content.tsx`는 `h1~h3`, `li`, `ol`, `hr`, `p`, `**bold**`, `` `code` `` 을 지원하지만 **테이블이 미지원**이에요.

SI 산출물 마크다운에는 테이블이 핵심이므로 아래 파싱 추가 필요:

```
입력:  | 항목 | 값 |
       |------|----|
       | API  | 20 |

출력:  <table> 렌더링 (CSS: border, padding, text-align)
```

파싱 규칙:
- `|`로 시작하는 연속 행을 테이블 블록으로 그룹핑
- 2번째 행이 `|---|` 패턴이면 헤더 구분선
- 숫자·퍼센트가 포함된 셀은 우측 정렬 (`:---:`, `---:` 감지)

---

## 7. 리스크

| 리스크 | 심각도 | 확률 | 대응 |
|--------|--------|------|------|
| 대용량 산출물 렌더링 지연 (D2 업무규칙 848건) | Medium | Medium | 미리보기는 첫 100행만 표시 + "전체 보기" 스크롤 |
| MarkdownContent 테이블 파서 엣지케이스 | Low | Medium | 테이블 내 `\|` 이스케이프 처리, 빈 셀 허용 |
| API 호출 실패 시 UX | Low | Low | 기존 graceful degradation 활용 + toast 알림 |

---

## 8. 성공 기준

| 지표 | 목표 | 측정 방법 |
|------|------|-----------|
| 5종 산출물 다운로드 | 전량 정상 | 각 버튼 클릭 → .md 파일 저장 확인 |
| 마크다운 미리보기 | 테이블 포함 렌더링 | D2(업무규칙 테이블), D4(Gap 매트릭스) 표시 확인 |
| 전체 다운로드 | D1~D5 통합 | ALL 버튼 → 단일 .md 파일 |
| 기존 Spec Package 기능 | 영향 없음 | 기존 E2E 시나리오 재검증 |
| typecheck + lint | PASS | `bun run typecheck && bun run lint` |

---

## 9. Implementation Order

```
Step 1: 인프라 (I-1, I-2)
  └─ Pages Function + Vite proxy에 deliverables 라우트 추가

Step 2: API 클라이언트 (F-5)
  └─ api/deliverables.ts — fetch + blob download 함수

Step 3: MarkdownContent 확장 (F-6)
  └─ 테이블 파싱·렌더링 추가

Step 4: UI 컴포넌트 (F-2, F-3, F-4)
  └─ DeliverableTab + DeliverableCard + DeliverablePreview

Step 5: 페이지 통합 (F-1)
  └─ export-center.tsx에 Tabs 래핑 + SI 산출물 탭 mount

Step 6: 검증
  └─ typecheck + lint + 수동 테스트 (5종 미리보기·다운로드)
```
