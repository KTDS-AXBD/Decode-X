---
id: AIF-RPRT-069
title: Sprint 272 — F439 docs frontmatter 일괄 보강 보고서
type: report
plan: AIF-PLAN-070
design: AIF-DSGN-069
analysis: AIF-ANLS-069
sprint: 272
feature: F439
status: completed
category: report
version: 1.0
created: 2026-05-08
updated: 2026-05-08
author: Sinclair Seo
---

# AIF-RPRT-069: Sprint 272 F439 — TD-29 frontmatter backfill

## §1 Executive Summary

**Status**: ✅ DONE | **Match Rate**: 100% | **Duration**: ~50분 (autopilot 단일 세션)

TD-29 (`docs/` frontmatter 누락 90건/40% — 4월 21일 등록)를 해소했다. **세션 시작 시점 실측 182건 누락 (455 .md 중 40%)**, apply 후 **0건**. 신규 `scripts/gov/backfill-frontmatter.ts` (327 lines) + `CATEGORY_MAP.ts` (61 lines) + 단위 테스트 39 cases (PASS) 추가. 8 필드 자동 추론 + dry-run/apply 분리 + 면제 정책 (3 패턴, 53건 skip).

## §2 변경 요약

| 카테고리 | 추가 | 변경 |
|----------|------|------|
| Plan / Design / Analysis / Report | 4 | — |
| 스크립트 (TS) | 3 (`scripts/gov/`) | — |
| Markdown frontmatter | — | 129 (.md prepend) |

git diff 통계: **133 files changed, +1419 / +-** (frontmatter 1개당 11 lines × 129 = 1419).

## §3 DoD 12 항목 결과

| # | DoD | 결과 |
|---|-----|------|
| 1 | Plan 문서 (AIF-PLAN-070) | ✅ |
| 2 | Backfill 스크립트 신설 | ✅ 327 lines |
| 3 | 8 필드 추론 로직 | ✅ |
| 4 | Category 매핑 테이블 | ✅ 9 디렉토리 + 4 토큰 + fallback |
| 5 | 면제 정책 명시 | ✅ 3 패턴 |
| 6 | Dry-run 출력 | ✅ default + verbose + JSON |
| 7 | Apply 실행 | ✅ 129 파일 |
| 8 | Backfill 결과 ≤ 5건 | ✅ **0건** (5/5 초과 달성) |
| 9 | INDEX 자동화 검증 | ✅ 재스캔 missing 0 |
| 10 | typecheck/lint clean | ✅ 14/14 + 9/9 |
| 11 | Match ≥ 90% | ✅ 100% |
| 12 | Report (AIF-RPRT-069) | ✅ 이 파일 |

## §4 실측 변화

| 시점 | .md 총수 | frontmatter 보유 | 누락 | 면제 | 비율 |
|------|----------|------------------|------|------|------|
| Plan 작성 (세션 283) | 381 | 263 | 118 | — | 31.0% |
| Sprint 시동 (세션 284) | 455 | 274 | 182 | 53* | 40.0%* |
| **Apply 후 (이 보고)** | **456** | **404** | **0** | **53** | **0%** |
| 재스캔 (이 보고 추가 후) | 457 | 404 | 0 | 53 | 0% |

*Sprint 시동 시점은 면제 분류 전 통계.

## §5 카테고리 분포 (apply 129건)

| Category | 건수 | 비율 |
|----------|------|------|
| req-interview | 50 | 38.8% |
| poc | 15 | 11.6% |
| plan | 14 | 10.9% |
| design | 14 | 10.9% |
| general | 12 | 9.3% |
| analysis | 11 | 8.5% |
| report | 11 | 8.5% |
| contracts | 2 | 1.6% |
| **합계** | **129** | **100%** |

`general` 12건 = fallback 카테고리 (디렉토리/파일명 둘 다 매칭 안 됨). 후속 spot-check 후보 (M1, ANLS §5).

## §6 검증

### 단위 (vitest, 39 cases)

