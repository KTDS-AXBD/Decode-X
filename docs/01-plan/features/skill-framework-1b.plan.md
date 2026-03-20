# Skill Framework Phase 1b — Planning Document

> **Summary**: Phase 1a 인프라(CLI 4종 + 11 카테고리 + 210 스킬 레지스트리) 위에 스킬 작성 가이드라인·템플릿·lint --fix·플러그인 자동분류를 추가하여 프레임워크를 실용 수준으로 완성
>
> **Project**: AI Foundry
> **Version**: v0.6.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-20
> **Status**: Draft
> **REQ**: AIF-REQ-029 (Phase 1b)
> **Predecessor**: [skill-framework.plan.md](skill-framework.plan.md) (Phase 1a, 97% PASS)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | Phase 1a에서 210 스킬 인벤토리와 CLI 도구를 구축했지만, 작성 가이드라인·템플릿이 없어 신규 스킬 품질이 보장되지 않고, 188개 플러그인 스킬이 uncategorized로 남아 카탈로그 활용도가 낮으며, lint --fix가 없어 자동 교정 불가 |
| **Solution** | 스킬 작성 가이드라인 v1 + 카테고리별 템플릿 + lint --fix 자동교정 + 플러그인 188개 자동분류 + 폐기/아카이브 정책 |
| **Function/UX Effect** | 새 스킬 작성 시 템플릿 scaffold → 가이드라인 준수 → lint 자동교정으로 품질 보장. 카탈로그에서 전체 210 스킬을 카테고리별로 탐색 가능 |
| **Core Value** | Phase 1a "가시성 확보" → Phase 1b "실용성 확보": 스킬 작성·유지·탐색의 전 주기를 표준화하여 팀 Adoption 준비 완료 |

---

## 1. Overview

### 1.1 Purpose

Phase 1a에서 구축한 스킬 인벤토리·카탈로그·린트·검색 CLI가 동작하지만, 아래 갭이 남아있어 실용성이 부족하다:

| Gap ID | 미완 항목 | 영향 |
|--------|----------|------|
| G-2 | lint `--fix` flag 미구현 | 문제 발견 후 수동 교정만 가능 |
| G-3 | `skill-writing-guide.md` 미작성 | 신규 스킬 작성 표준 없음 |
| G-4 | `templates/` 디렉토리 미생성 | 스킬 scaffold 불가 |
| — | 플러그인 188개 uncategorized | 카탈로그의 89%가 미분류 상태 |
| — | 폐기/아카이브 정책 없음 | 미사용·중복 스킬 관리 불가 |

### 1.2 Phase 1a 성과 (선행 조건)

| 항목 | 결과 |
|------|------|
| CLI 도구 | scan.mjs, catalog.mjs, search.mjs, lint.mjs (4종) |
| 카테고리 체계 | 11종 (Anthropic 9 + 커스텀 2) |
| 스킬 레지스트리 | skill-catalog.json SSOT (210 스킬) |
| 수동 분류 | user+project 22/22 완료 (8 카테고리) |
| 테스트 | 17 unit tests (scan + lint) |
| PDCA | 97% Match Rate (Full Cycle 완료) |

### 1.3 Related Documents

- Phase 1a Plan: `docs/01-plan/features/skill-framework.plan.md`
- Phase 1a Design: `docs/02-design/features/skill-framework.design.md`
- Phase 1a Analysis: `docs/03-analysis/features/skill-framework.analysis.md` (97%)
- Phase 1a Report: `docs/04-report/features/skill-framework.report.md`
- PRD: `skill-framework/prd-final.md` (§4.1-3, §4.2-5, §4.2-8)

---

## 2. Scope

### 2.1 In Scope (Phase 1b)

| # | FR | 항목 | PRD 참조 | Gap |
|---|-----|------|---------|-----|
| 1 | FR-1b-01 | **스킬 작성 가이드라인 v1** | §4.1-3 | G-3 |
| 2 | FR-1b-02 | **스킬 템플릿** (command + skill + agent) | §4.2-5 | G-4 |
| 3 | FR-1b-03 | **lint --fix 자동교정** | §4.2-8 | G-2 |
| 4 | FR-1b-04 | **플러그인 188개 자동분류** | §4.1-1 | — |
| 5 | FR-1b-05 | **폐기/아카이브 정책** | §12 | — |
| 6 | FR-1b-06 | **테스트 확장** (lint --fix, 자동분류) | §8 | — |

### 2.2 Out of Scope (Phase 2 이후)

- 팀 배포 파이프라인 (§4.2-6)
- 사용량 추적 훅 (§4.2-7)
- On Demand Hooks (§4.2-11)
- 스킬 조합/의존성 관리 (§4.2-12)
- ax-req-manage 인터뷰 절차 보강 (§4.2-10)
- 기존 스킬 리팩토링 (§4.2-9)

