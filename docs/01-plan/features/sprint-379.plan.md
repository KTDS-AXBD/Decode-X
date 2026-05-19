---
id: AIF-PLAN-230
title: Sprint 379 Plan — F551 DoD 6축 (f) CI Guard
type: plan
status: active
created: "2026-05-19"
updated: "2026-05-19"
author: master
sprint: 379
feature: F551
related:
  - AIF-REQ-044
  - AIF-PLAN-096 (Sprint 377 DoD 5축 강화 선례)
  - rules/development-workflow.md "Autopilot Production Smoke Test"
---

# Sprint 379 Plan — F551 DoD 6축 (f) CI Guard

**Sprint**: 379
**F-item**: F551
**Type**: Governance / Infra
**Session**: 세션 309
**Date**: 2026-05-19

---

## 배경 — autopilot DOMAIN_MAP false claim 패턴 2회차 재발

| 회차 | Sprint | 세션 | 상황 | 처리 |
|------|--------|------|------|------|
| 1회차 (14회차 누적 S376) | Sprint 376 (GR Garden) | S307 후속6 | commit message에 "DOMAIN_MAP 80번째" 명시했으나 실제 변경 누락 — false claim | Master 1줄 fix-forward `82c5dcb` |
| 2회차 (15회차 누적 S378) | Sprint 378 (PL Planetarium) | S308 | DoD 5축 (e) `findDomainMapping("planetarium")` 자체 검증 + step 13 `git show HEAD --stat` 자체 검증 명시에도 누락 | Master 1줄 fix-forward `ad084d0` |

**S377 DoD 5축 강화 정착 검증 실패 입증**: S377에서 1회 입증된 5축 효과는 S378에서 재현 안 됨. autopilot 자체 검증 step이 "검증했다"고 self-claim하면서도 실제 누락 발생 — **자체 검증은 작업 누락에 구조적 취약**.

## 목표

GitHub Actions workflow 신설로 **PR 단계 강제 검증** 도입. autopilot이 검증 단계를 자체 마킹/누락하더라도 CI가 외부 차단. Master 부재 시에도 작동.

**핵심 원칙**: 자체 검증(self-attestation) → 외부 검증(external enforcement) 전이. 5축 (e) self-call → 6축 (f) CI fail-on-missing.

## 구현 범위

### 신규 파일 3건

#### 1. `.github/workflows/domain-sprint-guard.yml`

```yaml
name: Domain Sprint Guard
on:
  pull_request:
    types: [opened, synchronize, reopened, edited]

jobs:
  domain-map-check:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Detect new-domain Sprint via PR title
        id: detect
        env:
          PR_TITLE: ${{ github.event.pull_request.title }}
        run: |
          # 신규 도메인 Sprint 패턴 매칭 (한국어/숫자 친화 regex)
          if echo "$PR_TITLE" | grep -qE 'F[0-9]+.*([0-9]+번째 도메인|신규 산업|[0-9]+번째 산업)'; then
            echo "match=true" >> $GITHUB_OUTPUT
            echo "✅ 신규 도메인 Sprint 패턴 매칭: $PR_TITLE"
          else
            echo "match=false" >> $GITHUB_OUTPUT
            echo "⏭️ 신규 도메인 Sprint 아님 (skip): $PR_TITLE"
          fi

      - name: Verify DOMAIN_MAP entry diff
        if: steps.detect.outputs.match == 'true'
        run: |
          ADDED_CONTAINERS=$(git diff origin/${{ github.base_ref }}...HEAD -- scripts/divergence/domain-source-map.ts \
            | grep -cE '^\+\s*container:\s*"' || true)
          echo "DOMAIN_MAP added containers: $ADDED_CONTAINERS"
          if [ "$ADDED_CONTAINERS" -lt 1 ]; then
            echo "❌ DOMAIN_MAP entry 누락 — autopilot false claim 패턴 차단"
            echo ""
            echo "신규 도메인 Sprint(\"$PR_TITLE\")가 감지되었으나,"
            echo "scripts/divergence/domain-source-map.ts에 신규 container entry가 추가되지 않았습니다."
            echo ""
            echo "후속 조치:"
            echo "  1. DOMAIN_MAP에 신규 entry 추가 후 commit + push"
            echo "  2. autopilot이 누락한 경우 Master fix-forward로 보강"
            echo ""
            echo "참조: SPEC.md AIF-REQ-044 / rules/development-workflow.md \"Autopilot Production Smoke Test\""
            exit 1
          fi
          echo "✅ DOMAIN_MAP entry 정상 추가 (+$ADDED_CONTAINERS containers)"
```

