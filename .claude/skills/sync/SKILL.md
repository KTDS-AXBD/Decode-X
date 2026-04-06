---
name: sync
description: "res-ai-foundry 프로젝트 관리 동기화. SPEC.md 진행상태와 GitHub 이슈/프로젝트 상태를 맞춘다."
argument-hint: "[push|pull|status]"
user-invocable: true
---

# Sync — res-ai-foundry 프로젝트 관리 동기화

> 목적: 코드 동기화(`/git-sync`)와 별개로, **작업 상태/계획**을 문서(SPEC)와 GitHub 쪽에 일치시킨다.

## 서브커맨드
- 인자 없음 / `status`: 현재 동기화 상태 점검
- `push`: 로컬(SPEC 기준) → GitHub 상태 반영
- `pull`: GitHub 상태 → 로컬(SPEC/CHANGELOG) 반영

---

## 공통 선행 체크

```bash
# 현재 브랜치/작업트리
!`git branch --show-current`
!`git status --short`

# 필수 파일 확인
!`test -f SPEC.md && echo OK:SPEC || echo MISSING:SPEC`
!`test -f docs/CHANGELOG.md && echo OK:CHANGELOG || echo MISSING:CHANGELOG`

# GitHub 인증 확인
!`gh auth status`
```

---

## status

### 1) 로컬 기준 상태 요약
- `SPEC.md` §5 Current Status 마지막 업데이트일
- `SPEC.md` §6 Execution Plan 체크박스 현황
- 최근 CHANGELOG 세션 1개

### 2) GitHub 기준 상태 요약
- open issue 수 / open PR 수
- 최근 커밋 5개

```bash
!`gh issue list --repo KTDS-AXBD/Recon-X --state open --limit 20`
!`gh pr list --repo KTDS-AXBD/Recon-X --state open --limit 20`
!`git log --oneline -5`
```

### 3) 판단
- 문서만 앞선 상태 / GitHub만 앞선 상태 / 대체로 동기화됨
- 다음 권장 액션: `/sync push` 또는 `/sync pull`

---

## push (로컬 → GitHub)

로컬에서 정리한 계획/상태를 GitHub 관리 상태에 반영한다.

### 체크리스트
1. SPEC §6의 체크박스/우선순위 최신화
2. CHANGELOG 최신 세션 기록 확인
3. GitHub 이슈 정리
   - 완료 항목 → close
   - 신규 항목 → create
   - 우선순위 변동 → 라벨/코멘트 업데이트

### 실행 가이드

```bash
# 1) Phase 이슈 생성 (템플릿 사용)
gh issue create \
  --repo KTDS-AXBD/Recon-X \
  --template phase.md \
  --title "[Phase A] monorepo 디렉토리 구조 확정"

# 2) Task 이슈 생성 (템플릿 사용)
gh issue create \
  --repo KTDS-AXBD/Recon-X \
  --template task.md \
  --title "[Task] SVC-01 ingestion skeleton 생성"

# 3) 완료 이슈 종료
gh issue close <number> --repo KTDS-AXBD/Recon-X
```

### /sync push 체크리스트 (Issue 템플릿 기반)
- [ ] SPEC §6의 신규 항목을 Phase/Task 이슈로 생성
- [ ] Task 이슈를 상위 Phase 이슈에 링크
- [ ] 완료된 Task/Phase는 close 처리
- [ ] 이슈 상태와 SPEC 체크박스 불일치 없는지 확인

### 출력
- 생성/수정/종료된 이슈 목록
- SPEC 기준으로 아직 미반영된 항목

---

## pull (GitHub → 로컬)

GitHub에서 진행된 변경사항을 로컬 계획 문서에 반영한다.

### 체크리스트
1. 최근 closed/open issue 확인
2. PR 병합 내역 확인
3. SPEC §5/§6 갱신
4. CHANGELOG에 "sync 반영" 1줄 기록(필요 시)

### 실행 가이드

```bash
!`gh issue list --repo KTDS-AXBD/Recon-X --state all --limit 30`
!`gh pr list --repo KTDS-AXBD/Recon-X --state merged --limit 20`
```

반영 규칙:
- 완료된 GitHub 이슈는 SPEC §6 체크박스 반영
- 구조/정책 결정사항은 SPEC §8 Decision Log 반영
- 히스토리성 이벤트는 CHANGELOG에 간단히 기록

---

## 운영 원칙 (통일 톤)

- `/git-sync` = 코드/브랜치 동기화
- `/sync` = 계획/상태/이슈 동기화
- 둘을 섞지 않는다.
- force push / 히스토리 파괴 작업 금지
- 문서 우선순위: PRD > SPEC > CHANGELOG

## Done 기준

아래를 만족하면 동기화 완료로 본다.
- SPEC §5/§6이 현재 GitHub 진행상태와 모순 없음
- 중요한 결정이 SPEC §8 또는 CHANGELOG에 기록됨
- 다음 액션이 1~3개로 명확함
