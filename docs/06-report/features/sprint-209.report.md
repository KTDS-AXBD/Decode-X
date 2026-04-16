---
sprint: 209
requirement: AIF-REQ-034 E
title: Org 단위 B/T/Q 종합 Spec + UI
status: completed
created: 2026-04-16
matchRate: 100
testResult: pass
---

# Sprint 209 Report — Org 단위 B/T/Q 종합 Spec + UI

## 결과 요약

| 항목 | 값 |
|------|-----|
| Match Rate | 100% |
| Test Result | 332/332 PASS |
| Typecheck | PASS (svc-skill + app-web) |
| Lint | PASS |
| E2E | SKIP (Playwright 미설정) |
| Codex Review | SKIP (Codex CLI 미설치) |

## 구현 내용

### Backend (svc-skill) — 5파일 신규/수정

1. **`spec-gen/types.ts`**: `OrgSpecData`, `OrgSpecDocument`, `OrgSpecMetadata` 타입 추가
2. **`spec-gen/org-collector.ts`** (신규): Org 전체 skills D1 조회 → R2 batch 로드 → 데이터 집계
3. **`spec-gen/index.ts`**: `generateOrgSpec()`, `generateAllOrgSpecs()` + `orgToSkillSpecData()` 변환으로 기존 generators 100% 재사용
4. **`spec-gen/markdown-renderer.ts`**: `renderOrgSpecToMarkdown()` 추가
5. **`routes/org-spec.ts`** (신규): `GET /admin/org-spec/:orgId/:type` + `GET /skills/org/:orgId/spec/:type` dual path
6. **`index.ts`**: 라우트 등록 (regex dual path 매칭)

### Frontend (app-web) — 5파일 신규/수정

1. **`api/org-spec.ts`** (신규): `fetchOrgSpec`, `fetchAllOrgSpecs`, `fetchSkillSpec` API client
2. **`pages/org-spec.tsx`** (신규): Org 종합 Spec 페이지 (B/T/Q 탭, 온디맨드 생성)
3. **`pages/poc-ai-ready-detail.tsx`**: 기존 3탭 → 4탭 ("Spec" 탭 추가, SkillSpecTab 컴포넌트)
4. **`app.tsx`**: `/org-spec` 라우트 등록
5. **`Sidebar.tsx`**: "Org 종합 Spec" 메뉴 항목 추가

## 설계 결정

- **기존 generators 재사용**: `orgToSkillSpecData()` 변환 함수로 OrgSpecData를 SkillSpecData 형태로 변환하여, Business/Technical/Quality generators를 코드 중복 없이 재사용
- **Dual path routing**: `/admin/org-spec/` (게이트웨이 모드) + `/skills/org/.../spec/` (vite proxy 호환)를 하나의 regex로 처리
- **R2 batch 처리**: 5건씩 `Promise.allSettled`로 병렬 로드, 최대 100건 제한
- **안전한 마크다운 렌더링**: innerHTML 직접 주입 대신 `<pre>` 블록으로 XSS 방지
