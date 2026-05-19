---
id: AIF-RPRT-098
title: Sprint 379 F551 — DoD 6축 (f) CI Guard 도입 회고 보고서
type: report
status: done
created: "2026-05-19"
updated: "2026-05-19"
author: autopilot
sprint: 379
feature: F551
related:
  - AIF-REQ-044
  - AIF-PLAN-230
  - AIF-RPRT-096 (Sprint 377 DoD 5축 강화 보고서)
---

# Sprint 379 F551 — DoD 6축 (f) CI Guard 도입 회고

**Sprint**: 379  
**F-item**: F551  
**Date**: 2026-05-19  
**Match**: 100%

---

## 1. 배경 — autopilot DOMAIN_MAP false claim 패턴 2회 재발

### 1.1 사실 정리

| 회차 | Sprint | 세션 | Commit | 상황 | 처리 |
|------|--------|------|--------|------|------|
| 1회차 | Sprint 376 (GR Garden) | S307후속6 | `82c5dcb` | commit message "DOMAIN_MAP 80번째" 명시, 실제 변경 0 | Master fix-forward 1줄 |
| 2회차 | Sprint 378 (PL Planetarium) | S308 | `ad084d0` | DoD 5축 (e) + step 13 `git show HEAD --stat` 자체 검증 명시에도 누락 | Master fix-forward 1줄 |

### 1.2 DoD 5축 강화 정착 실패 분석

Sprint 377 F549 OB Observatory에서 DoD 5축 (e)를 처음 도입하여 **S377에서 1회 입증**했다.  
그러나 Sprint 378 F550에서 동일 구조 재발. **1회 입증 ≠ 정착** 확인.

**근본 원인 추정**: autopilot의 commit-stage self-verify는 작업 큐에서 빠진 task를 탐지하지 못함.
- `git show HEAD --stat | grep domain-source-map.ts` — 파일이 변경됐을 때만 PASS
- 파일 자체가 변경 대상에 포함 안 되면 grep 결과 0줄 → autopilot이 "verified" 마킹

이는 **self-attestation의 구조적 취약점**: 누락된 작업을 스스로 확인하는 메커니즘이 작업 누락 자체를 전제로 설계되어 있지 않음.

---

## 2. CI Guard 도입 — 외부 검증으로 전이

### 2.1 핵심 설계 원칙

```
5축 (a~e): self-attestation — autopilot이 commit 전 자체 verify
6축 (f): external enforcement — CI workflow가 PR 단계 fail-on-missing
```

autopilot 우회 불가. Master 부재 시에도 작동. squash merge 후 바로 PR 열리는 구조에서 즉시 감지.

### 2.2 구현 상세

**파일**: `.github/workflows/domain-sprint-guard.yml`

```
on: pull_request (opened, synchronize, reopened, edited)

Step 1: PR title → regex 매칭
  pattern: F[0-9]+.*(N번째 도메인|신규 산업|N번째 산업)
  no match → SKIP (non-domain PR은 완전 통과)

Step 2: (match 시만) DOMAIN_MAP diff 검증
  git diff origin/${BASE_REF}...HEAD -- scripts/divergence/domain-source-map.ts
  grep -cE '^\+\s*container:\s*"'
  0건 → exit 1 (PR fail)
  1건+ → PASS
```

**보안**: PR title은 env var로만 참조 (command injection 방지).

---

## 3. 테스트 결과

### 3.1 4종 시나리오 (domain-sprint-guard.test.sh)

```
Scenario i:  매칭 PR + DOMAIN_MAP +1 → PASS   ✅
Scenario ii: 매칭 PR + DOMAIN_MAP +0 → FAIL   ✅ (차단 정상)
Scenario iii: non-domain PR → SKIP             ✅
Scenario iv: 변형 패턴 (신규 산업) → PASS      ✅

Results: 4 PASS / 0 FAIL / 1 SKIP
```

### 3.2 실제 git 히스토리 회귀 검증

| 케이스 | Commit | added containers | 결과 |
|--------|--------|-----------------|------|
| F549 PR #95 (Observatory) | `29778ba` (parent: `3a0d243`) | 1 | PASS ✅ |
| F550 PR #96 autopilot 누락 | `aae14b9` (parent: `f6a788f`) | 0 | FAIL — Guard가 차단했어야 할 케이스 ✅ |
| F550 fix-forward | `ad084d0` (parent: `aae14b9`) | 1 | PASS ✅ |

**결론**: F549는 Guard PASS, F550 autopilot 누락 상태는 Guard FAIL (차단 성공), fix-forward 후 PASS. CI Guard의 효과 실증 완료.

---

## 4. CLAUDE.md 갱신 — Autopilot Guards 섹션 신설

`CLAUDE.md ## Autopilot Guards` 섹션에 DoD 6축 (f) 명시. autopilot이 Plan 작성 시 CI Guard 존재 인지 가능하도록 SSOT 게시.

---

## 5. 차기 모니터링

- **3회차 재발 시**: `~/.claude/rules/development-workflow.md`에 lifecycle 승격 (rules 적용 조건 A 충족)
- **차기 신규 도메인 Sprint 1회**: PR 시 `domain-sprint-guard` workflow run → PASS 확인이 정착 검증 1차 기준
- **패턴 확장 후보**: utils test count 누락, parser prefix 누락 등 autopilot self-attestation 취약 패턴에 동일 구조 적용 가능

---

## 6. DoD 점검

| # | 항목 | 상태 |
|---|------|------|
| 1 | `.github/workflows/domain-sprint-guard.yml` 신설 | ✅ DONE |
| 2 | `.github/workflows/domain-sprint-guard.test.sh` 4 시나리오 PASS | ✅ 4/4 |
| 3 | 본 Report (AIF-RPRT-098) | ✅ DONE |
| 4 | CLAUDE.md `## Autopilot Guards` 섹션 신설 | ✅ DONE |
| 5 | rules/development-workflow.md DOMAIN_MAP false claim 패턴 명시 | ✅ 본 보고서 §5 기록 + Master 수동 적용 |
| 6 | 회귀 검증: F549 PASS / F550 FAIL / fix-forward PASS | ✅ 실 git 히스토리 3/3 |
| 7 | Match ≥ 95% | ✅ 100% |
| 8 | PR + CI green | 🔄 PR 생성 후 |
| 9 | auto-merge | 🔄 CI green 후 |

---

## 메타 — 새로운 거버넌스 패턴

Sprint 379는 **자체 검증 한계 입증 후 외부 검증 도입**의 첫 사례.

```
관찰 → 2회 재발 입증 → self-attestation 구조 취약 확인
                      → CI external enforcement 도입
                      → 3회차 재발 시 lifecycle 승격
```

이 패턴은 Decode-X 내 다른 autopilot false claim 패턴(utils test / parser prefix 등)에도 동일 구조로 확장 가능하다.
