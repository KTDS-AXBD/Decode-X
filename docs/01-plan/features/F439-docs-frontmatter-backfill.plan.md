---
id: AIF-PLAN-070
sprint: 272
feature: F439
title: TD-29 docs frontmatter 일괄 보강 — INDEX 자동화 활성화
status: active
estimated_hours: 2
created: 2026-05-08
td: TD-29
---

# F439 Plan — AIF-PLAN-070

## 목표

TD-29 (`docs/` frontmatter 누락 90건/40%, GOV-001 위반)를 해소하여 `/ax:gov-doc index` 자동화를 활성화한다. 세션 283 시점 재실측 결과 **381 .md 중 118건 누락** (TD-29 등록 시 90건/227 → 1.3배 증가). `scripts/gov/backfill-frontmatter.ts` 신설 + dry-run/apply 분리 + 8 필드 자동 추론.

## 배경

- TD-29 등록: 세션 218 (2026-04-21) `/ax:gov-doc index` dry-run 결과 227 .md 중 90건 미준수
- 세션 283 재실측 (2026-05-08): **381 .md 중 118건 미준수** (분포: req-interview 36 / poc 15 / 02-design 14 / 01-plan 14 / 03-analysis 11 / 04-report 10 / docs 5 / 기타 13)
- GOV-001 doc-governance.md 명시: 8 필드(code/title/version/status/category/created/updated/author) 필수
- 영향: INDEX 자동화 차단, 카테고리 분류 디렉토리 휴리스틱 의존

## DoD

| # | 항목 | 기준 |
|---|------|------|
| 1 | Plan 문서 (AIF-PLAN-070) | 이 파일 ✅ |
| 2 | Backfill 스크립트 신설 | `scripts/gov/backfill-frontmatter.ts` (~250 lines) — frontmatter 미보유 .md 스캔 + 8 필드 추론 + dry-run/apply |
| 3 | 필드 추론 로직 | code(파일명/디렉토리 휴리스틱) + title(첫 H1) + version(1.0) + status(active) + category(디렉토리 매핑) + created/updated(`git log --diff-filter=A` 최초 commit + 마지막 commit) + author(`git log --format=%an` 최초 commit) |
| 4 | Category 매핑 테이블 | 디렉토리 → category 매핑 (`docs/01-plan/` → plan, `docs/02-design/` → design, `docs/03-analysis/` → analysis, `docs/04-report/` → report, `docs/poc/` → poc, `docs/req-interview/` → req-interview, `docs/contracts/` → contracts, 기타 → general) |
| 5 | 면제 정책 명시 | `docs/req-interview/*/review/round-*/` sub-meta + 일부 디렉토리는 frontmatter 면제 (스크립트 옵션 + 보고서에 명시) |
| 6 | Dry-run 출력 | `--dry-run` (default): 누락 파일 목록 + 추론 결과 미리보기 + apply 시 영향 통계 |
| 7 | Apply 실행 | `--apply`: 추론 frontmatter를 파일 상단에 prepend (기존 H1 보존, 안전한 순서) |
| 8 | Backfill 결과 | apply 후 frontmatter 미보유 ≤ 5건 (면제 정책 적용 후) |
| 9 | INDEX 자동화 검증 | `/ax:gov-doc index` (또는 dry-run) HTTP 0 errors + INDEX.md 파일 누락 카테고리 100% 분류 |
| 10 | typecheck/lint clean | `pnpm typecheck && pnpm lint` 오류 0 |
| 11 | Match ≥ 90% | Gap analysis 통과 |
| 12 | Report (AIF-RPRT-070) | `reports/sprint-272-frontmatter-backfill-2026-05-08.md` (apply 전후 비교 + 수정 파일 목록) |

## 구현 범위

### 신규 파일
- `scripts/gov/backfill-frontmatter.ts` (~250 lines) — 메인 스크립트
- `scripts/gov/backfill-frontmatter.test.ts` (~100 lines) — 단위 테스트 (필드 추론 + idempotent + edge case)
- `scripts/gov/CATEGORY_MAP.ts` (~30 lines) — 디렉토리 → category 매핑 + 면제 패턴
- `reports/sprint-272-frontmatter-backfill-2026-05-08.md`
- `reports/sprint-272-frontmatter-backfill-2026-05-08.json` (raw apply 통계)