---

## 3. Feature Requirements Detail

### FR-1b-01: 스킬 작성 가이드라인 v1

**출력**: `skill-framework/docs/skill-writing-guide.md`

**가이드라인 구조**:
1. **Description 작성법** — 트리거 조건 중심 (Use when, Triggers), 3-5줄 이내
2. **Progressive Disclosure** — SKILL.md 계층: 1줄 요약 → 가이드라인 → 참조 파일
3. **Gotchas 섹션** — 주의사항·제한사항·알려진 이슈 필수 작성
4. **폴더 구조 표준** — `references/`, `scripts/`, `assets/` 하위 디렉토리 패턴
5. **YAML Frontmatter 표준** — 필수/선택 필드 목록 + 예시
6. **카테고리 분류 기준** — 11 카테고리별 판단 기준 + 예시 스킬
7. **안티패턴** — 흔한 실수와 개선 방법
8. **체크리스트** — 스킬 제출 전 자가 검증 리스트

**참조**: Anthropic 실전 팁 (9-카테고리, Progressive Disclosure, On Demand Hooks)

### FR-1b-02: 스킬 템플릿

**출력**: `skill-framework/templates/`

| 템플릿 | 파일 | 용도 |
|--------|------|------|
| Command | `command.template.md` | user command 생성용 (YAML frontmatter + 구조) |
| Skill | `skill.template.md` | SKILL.md 생성용 (frontmatter + sections) |
| Agent | `agent.template.md` | agent .md 생성용 (시스템 프롬프트 구조) |

각 템플릿에 포함:
- YAML frontmatter 스켈레톤 (필수 필드 `TODO` 마커)
- 섹션 구조 (description, triggers, usage, gotchas, references)
- 인라인 주석으로 작성 안내
- 추천 폴더 구조 안내

### FR-1b-03: lint --fix 자동교정

**변경 파일**: `skill-framework/scripts/lint.mjs`

**자동 교정 가능 규칙**:
| 규칙 | 교정 방식 |
|------|----------|
| `single-category` | skill-catalog.json에서 category를 description 키워드 기반 추론으로 설정 |
| `name-kebab` | 비 kebab-case ID를 kebab-case로 변환하여 레지스트리 갱신 |

**자동 교정 불가 규칙** (보고만):
| 규칙 | 사유 |
|------|------|
| `has-description` | 사람이 작성해야 함 |
| `description-trigger` | 내용 품질 판단 필요 |
| `has-gotchas` | 도메인 지식 필요 |
| `folder-structure` | 파일 생성은 위험 |
| `no-secrets` | 시크릿 제거는 사람 판단 필요 |

**CLI**:
```bash
node skill-framework/scripts/lint.mjs --fix [--scope user|project|all]
```

**동작**:
1. 기존 lint 실행
2. fixable 위반 수집
3. skill-catalog.json 직접 수정 (백업 → 수정 → 저장)
4. 수정 결과 요약 출력 (`Fixed N issues, M remaining`)

### FR-1b-04: 플러그인 188개 자동분류

**변경 파일**: `skill-framework/scripts/scan.mjs` (분류 로직 추가)

**자동분류 알고리즘**:
1. 스킬의 `description` + `name` + `path` 키워드 추출
2. `categories.json`의 `examples` 필드와 매칭
3. 키워드 기반 점수 부여:
   - 카테고리별 keywords 맵 정의 (예: `cicd-deployment` → ["deploy", "CI/CD", "pipeline", "build", "release"])
   - description 내 키워드 출현 빈도로 top-1 카테고리 결정
4. 신뢰도 < threshold(0.3)이면 `uncategorized` 유지 + 수동 태깅 대기 마커
5. 결과를 skill-catalog.json에 반영 (기존 수동 태깅 보존)

**CLI**:
```bash
node skill-framework/scripts/scan.mjs --auto-classify [--threshold 0.3]
```

**검증**: 자동분류 후 수동 검수 → 정확도 80% 이상 목표

### FR-1b-05: 폐기/아카이브 정책

**출력**: `skill-framework/docs/deprecation-policy.md`

**정책 항목**:
1. **폐기 기준**: usageCount 0 + lastUsedAt 3개월 이상 경과 + 대체 스킬 존재
2. **폐기 프로세스**: `deprecated: true` 마킹 → 1개월 유예 → `archived: true` 전환
3. **아카이브 보존**: skill-catalog.json에 메타데이터만 남기고 파일은 `archive/` 이동
4. **복구**: archived 스킬을 필요 시 재활성화 (`deprecated: false`)
5. **삭제**: archived 상태에서 6개월 경과 후 완전 삭제 가능

### FR-1b-06: 테스트 확장

**변경 파일**: `skill-framework/scripts/scan.test.mjs`