#### 2. `.github/workflows/domain-sprint-guard.test.sh`

4 시나리오 정합성 검증 (로컬 dry-run + CI 직전 회귀):

| # | PR title | DOMAIN_MAP diff | 기대 결과 |
|---|----------|-----------------|-----------|
| i  | "feat: Sprint 379 F551 81번째 도메인" | +1 container | PASS |
| ii | "feat: Sprint 379 F551 82번째 도메인" | +0 container | **FAIL** (차단) |
| iii | "docs: SPEC §5 갱신" | irrelevant | SKIP (workflow no-op) |
| iv | "feat: Sprint 379 F551 신규 산업 (PL Planetarium)" | +1 container | PASS (변형 패턴 매칭) |

스크립트가 `bash` 으로 직접 실행 가능하도록 self-contained 작성. CI workflow도 인라인 호출 가능.

#### 3. `reports/sprint-379-dod-6th-axis-ci-guard-2026-05-19.md` (AIF-RPRT-098)

회고 보고서:
- 1, 2회차 재발 사실 정량 정리 (S376/S378 commit hash 인용)
- DoD 5축 (e) 한계 분석 (자체 검증 = self-attestation)
- 6축 (f) CI Guard 도입 논리 (외부 검증 = external enforcement)
- 회귀 검증 결과 (F549 PASS / F550 가상 FAIL)
- 차기 모니터링: 3회차 재발 시 lifecycle 승격 트리거

### 수정 파일 2건

#### 4. CLAUDE.md — "Autopilot Guards" 섹션 신설 (또는 기존 `## Code Patterns & Gotchas` 하위)

```markdown
## Autopilot Guards

### DoD 6축 (f) — CI Guard for DOMAIN_MAP entry

신규 도메인 Sprint(PR title matches `F[0-9]+.*[0-9]+번째 도메인` 또는 `신규 산업`)는
`.github/workflows/domain-sprint-guard.yml`이 `scripts/divergence/domain-source-map.ts` diff를
강제 검증한다. DOMAIN_MAP 신규 entry 0건이면 CI fail (S376 + S378 2회 재발 → 외부 검증 도입).

autopilot Plan/Design 작성 시 5축 (a~e) 외 6축 (f) CI Guard 존재 인지 필수:
- 5축 (a~e): 자체 검증 (autopilot이 commit 전 verify)
- 6축 (f): 외부 검증 (CI workflow가 PR 단계 fail-on-missing)
```

#### 5. `~/.claude/rules/development-workflow.md` — DOMAIN_MAP false claim 패턴 신설

기존 "Autopilot Production Smoke Test" 섹션 다음 또는 신설 항목:

```markdown
## Autopilot DOMAIN_MAP False Claim 패턴 (2회 재현 — S376 + S378, lifecycle 승격 후보)

- **현상**: autopilot이 commit message 또는 PR body에 "DOMAIN_MAP N번째 entry 추가" 명시하면서도
  실제 `scripts/divergence/domain-source-map.ts` 변경 없음. DoD self-verify step("git show HEAD --stat | grep domain-source-map.ts")조차 누락 확인 안 함.
- **재현**: S376 14회차 (GR Garden, fix-forward `82c5dcb`) / S378 15회차 (PL Planetarium, fix-forward `ad084d0`). DoD 5축 강화(S377 도입) 정착 검증 실패.
- **근본 원인 추정**: autopilot의 commit-stage self-verify는 작업 누락 시 "검증 안 한 누락"과 "검증한 통과"를 구분 못 함 — 작업 큐 자체에서 빠진 task는 verify pass로 마킹됨.
- **L1 차단 (S379 F551 도입)**: GitHub Actions `domain-sprint-guard.yml` CI guard — PR title 매칭 시 DOMAIN_MAP diff 0건이면 fail. autopilot 우회 불가, Master 부재 시에도 작동.
- **L2 회복 (실패 시)**: Master `git diff origin/main -- scripts/divergence/domain-source-map.ts` 점검 후 1줄 fix-forward (현재 표준).
- **lifecycle 승격 트리거**: 3회차 재발 시 rules/로 승격 검토 + autopilot prompt 직접 보강.
- **차기 모니터링**: 차기 신규 도메인 Sprint(83+번째) PR에서 본 workflow 작동 입증 + 0건 재발 시 정착.
```

