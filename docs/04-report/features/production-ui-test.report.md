---
code: AIF-RPRT-008
title: "Production UI/UX 전체 점검 리포트"
version: "1.0"
status: Active
category: RPRT
created: 2026-03-08
updated: 2026-03-08
author: Sinclair Seo
---

# Production UI/UX 전체 점검 리포트

> 점검일: 2026-03-08
> 대상: https://ai-foundry.minu.best (Cloudflare Pages)
> 도구: Playwright MCP (headless Chrome)
> 로그인: 서민원 (admin-001, Executive)
> Organization: 미래에셋 퇴직연금

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| 총 점검 페이지 | 19개 |
| PASS | 12 |
| WARN (경미) | 5 |
| FAIL (심각) | 1 |
| SKIP | 1 |
| 총 콘솔 에러 | 100건 (API Console 페이지 단독) |
| 총 API 에러 | 50건 (403 응답, `/api/skills/:id/mcp`) |

---

## 페이지별 점검 결과

| # | 페이지 | 경로 | 결과 | 콘솔 에러 | API 에러 | 비고 |
|---|--------|------|:----:|:---------:|:--------:|------|
| 1 | 대시보드 | `/` | ✅ PASS | 0 | 0 | 통계 4카드, Quick Actions, 최근활동 정상 |
| 2 | 로그인 | `/login` | ⏭️ SKIP | - | - | 이미 인증 상태로 테스트, 데모유저 로그인 동작 확인 |
| 3 | 문서 업로드 | `/upload` | ✅ PASS | 0 | 0 | 948문서, 완료 931, 오류 17. D&D 영역 정상 |
| 4 | 소스코드 업로드 | `/source-upload` | ⚠️ WARN | 0 | 0 | **영문 전용** (다른 페이지는 한영 병기) |
| 5 | 분석 결과 | `/analysis` | ⚠️ WARN | 0 | 0 | 정상 동작. "기타"에 `upload-tmp-*` 임시파일명 다수 |
| 6 | 분석 리포트 | `/analysis-report` | ✅ PASS | 0 | 0 | 1,227문서 분석, 4탭 정상, 스코어 정렬 OK |
| 7 | HITL 검토 | `/hitl` | ✅ PASS | 0 | 0 | 검토대기 50건, 상세(조건/기준/결과) 정상 |
| 8 | 팩트 체크 | `/fact-check` | ⚠️ WARN | 0 | 0 | **영문 전용**. 미래에셋 org에서 미실행(0건) |
| 9 | 신뢰도 대시보드 | `/trust` | ✅ PASS | 0 | 0 | 3레벨 신뢰도, HITL 통계 95%, 리더보드 8명 |
| 10 | Skill 카탈로그 | `/skills` | ✅ PASS | 0 | 0 | 3,580 Skill, 태그클라우드, 4탭필터 정상 |
| 11 | Skill 상세 | `/skills/:id` | ✅ PASS | 0 | 0 | 풀 UUID 접근 시 정상 (메타/태그/신뢰도/다운로드) |
| 12 | Spec 카탈로그 | `/specs` | ⚠️ WARN | 0 | 0 | **영문 전용**. 미래에셋 org 소스코드 없어 0건 |
| 13 | Spec 상세 | `/specs/:id` | ⏭️ SKIP | - | - | Spec 0건이므로 상세 테스트 불가 |
| 14 | Export 센터 | `/export` | ⚠️ WARN | 0 | 0 | **영문 전용**. KPI 5지표 모두 0%/FAIL |
| 15 | **API 연결** | `/api-console` | ❌ **FAIL** | **100** | **50** | `/api/skills/:id/mcp` 전체 403. MCP 탭 기능 불능 |
| 16 | 온톨로지 | `/ontology` | ✅ PASS | 0 | 0 | 31,295 용어, 그래프/목록 뷰 정상 |
| 17 | 감사 로그 | `/audit` | ✅ PASS | 0 | 0 | 178건, 필터/검색/페이지네이션 정상 |
| 18 | 설정 | `/settings` | ✅ PASS | 0 | 0 | 5탭(프로필/알림/보안/모양/시스템) 정상 |
| 19 | 이용 가이드 | `/guide` | ✅ PASS | 0 | 0 | 5탭, 5-Stage 파이프라인 인터랙티브 정상 |

