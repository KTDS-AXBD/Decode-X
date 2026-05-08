---
id: AIF-DSGN-069
title: F439 docs frontmatter 일괄 보강 상세 설계
type: design
plan: AIF-PLAN-070
sprint: 272
feature: F439
status: active
category: design
version: 1.0
created: 2026-05-08
updated: 2026-05-08
author: Sinclair Seo
---

# AIF-DSGN-069: TD-29 frontmatter backfill 스크립트 설계

## §0 컨텍스트 갱신

| 시점 | .md 총수 | frontmatter 누락 | 비율 |
|------|----------|------------------|------|
| 세션 218 (TD-29 등록) | 227 | 90 | 39.6% |
| 세션 283 Plan 작성 | 381 | 118 | 31.0% |
| **세션 284 (Sprint 시동, 실측)** | **455** | **182** | **40.0%** |

원인: Sprint 사전 등록 + Plan 작성 누적으로 docs/ 증가 (특히 req-interview phase-3, archive 누적). DoD#8 "≤ 5건" 기준은 면제 패턴 적용 후 기준이므로 유효.

세션 284 실측 분포 (상위 11개 디렉토리):

| 디렉토리 | 누락 건수 | 면제 후보 |
|---------|----------|----------|
| req-interview/decode-x-v1.2 | 18 | 일부 (review/round) |
| archive/2026-03 | 17 | 전체 (history archive) |
| req-interview/decode-x-v1.3-phase-2 | 16 | 일부 |
| req-interview/decode-x-deep-dive | 16 | 일부 |
| 02-design/features | 14 | 0 (필수) |
| 01-plan/features | 14 | 0 (필수) |
| decode-x-restructuring/archive | 13 | 전체 |
| req-interview/decode-x-v1.3-phase-3 | 12 | 일부 |
| req-interview/decode-x-v1.3-phase-3-ux | 11 | 일부 |
| 03-analysis/features | 9 | 0 (필수) |
| 04-report/features | 8 | 0 (필수) |
| poc + 기타 | 약 34 | 일부 (지문/메모) |

## §1 스크립트 구조

### `scripts/gov/backfill-frontmatter.ts` (메인, ~250 lines)

핵심 함수 5종:

1. **`hasFrontmatter(file)`** — 파일 시작이 `---\n` 또는 `---\r\n` 인지 확인 (idempotent 보장)
2. **`inferFrontmatter(file, repoRoot)`** — 8 필드 추론 후 `InferredFrontmatter` 반환
3. **`prependFrontmatter(file, fm)`** — 추론 frontmatter 파일 상단 prepend (기존 H1 보존)
4. **`scan(rootDirs, repoRoot)`** — 재귀 walk + 분류 (`hasFrontmatter` / `exempt` / `willApply`)
5. **`main()`** — `--apply` flag 분기. dry-run default + verbose preview

git 호출은 **`execFileSync('git', [...])` 패턴** (shell injection 방지). args는 모두 array — 보안 hook 안전.

### `scripts/gov/CATEGORY_MAP.ts` (~30 lines)

```ts
export const CATEGORY_MAP: Record<string, string> = {
  '01-plan': 'plan',
  '02-design': 'design',
  '03-analysis': 'analysis',
  '04-report': 'report',
  'reports': 'report',
  'poc': 'poc',
  'req-interview': 'req-interview',
  'contracts': 'contracts',
  'archive': 'archive',
};

export const EXEMPT_PATTERNS: RegExp[] = [
  /\/req-interview\/[^/]+\/review\/round-\d+\//,
  /\/archive\/2026-03\//,
  /\/decode-x-restructuring\/archive\//,
];

export function mapCategory(relPath: string): string;
export function isExempt(relPath: string): boolean;
```

`mapCategory` 알고리즘: 1차 디렉토리 segment 매칭 → 2차 파일명 토큰 (`.plan.md` / `.design.md` 등) → fallback `general`.

### `scripts/gov/backfill-frontmatter.test.ts` (~100 lines)