## DoD 9/9

1. `.github/workflows/domain-sprint-guard.yml` 신설 (PR title regex + DOMAIN_MAP diff 검증)
2. `.github/workflows/domain-sprint-guard.test.sh` 신설 + 4 시나리오 PASS
3. `reports/sprint-379-dod-6th-axis-ci-guard-2026-05-19.md` 신설 (AIF-RPRT-098)
4. CLAUDE.md "Autopilot Guards" 섹션 신설 (또는 기존 섹션 하위 1단락 명시)
5. `~/.claude/rules/development-workflow.md` DOMAIN_MAP false claim 패턴 신설
6. 회귀 검증: F549 PR #95 PASS / F550 PR #96 fix-forward 전 commit FAIL — `bash .github/workflows/domain-sprint-guard.test.sh` 실행 결과 reports 첨부
7. Match ≥ 95%
8. PR + CI 3/3 green
9. auto-merge

## 사전 audit (S283 패턴 35회차)

✅ `.github/workflows/domain-sprint-guard.yml` 미존재
✅ `.github/workflows/domain-sprint-guard.test.sh` 미존재
✅ `reports/sprint-379-dod-6th-axis-ci-guard-2026-05-19.md` 미존재
✅ CLAUDE.md "Autopilot Guards" / "DoD 6축" 미명시

4축 fs 실측 확정.

## 의존성

없음 (governance/infra Sprint, 코드 동작 영향 없음).
단 `~/.claude/rules/development-workflow.md`는 home directory 외부 파일이므로 worktree에서 직접 수정 가능 여부 점검 필요 — 안 되면 reports/에 적용 권고만 기록 후 Master가 후속 수동 적용.

## 회귀 검증 시나리오

### F549 (PR #95) — DOMAIN_MAP entry 자동 포함 (PASS 예상)

```bash
git checkout 29778ba  # F549 merge commit
git diff origin/main^...HEAD -- scripts/divergence/domain-source-map.ts \
  | grep -cE '^\+\s*container:\s*"'
# 기대: 1 (observatory entry 1건 추가)
# 결과: PASS
```

### F550 (PR #96) — autopilot 누락 직후 (FAIL 예상)

```bash
git checkout aae14b9  # F550 squash merge (autopilot 누락 상태)
git diff origin/main^...HEAD -- scripts/divergence/domain-source-map.ts \
  | grep -cE '^\+\s*container:\s*"'
# 기대: 0 (autopilot이 entry 추가 누락)
# 결과: FAIL — CI Guard가 차단했어야 할 케이스
```

### F550 fix-forward (commit `ad084d0`) — Master 보정 후 (PASS 예상)

```bash
git checkout ad084d0  # Master fix-forward
git diff aae14b9...HEAD -- scripts/divergence/domain-source-map.ts \
  | grep -cE '^\+\s*container:\s*"'
# 기대: 1 (Master가 planetarium entry 1건 추가)
# 결과: PASS
```

## 메타 — 새로운 거버넌스 패턴

본 Sprint는 **거버넌스 메타 패턴**의 첫 사례:
- 자체 검증(self-attestation) → 외부 검증(external enforcement) 전이
- 2회 재발 입증 → CI 자동화 도입
- 향후 다른 autopilot false claim 패턴에도 동일 구조 적용 가능 (예: utils test count 누락, parser prefix 누락 등)

3회차 재발 시 lifecycle 승격 표준 트리거 — rules/로 영구 정착.
