---
id: AIF-PLAN-229
title: Sprint 229 — F383 AXIS DS Tier 3 외부 레포 기여 PR
type: plan
status: IN_PROGRESS
sprint: 229
f_items: [F383]
milestone: M-UX-4 Should
created: 2026-04-22
updated: 2026-04-22
---

# Sprint 229 Plan — F383 AXIS DS Tier 3 기여

## 목표

Sprint 226 Engineer Workbench에서 구현한 3 컴포넌트(SpecSourceSplitView, ProvenanceInspector, FoundryXTimeline/StageReplayer)를 `IDEA-on-Action/AXIS-Design-System` 외부 레포에 federation 방식으로 기여한다.

**DoD**: AXIS DS 레포에 PR open + PR URL 확보 (실 merge는 외부 조직 승인 대기)

## 배경

- AXIS DS는 "link-only federation" 모델 사용: `apps/web/data/*.json`에 외부 리소스를 등록
- 기존 사례: `shadcn-blocks.json`, `monet-resources.json`
- viewer permission: READ (AXBD-Team) → fork → PR 경로
- IDEA-on-Action org owner = Sinclair (sinclairseo@gmail.com)

## F-item

| F-item | 설명 | 우선순위 | 예상 소요 |
|--------|------|----------|-----------|
| F383 | AXIS DS Tier 3 외부 레포 기여 PR | P2 | 6~8h |

## 구현 접근 방식

### Phase 1: 컴포넌트 추출 (2h)
- SpecSourceSplitView → Decode-X 특화 타입 제거, generic props shape 정의
- ProvenanceInspector → 동일
- FoundryXTimeline → StageReplayer로 rename, generic HandoffService 타입 분리

### Phase 2: AXIS DS fork + JSON 등록 (2h)
- `gh repo fork IDEA-on-Action/AXIS-Design-System`
- `apps/web/data/decode-x-kit-resources.json` 생성
- 3 컴포넌트를 `agentic` category external 리소스로 등록
- GitHub 소스 링크 + Decode-X repo README 링크

### Phase 3: PR 생성 (1h)
- fork에서 feature 브랜치 생성 → push → PR open
- PR body: 컴포넌트 설명 + generic props + Storybook story 가이드

### Phase 4: Decode-X 문서 정리 (1h)
- PR URL SPEC.md에 기록
- F383 DONE 마킹

## 범위 외 (이번 Sprint)

- 실제 package.json publish (`@axis-ds/decode-x-kit`) → Phase 4 이후 추후
- Storybook 실행 환경 세팅 → PR description에 가이드로 대체
- 실 merge → 외부 org maintainer 승인 대기

## 리스크

| 리스크 | 대응 |
|--------|------|
| fork clone 속도 느림 | API 방식으로 파일 직접 생성 |
| externalUrl 링크 깨짐 | GitHub blob URL 사용 (브랜치 고정) |
