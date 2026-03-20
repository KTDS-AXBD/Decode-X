# Skill Framework Phase 1b — Gap Analysis Report

> **Analysis Type**: Design vs Implementation Gap Analysis
>
> **Project**: AI Foundry
> **Version**: v0.6.0
> **Analyst**: gap-detector
> **Date**: 2026-03-20
> **Design Doc**: [skill-framework-1b.design.md](../../02-design/features/skill-framework-1b.design.md)
> **Plan Doc**: [skill-framework-1b.plan.md](../../01-plan/features/skill-framework-1b.plan.md)
> **REQ**: AIF-REQ-029 (Phase 1b)

---

## 1. Overall Scores

| Category | Items | Pass | Score | Status |
|----------|:-----:|:----:|:-----:|:------:|
| classify.mjs (§4.3) | 3 | 3 | 100% | PASS |
| classify-keywords.json (§3.1) | 2 | 2 | 100% | PASS |
| scan.mjs --auto-classify (§4.2) | 4 | 4 | 100% | PASS |
| lint.mjs --fix (§4.1) | 7 | 6 | 86% | PASS |
| skill-writing-guide.md (§5.1) | 2 | 2 | 100% | PASS |
| templates/ (§5.2) | 4 | 4 | 100% | PASS |
| deprecation-policy.md (§5.3) | 1 | 1 | 100% | PASS |
| scan.test.mjs (§8) | 12 | 12 | 100% | PASS |
| SkillEntry Extension (§3.2) | 2 | 2 | 100% | PASS |
| Error Handling (§7) | 3 | 0 | 0% | WARN |
| File Structure (§6) | 2 | 2 | 100% | PASS |
| **Overall** | **42** | **38** | **90%** | **PASS** |

---

## 2. Gap Analysis Detail

### 2.1 classify.mjs (Design §4.3) — 3/3 PASS

- `classifyByKeywords` + `loadKeywordsMap` 두 함수 export 정확히 일치
- 알고리즘: text = name+desc+id+tags join lowercase, weight×matched scoring
- confidence 공식: `Math.min(rawConfidence, 1.0)` — Design 코드와 동일

### 2.2 classify-keywords.json (Design §3.1) — 2/2 PASS

- 11 카테고리 모두 존재, weight 값 일치 (data-analysis만 0.8, 나머지 1.0)
- 키워드 목록은 Design 예시에서 도메인 맞춤 조정 — 정상

### 2.3 scan.mjs --auto-classify (Design §4.2) — 4/4 PASS

- `--auto-classify` flag + `--threshold 0.3` default — 정확히 일치
- uncategorized 필터 + autoClassified/classifyConfidence 필드 설정 일치
- 수동 태깅 보존 규칙 구현됨
- **보너스**: `autoClassified === false` skip (수동 uncategorized 보존)

### 2.4 lint.mjs --fix (Design §4.1) — 6/7

| 항목 | 상태 | 비고 |
|------|:----:|------|
| `--fix` parseArgs 옵션 | ✅ | |
| 백업 `.bak` 생성 | ✅ | `copyFileSync` 사용 |
| single-category 교정 | ✅ | classifyByKeywords 활용 |
| name-kebab 교정 | ✅ | toLowerCase + regex replace |
| 비fixable 스킵 | ✅ | has-description, has-gotchas 등 |
| 결과 출력 | ✅ | `Fixed N issues: ...` 포맷 |
| fix 적용 조건 | ⚠️ | `confidence > 0` vs Design `category !== 'uncategorized'` (실질 동작 동일) |

### 2.5 skill-writing-guide.md (Design §5.1) — 2/2 PASS

- 9 섹션 (Design 8섹션 + 체크리스트) 모두 포함
- 278줄 (Design 200~300줄 범위 내)

### 2.6 templates/ (Design §5.2) — 4/4 PASS

- 3종 존재: command (36줄), skill (35줄), agent (38줄) — 모두 40줄 이내
- YAML frontmatter + TODO 마커 포함

### 2.7 deprecation-policy.md (Design §5.3) — 1/1 PASS

- 5 항목 (기준, 프로세스, 아카이브, 복구, 삭제) 정확히 일치
- Design보다 상세 (3-condition 기준표, 7개월 타임라인)

### 2.8 scan.test.mjs (Design §8) — 12/12 PASS

- 28 test() calls 확인 (기존 17 + 신규 11)
- Design §8.1의 11개 테스트 케이스 전수 구현
- 전체 28/28 PASS 확인

### 2.9 SkillEntry Extension (Design §3.2) — 2/2 PASS

- `autoClassified` boolean 필드 — scan.mjs에서 설정
- `classifyConfidence` number 필드 — scan.mjs에서 설정

### 2.10 Error Handling (Design §7) — 0/3 WARN

| 항목 | 상태 | 비고 |
|------|:----:|------|
| --fix: classify-keywords.json 미존재 시 skip | ❌ | `loadKeywordsMap` unhandled throw |
| --fix: backup write failure 시 중단 | ❌ | `copyFileSync` unhandled throw |
| --auto-classify: JSON parse fail 시 skip | ❌ | `loadKeywordsMap` unhandled throw |

정상 경로에서는 문제 없음. 비정상 입력(파일 누락/손상)에서만 영향.

### 2.11 File Structure (Design §6) — 2/2 PASS

- 신규 7개 파일 모두 올바른 위치에 존재
- 변경 3개 파일 (scan.mjs, lint.mjs, scan.test.mjs) 확인

---

## 3. Match Rate

```
Total Items:   42
  PASS:        38 (90%)
  MINOR:        4 (10%)  ← 에러 핸들링 방어 코드 (비차단)

Match Rate: 90%
```

---

## 4. Gaps Found

| ID | Gap | Design 위치 | 심각도 | 비고 |
|----|-----|-----------|:------:|------|
| G-1 | lint --fix confidence 조건 차이 | §4.1 | Low | `confidence > 0` vs `category !== 'uncategorized'` — 실질 동일 |
| G-2 | loadKeywordsMap try-catch 없음 (lint) | §7.1 | Low | 정상 경로 무영향 |
| G-3 | copyFileSync try-catch 없음 | §7.1 | Low | 정상 경로 무영향 |
| G-4 | loadKeywordsMap try-catch 없음 (scan) | §7.2 | Low | 정상 경로 무영향 |

### 보너스 구현 (Design 초과)

| ID | 항목 | 위치 | 비고 |
|----|------|------|------|
| B-1 | `autoClassified === false` skip | scan.mjs | 수동 uncategorized 보존 |
| B-2 | deprecation-policy 상세화 | policy.md | 3-condition 표, 7개월 타임라인 |
| B-3 | name 필드 kebab-case 교정 | lint.mjs | Design 미명시 |
| B-4 | lint CLI 사용 예시 | guide §9 | 실용성 향상 |

---

## 5. Recommended Actions

| # | 항목 | Gap | 예상 시간 | 필수 여부 |
|---|------|-----|----------|:--------:|
| 1 | lint.mjs/scan.mjs에 loadKeywordsMap try-catch 추가 | G-2, G-4 | 5분 | 선택 |
| 2 | lint.mjs copyFileSync try-catch 추가 | G-3 | 2분 | 선택 |
| 3 | Design 문서 갱신: confidence > 0 조건 반영 | G-1 | 2분 | 선택 |

**모든 Gap이 Low이므로 iterate 불필요. 90% ≥ 90% 기준 충족 → Report 진행 가능.**

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-20 | Phase 1b gap analysis | gap-detector |