```
✓ CATEGORY_MAP.mapCategory (11 cases — 9 디렉토리 + 1 파일명 토큰 + 1 fallback)
✓ CATEGORY_MAP.isExempt (4 cases — 3 패턴 + 1 음성)
✓ inferTypeFromPath (9 cases — PLAN/DSGN/ANLS/RPRT/POC/REQI/ARCH/RPRT(reports/)/DOC)
✓ CATEGORY_MAP / EXEMPT_PATTERNS 표준 (2 cases)
✓ renderFrontmatter (3 cases — 8 필드 + 양 끝 + escape)
✓ inferCode (5 cases — F### / TD-## / sprint-N / AIF-prefix / fallback)
✓ inferTitle (2 cases — H1 추출 + fallback)
✓ hasFrontmatter + prependFrontmatter idempotent (2 cases)
✓ scan + 면제 통합 (1 case — 3-way 분류 정확)

Test Files  1 passed (1)
     Tests  39 passed (39)
  Duration  183ms
```

### 정적 (turbo, cache 무효화)

- `turbo run typecheck --force`: 14/14 PASS, 13.2s
- `turbo run lint`: 9/9 PASS

### 통합 (실 docs/ scan)

- Pre-apply: missing 182, has 274, exempt 53 (총 456)
- Post-apply: **missing 0**, has 404, exempt 53 (총 457 — 이 보고서 1건 추가)

### Spot-check (5건, 추론 정확도)

ANLS §4 참조. 5/5 정확.

## §7 사용법 (후속 운영)

```bash
# 누락 현황 dry-run
npx tsx scripts/gov/backfill-frontmatter.ts

# verbose preview
npx tsx scripts/gov/backfill-frontmatter.ts --verbose

# JSON 통계
npx tsx scripts/gov/backfill-frontmatter.ts --json

# 일괄 적용 (idempotent — 기존 frontmatter 보유 시 자동 skip)
npx tsx scripts/gov/backfill-frontmatter.ts --apply
```

## §8 후속 후보 (Sprint 273+)

| 우선 | 항목 | 소요 |
|------|------|------|
| P3 | `general` 12건 spot-check + 카테고리 보정 또는 EXEMPT 추가 | ~10분 |
| P3 | `pnpm gov:backfill-frontmatter` package.json script 등록 (CI 통합) | ~5분 |
| P3 | TD-29 ✅ RESOLVED 마킹 (SPEC §8) | session-end 시 동시 |

## §9 메타 학습

### 추론 휴리스틱 효과
- **AIF-* prefix 매칭**: AIF-REQ-036, AIF-DSGN-069 등 이미 코드 명시 파일은 정확 보존 (regex `^AIF-[A-Z]+-\d+`)
- **F### / TD-## / sprint-N 우선**: 디렉토리 type 매핑과 결합해 의미적 코드 생성
- **slug fallback**: 파일명 그대로 → `AIF-{TYPE}-{slug}` (general 12건 + 일부 plan/design)

### 면제 정책 효과
- 53건 skip — 주로 `req-interview/*/review/round-*/` (review 결과 sub-meta)와 `archive/` 이력 자료
- frontmatter 강제 시 의미 없는 8 필드 prepend가 발생할 자료들 → 정책으로 명시 회피

### F439 실측 vs Plan 추정 격차
- Plan 작성 (세션 283) 시점 118건 → Sprint 시동 (세션 284) 시점 182건. 1주일 미만에 docs/ 64건 증가 (16건/일)
- 누적 패턴: Sprint 사전 등록 + Plan 작성 사이클이 docs/ 빠르게 증가시킴 → backfill 스크립트 idempotent 운영 (CI 통합 후보 P3)

## §10 참조

- AIF-PLAN-070 (`docs/01-plan/features/F439-docs-frontmatter-backfill.plan.md`)
- AIF-DSGN-069 (`docs/02-design/features/F439-docs-frontmatter-backfill.design.md`)
- AIF-ANLS-069 (`docs/03-analysis/features/F439-docs-frontmatter-backfill.analysis.md`)
- TD-29 (SPEC §8)
- ~/.claude/standards/doc-governance.md (8 필드 표준)
- raw stats: `reports/sprint-272-frontmatter-backfill-2026-05-08.json`