**추가 테스트**:
| 영역 | 테스트 | 예상 수 |
|------|--------|---------|
| lint --fix | fixable 규칙 교정 검증, 비fixable 건너뛰기 | 4 |
| auto-classify | 키워드 매칭 정확도, threshold 동작 | 4 |
| 기존 보강 | edge case (빈 description, 특수문자 등) | 3 |
| **합계** | | **~11 추가 (기존 17 + 11 = 28)** |

---

## 4. Non-Functional Requirements

| # | NFR | 기준 |
|---|-----|------|
| 1 | 자동분류 정확도 | ≥ 80% (수동 검수 기준) |
| 2 | lint --fix 안전성 | 원본 백업 후 수정, dry-run 옵션 지원 |
| 3 | 가이드라인 가독성 | 비개발자(팀원)도 이해 가능한 수준 |
| 4 | 템플릿 최소성 | 각 템플릿 50줄 이내 (너무 길면 사용 안 됨) |
| 5 | 하위 호환성 | Phase 1a 산출물(JSON 스키마, CLI 인터페이스) 변경 없음 |

---

## 5. Implementation Strategy

### 5.1 Sprint Plan

**단일 스프린트 (예상 4~6시간)**

| 순서 | 작업 | 예상 시간 | 비고 |
|------|------|----------|------|
| 1 | FR-1b-01: skill-writing-guide.md | 2시간 | 문서 작성, Anthropic 팁 반영 |
| 2 | FR-1b-02: templates/ (3종) | 1시간 | command + skill + agent |
| 3 | FR-1b-03: lint --fix 구현 | 1시간 | lint.mjs 확장 |
| 4 | FR-1b-04: 자동분류 + scan.mjs 확장 | 1.5시간 | 키워드 매핑 + 통합 |
| 5 | FR-1b-05: deprecation-policy.md | 30분 | 정책 문서 |
| 6 | FR-1b-06: 테스트 확장 | 30분 | 11 테스트 추가 |

**합계**: 약 6.5시간

### 5.2 구현 순서 근거

1. **가이드라인 먼저**: 템플릿·린트의 기준이 되므로 선행
2. **템플릿**: 가이드라인의 구체화 산출물
3. **lint --fix**: 기존 린터 확장이므로 독립적
4. **자동분류**: 188개 처리 후 카탈로그 재생성으로 즉시 효과
5. **정책·테스트**: 마지막 마무리

### 5.3 Agent Team 활용 가능성

| Worker | 담당 | 비고 |
|--------|------|------|
| W1 | 문서 (가이드라인 + 정책 + 템플릿) | 코드 변경 없음, 독립적 |
| W2 | 코드 (lint --fix + 자동분류 + 테스트) | script 변경만 |

두 Worker가 **파일 겹침 없이** 병렬 실행 가능 → `/ax-git-team` 적합

---

## 6. Risks & Mitigations

| # | 리스크 | 영향 | 대응 |
|---|--------|------|------|
| 1 | 자동분류 정확도 저조 | 188개 중 수동 교정 급증 | threshold 조정, 미달 시 uncategorized 유지 |
| 2 | 가이드라인이 너무 방대해 읽히지 않음 | Adoption 저하 | TL;DR + 체크리스트를 최상단에 배치 |
| 3 | lint --fix가 기존 수동 태깅 덮어씀 | 데이터 손실 | 수동 태깅(mergeSkills 로직) 항상 우선 |
| 4 | 템플릿이 실제 사용 패턴과 불일치 | 사용 안 됨 | 기존 고품질 스킬(bkit:pdca 등) 참고하여 설계 |

---

## 7. Success Criteria

| 지표 | Phase 1a 값 | Phase 1b 목표 |
|------|------------|--------------|
| 카테고리 분류 커버리지 | 22/210 (10%) | ≥ 180/210 (85%) |
| lint --fix 교정 가능 규칙 | 0 | 2종 (single-category, name-kebab) |
| 가이드라인 문서 | 없음 | 1개 (8섹션 + 체크리스트) |
| 템플릿 | 없음 | 3종 (command, skill, agent) |
| 폐기 정책 | 없음 | 확정 (5항목) |
| 테스트 수 | 17 | ≥ 28 |
| PDCA Match Rate | ≥ 90% | |

---

## 8. Dependencies

| 의존성 | 상태 | 영향 |
|--------|------|------|
| Phase 1a 산출물 (4 CLI + JSON 레지스트리) | ✅ 완료 | 필수 선행 |
| categories.json (11 카테고리) | ✅ 완료 | 자동분류 키워드 매핑 기준 |
| lint-rules.json (7 규칙) | ✅ 완료 | --fix 대상 규칙 식별 |
| bkit 플러그인 SKILL.md 파일들 | ✅ 접근 가능 | 자동분류 입력 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-20 | Phase 1b Plan 초안 | Sinclair Seo |