### 수정 파일
- 약 100~118건 `docs/**/*.md` (frontmatter 미보유 → frontmatter prepend)
- `package.json` — `pnpm gov:backfill-frontmatter` script 추가

### 미수정
- 기존 frontmatter 보유 263건 (idempotent — 보유 파일 skip)

## 4-Step 실행

| Step | 시간 | 작업 |
|------|------|------|
| 1 | 0.5h | Backfill 스크립트 작성 — 파일 스캔 + 8 필드 추론 함수 + git log 호출 + 면제 정책 적용 + dry-run output |
| 2 | 0.3h | 단위 테스트 작성 (필드 추론 + idempotent 동작 + 면제 패턴) |
| 3 | 0.5h | Dry-run 실행 + 결과 검토 + 추론 정확도 spot-check 5건 + 필요 시 휴리스틱 보강 |
| 4 | 0.7h | Apply 실행 + git diff 확인 + Report 작성 + INDEX 자동화 검증 + typecheck/lint clean |

## 검증 시나리오

### 단위
- 신규 .md 1건 (frontmatter 없음) → 스크립트 실행 → 8 필드 정확 추론 + 파일 상단 prepend 정확
- 기존 frontmatter 보유 .md → 스크립트 skip (idempotent)
- 면제 패턴 (`review/round-*`) → 스크립트 skip 명시

### 통합
- Dry-run: 118건 누락 → 약 100~115건 backfill 후보 + 약 3~18건 면제 분류
- Apply 후 재스캔: frontmatter 미보유 ≤ 5건 (면제 분류 외 잔존 0건 목표)

### 회귀
- `/ax:gov-doc index --dry-run` 실행 → 분류 미상 카테고리 0건
- 기존 frontmatter 보유 263건 git diff 변경 0건

## 사용자 결정 (사전)

- 모드 = **Sprint autopilot WT** (사용자 확정)
- Backfill 스크립트 위치 = **`scripts/gov/`** (신설, GOV 표준 도구 모음 의도)
- 면제 정책 적용 = **YES** (`review/round-*` sub-meta 등)
- Apply 후 git diff 검토 단계 = **autopilot이 수행** (기존 H1 보존 + 추론 결과 spot-check 5건 명시 보고)

## 리스크 / 대응

- **R1**: 추론된 frontmatter가 실제 의도와 불일치 (특히 created/author 필드 — git history가 정답이 아닐 수 있음)
  - **대응**: created/author는 git log 기반 추론으로 명시, 필요 시 사용자가 추후 수동 보정 (idempotent 스크립트라 재실행 안전). `version: "1.0"` 기본값.
- **R2**: 디렉토리 → category 매핑이 일부 파일에서 부정확 (예: `docs/poc/F424/` 하위는 poc + feature 둘 다 가능)
  - **대응**: CATEGORY_MAP은 1차 디렉토리 기준 + 2차 휴리스틱 (파일명에 `plan` → plan / `design` → design / `report` → report) + fallback "general"
- **R3**: 일부 .md 파일이 frontmatter 형식 외 다른 메타 (e.g., 단순 메모)인 경우 prepend가 부적절
  - **대응**: 면제 패턴에 추가 (스크립트 `EXEMPT_PATTERNS` 배열) + Plan/Report에 명시. 의심 파일은 dry-run에서 발견 시 사용자 확인 후 면제 추가.
- **R4**: `/ax:gov-doc index` 동작 모호 (스킬 자체 검증 명령 위치 불명확)
  - **대응**: 스크립트가 단독 검증 — apply 후 재스캔 결과로 INDEX 자동화 활성화 확인. `/ax:gov-doc index` 호출은 선택적.

## 참조

- TD-29 (SPEC §8) — `docs/` frontmatter 누락 90건/40% (현 118건/31%)
- GOV-001 doc-governance.md — 8 필드 frontmatter 표준
- `docs/INDEX-inventory-2026-04-21.md` — 사전 자료
- `~/.claude/standards/doc-governance.md` — 프로젝트 횡단 표준 참조