---

## 발견된 이슈

### CRITICAL (즉시 수정)

#### ISS-001: API Console MCP Adapter 탭 완전 불능
- **페이지**: `/api-console`
- **증상**: 50개 Skill의 `/api/skills/:id/mcp` 엔드포인트가 모두 **HTTP 403** 반환
- **콘솔 에러**: `Failed to fetch MCP for skill {id}` × 100건
- **화면 표시**: "등록된 Skill MCP 매핑이 없습니다"
- **원인 추정**: 프론트엔드에서 `X-Internal-Secret` 헤더 없이 내부 API 호출 → 인증 실패
- **영향**: MCP Adapter 탭 기능 완전 불능. OpenAPI/API Keys/사용량 탭은 미확인
- **조치**: `svc-skill`의 `/skills/:id/mcp` 엔드포인트에 프론트엔드 접근용 인증 경로 추가 또는 프론트엔드에서 적절한 인증 헤더 전송

### MEDIUM (개선 권장)

#### ISS-002: 페이지 언어 일관성 부재
- **해당 페이지**: `/source-upload`, `/fact-check`, `/specs`, `/export`
- **증상**: 대부분 페이지는 한영 병기(한국어 + English)지만, 위 4개 페이지는 **영문 전용**
- **영향**: UI/UX 일관성 저하, 사용자 혼란 가능
- **조치**: 나머지 페이지도 한영 병기 패턴으로 통일 (제목/설명/레이블)

#### ISS-003: Analysis 페이지 "기타" 카테고리 임시 파일명
- **페이지**: `/analysis`
- **증상**: "기타" 카테고리에 `upload-tmp-477798.xlsx` 동일 파일명이 다수 존재
- **원인 추정**: 업로드 시 원본 파일명 대신 임시 파일명이 저장됨
- **영향**: 사용자가 원본 문서 식별 불가
- **조치**: `svc-ingestion`에서 업로드 시 원본 파일명 보존 로직 확인

### LOW (참고)

#### ISS-004: Cloudflare RUM (cdn-cgi/rum) ERR_ABORTED
- **빈도**: 모든 페이지 전환 시 2건씩 발생 (정상적인 페이지 이탈 중단)
- **영향**: 없음 (Cloudflare 내부 분석 요청, 페이지 전환 시 자연 발생)
- **조치**: 불필요

#### ISS-005: 사이드바 아코디언 그룹 라벨 공백 부재
- **증상**: "지식 추출Extract", "품질 보증Verify", "활용Deliver", "관리Admin" — 한영 사이에 공백 없음
- **영향**: 가독성 경미 저하
- **조치**: 사이드바 아코디언 라벨에 한영 사이 공백 추가

---

## 공통 양호 사항

1. **로딩 상태**: 모든 페이지가 Suspense "로딩 중..." 표시 후 정상 렌더링
2. **사이드바**: 5개 아코디언 그룹 + 19개 네비게이션 링크 정상 동작
3. **Organization Selector**: "미래에셋 퇴직연금" 정상 표시
4. **사용자 정보**: "서민원 / 관리자" 정상, 로그아웃 버튼 존재
5. **테마 전환**: Dark 모드 버튼 존재
6. **AI 가이드**: 모든 페이지 우하단 챗 위젯 버튼 존재
7. **반응형**: Playwright viewport(1280×720)에서 사이드바+메인 콘텐츠 적절히 표시
8. **API 응답**: API Console 제외 모든 API 호출 HTTP 200

---

## 테스트 환경

| 항목 | 값 |
|------|-----|
| 브라우저 | Chromium (Playwright headless) |
| Viewport | 1280 × 720 |
| 네트워크 | WSL2 → Internet |
| 날짜/시간 | 2026-03-08 12:53 KST |
| 스크린샷 | `test-results/` 디렉토리 (5장) |

---

## 권장 조치 우선순위

| 우선순위 | 이슈 | 예상 작업량 |
|:--------:|------|:-----------:|
| P0 | ISS-001: API Console MCP 403 수정 | 소 |
| P1 | ISS-002: 4개 페이지 한영 병기 통일 | 중 |
| P1 | ISS-005: 사이드바 라벨 공백 추가 | 소 |
| P2 | ISS-003: 임시 파일명 문제 조사 | 중 |