vitest 기반:
- `mapCategory` 6개 디렉토리 정확 매핑
- `isExempt` review/round + archive 패턴 매칭
- `inferTypeFromPath` PLAN/DSGN/ANLS/RPRT/POC/REQI/ARCH 분기
- `renderFrontmatter` snapshot — 8 필드 모두 출력 확인
- 추론된 code 패턴 (F### / TD-## / sprint-N / AIF-DOC-fallback)
- idempotent 보장 (frontmatter 있는 파일 입력 시 unchanged)

## §2 면제 정책

| 패턴 | 사유 | 행동 |
|------|------|------|
| `req-interview/*/review/round-*/` | sub-meta (review 결과 텍스트 스냅샷) | skip |
| `archive/2026-03/` | 과거 history archive (재구성 전 자료) | skip |
| `decode-x-restructuring/archive/` | restructuring history (immutable) | skip |

면제 외 모든 .md는 backfill 대상.

## §3 8 필드 추론 규칙

| 필드 | 추론 | Fallback |
|------|------|----------|
| code | 파일명 prefix(F###/TD-##/sprint-N) → 디렉토리 type 매핑 → AIF-DOC-{slug} | AIF-DOC-... |
| title | 첫 H1 (`# Title`) → 30 lines 내 검색 | 파일명 (-_ → space) |
| version | `1.0` | `1.0` (고정) |
| status | `active` | `active` (고정) |
| category | CATEGORY_MAP 디렉토리 매칭 → 파일명 토큰(.plan/.design 등) | `general` |
| created | git log `--diff-filter=A --format=%ad --date=short` 최초 commit | `2026-05-08` |
| updated | git log `-1 --format=%ad --date=short` 마지막 commit | `2026-05-08` |
| author | git log `--diff-filter=A --format=%an` 최초 commit | `Sinclair Seo` |

git 호출은 `execFileSync('git', ['log', ...args, '--', relPath])` 패턴 (인자 array). 파일별 호출 비용 ~30ms × 150 ≈ 4.5s, 실용 범위.

## §4 검증 시나리오

### 단위
- 신규 .md (frontmatter 미보유) → script `--apply` → 8 필드 정확 prepend
- 기존 frontmatter 보유 → skip (idempotent — 동일 인자로 2회 실행 시 추가 변경 0)
- 면제 패턴 → skip + Exempt count 보고

### 통합
- Dry-run: 182 missing → ~150 will apply + ~30 exempt (archive + review/round)
- Apply 후 재스캔: missing 0 (면제 외 잔존 0건 목표, DoD#8 ≤ 5건)
- typecheck/lint clean (`pnpm typecheck && pnpm lint`)

### 회귀
- 기존 frontmatter 보유 273+ 파일 → git diff 변경 0건
- 디렉토리 중 INDEX.md / CHANGELOG.md / SPEC.md / README.md 등 root .md는 docs/ 외 → 스코프 외 (script `rootDirs=['docs']`만 처리)

## §5 4-Step 매핑

| Plan Step | Design 산출물 |
|-----------|--------------|
| 1 (스크립트 작성) | §1 backfill-frontmatter.ts + CATEGORY_MAP.ts |
| 2 (테스트 작성) | §1 backfill-frontmatter.test.ts |
| 3 (Dry-run 검토) | §4 통합 시나리오 1차 + spot-check 5건 |
| 4 (Apply + Report) | §4 통합 시나리오 2차 + reports/sprint-272-... |

## §6 리스크 (Plan §리스크 추적)

| ID | 대응 |
|----|------|
| R1 created/author git history 추론 | Plan 명시 — idempotent 재실행 안전 |
| R2 category 디렉토리 → poc/feature 모호 | CATEGORY_MAP 1차 디렉토리 + 2차 파일명 토큰 + fallback general |
| R3 단순 메모 prepend 부적절 | EXEMPT_PATTERNS에 추가 가능 (현 정책: archive + review/round) |
| R4 `/ax:gov-doc index` 호출 모호 | 스크립트 자체 재스캔으로 검증 (호출은 선택) |

## §7 참조

- AIF-PLAN-070 (이 sprint Plan)
- TD-29 (SPEC §8 — frontmatter 누락 90건/40%)
- ~/.claude/standards/doc-governance.md — 8 필드 표준
- GOV-001 doc-governance — 프로젝트 횡단 표준
