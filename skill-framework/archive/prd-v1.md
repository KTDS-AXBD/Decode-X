# Skill Framework PRD

**버전:** v1
**날짜:** 2026-03-20
**작성자:** AX BD팀
**상태:** 🔄 검토 중

---

## 1. 요약 (Executive Summary)

**한 줄 정의:**
Claude Code 스킬을 체계적으로 분류·관리·공유하는 프레임워크를 구축하여, 개인과 팀의 스킬 자산화를 실현한다.

**배경:**
현재 스킬(commands, skills, plugins)이 필요할 때마다 단편적으로 만들어져 약 210+ 자산이 산재해 있다. 무엇이 있는지 파악하기 어렵고, 중복·비일관성이 존재하며, 팀원 간 공유 구조가 없다. Anthropic이 내부에서 수백 개 스킬을 운용하며 축적한 9가지 카테고리 분류 체계와 실전 팁(Gotchas, Progressive Disclosure, 플러그인 마켓플레이스 등)이 공개되어 좋은 참고 모델이 되었다.

**목표:**
모든 스킬 자산을 카테고리별로 정리하고, 신규 스킬 작성 표준을 확립하며, 팀이 카탈로그에서 스킬을 발견·설치·활용할 수 있는 구조를 만든다.

---

## 2. 문제 정의

### 2.1 현재 상태 (As-Is)

- **발견성 부재**: 210+ 스킬이 3개 레벨(user/project/plugin)에 분산. 어떤 스킬이 있는지 전체 파악 불가
- **중복·비일관성**: 비슷한 기능의 스킬이 다른 이름·포맷·품질 수준으로 존재
- **팀 공유 불가**: 개인 환경(~/.claude/)에 묶여 있어 다른 팀원이 접근·활용 불가
- **작성 표준 부재**: 새 스킬 작성 시 가이드라인 없이 자유 형식으로 작성
- **분류 체계 없음**: 카테고리 개념 없이 flat하게 나열

### 2.2 목표 상태 (To-Be)

- **통합 카탈로그**: 모든 scope의 스킬을 하나의 카탈로그에서 조회 가능
- **9+ 카테고리 분류**: Anthropic 체계 기반 + 프로젝트 맞춤 카테고리로 분류 완료
- **품질 표준**: gotchas 섹션, progressive disclosure, description 최적화 등 작성 가이드라인 확립
- **팀 배포**: 플러그인/리포 기반으로 팀원이 설치·사용 가능한 배포 파이프라인
- **측정 가능**: 스킬 사용량 추적 훅으로 효과 측정

### 2.3 시급성

- AI Foundry 프로젝트가 Phase 4를 넘어 Phase 5로 진입하면서 스킬 수가 계속 증가 → 지금 정리하지 않으면 부채 누적
- Anthropic이 실전 노하우를 공개한 시점 — 참고 모델이 구체적이어서 지금 적용하기 좋은 타이밍
- 다음 스프린트 배치 가능 — 타이밍 적합

---

## 3. 사용자 및 이해관계자

### 3.1 주 사용자

| 구분 | 설명 | 주요 니즈 |
|------|------|-----------|
| Sinclair (1차) | 스킬 주 개발자, 현재 210+ 스킬 운영 | 정리·분류·품질 향상, 작업 효율 개선 |
| BD팀원 (2차) | 같은 프로젝트 또는 다른 프로젝트에서 스킬 사용 | 카탈로그에서 필요한 스킬을 찾아 바로 사용 |

### 3.2 이해관계자

| 구분 | 역할 | 영향도 |
|------|------|--------|
| BD팀 리드 | 팀 생산성 향상 판단 | 중간 |
| 프로젝트 참여자 | 스킬 소비자/기여자 | 높음 |

### 3.3 사용 환경

- 기기: PC (WSL/Mac)
- 네트워크: 사내망 + 인터넷
- 기술 수준: 개발자 (Claude Code 사용자)

---

## 4. 기능 범위

### 4.1 핵심 기능 (Must Have)

| # | 기능 | 설명 | 우선순위 |
|---|------|------|----------|
| 1 | **카테고리 분류 체계** | Anthropic 9가지 + 커스텀 카테고리 정의. 각 스킬에 카테고리 태깅 | P0 |
| 2 | **스킬 인벤토리** | user/project/plugin 전체 스킬을 자동 스캔하여 통합 목록 생성 | P0 |
| 3 | **스킬 작성 가이드라인** | gotchas 섹션, progressive disclosure, description 최적화, 폴더 구조 표준 등 | P0 |
| 4 | **스킬 카탈로그 문서** | 카테고리별 스킬 목록 + 설명 + 사용법 + 의존성을 담은 참조 문서 | P0 |

### 4.2 부가 기능 (Should Have)

| # | 기능 | 설명 | 우선순위 |
|---|------|------|----------|
| 5 | **스킬 템플릿** | 카테고리별 스킬 생성 템플릿 (scaffolding). Anthropic 패턴: references/, assets/, scripts/ 폴더 구조 포함 | P1 |
| 6 | **팀 배포 파이프라인** | Git 기반 스킬 공유 + 플러그인 패키징 가이드. sandbox → traction → marketplace 승격 프로세스 | P1 |
| 7 | **사용량 추적 훅** | PreToolUse 훅으로 스킬 트리거 빈도 로깅. 인기 스킬 / 미사용 스킬 식별. ${CLAUDE_PLUGIN_DATA}에 저장 | P1 |
| 8 | **스킬 품질 검증** | 작성 가이드라인 준수 여부 자동 검증 (lint): gotchas 존재, description 트리거 품질, 폴더 구조 등 | P1 |
| 9 | **기존 스킬 리팩토링** | 현 ax-*/프로젝트 스킬을 가이드라인에 맞게 개선 | P1 |
| 10 | **ax-req-manage 인터뷰 보강** | 요구사항 스킬에 인터뷰 절차 통합 | P1 |
| 11 | **On Demand Hooks** | 스킬 호출 시에만 활성화되는 동적 훅. /careful(파괴적 명령 차단), /freeze(특정 디렉토리 외 편집 차단) 등 상황별 가드레일 | P1 |
| 12 | **스킬 조합(Composition)** | 스킬 간 의존성 관리. 다른 스킬을 이름으로 참조하여 조합 사용. 의존성 그래프 시각화 | P1 |
| 13 | **메모리/데이터 저장 표준** | 스킬별 상태 저장 패턴 표준화. 실행 이력 로그(standups.log 패턴), config.json 설정, ${CLAUDE_PLUGIN_DATA} 활용 | P1 |
| 14 | **스크립트 라이브러리** | 스킬에서 공유하는 헬퍼 함수/스크립트 라이브러리. Claude가 보일러플레이트 대신 조합(composition)에 집중하도록 지원 | P1 |

### 4.3 제외 범위 (Out of Scope)

- **bkit 플러그인 내부 수정**: 외부 플러그인이므로 분류·참조만 하고 코드 수정은 하지 않음
- **Claude Code Plugin Marketplace 운영**: 사내 마켓플레이스 인프라 구축은 이번 범위 밖
- **비 Claude Code 도구 통합**: 다른 AI 도구(Cursor, Copilot 등)와의 통합

### 4.4 외부 연동

| 시스템 | 연동 방식 | 필수 여부 |
|--------|-----------|-----------|
| Claude Code Plugin System | 플러그인 설치/검색 | 필수 |
| GitHub (KTDS-AXBD org) | 스킬 배포·공유 리포 | 필수 |
| ~/.claude/ 파일 시스템 | user scope 스킬 스캔 | 필수 |
| .claude/ 프로젝트 로컬 | project scope 스킬 스캔 | 필수 |

---

## 5. 성공 기준

### 5.1 정량 지표 (KPI)

| 지표 | 현재값 | 목표값 | 측정 방법 |
|------|--------|--------|-----------|
| 카테고리 분류 커버리지 | 0% | 100% | 전체 스킬 중 카테고리 태깅 완료 비율 |
| 스킬 중복률 | [미확인] | 0건 | 동일/유사 기능 스킬 수 |
| 팀원 스킬 접근성 | 0명 | BD팀 전원 | 카탈로그 접근 가능 팀원 수 |
| 가이드라인 준수율 | 0% | 신규 스킬 100% | 표준 검증 통과 비율 |

### 5.2 MVP 최소 기준

- [ ] 카테고리 분류 체계 확정 (9+α)
- [ ] 기존 스킬 인벤토리 완료 (user + project scope)
- [ ] 스킬 작성 가이드라인 v1 완성
- [ ] 카탈로그 문서 v1 생성

### 5.3 실패/중단 조건

- 분류 체계가 실제 스킬에 맞지 않아 2회 이상 전면 재설계 필요
- 팀원이 카탈로그를 사용하지 않고 기존 방식(직접 만들기)을 선호

---

## 6. 제약 조건

### 6.1 일정

- 목표 완료일: AI Foundry 다음 스프린트 (스프린트 배치)
- Phase 1 (분류+인벤토리+가이드라인): 1 스프린트
- Phase 2 (배포+추적+리팩토링): 후속 스프린트

### 6.2 기술 스택

- 스킬 포맷: Markdown (SKILL.md) + YAML frontmatter
- 스크립트: Bash, Node.js (mjs)
- 배포: Git (GitHub org) + Claude Code Plugin System
- 검증: Bash/Node 기반 린터

### 6.3 인력/예산

- 투입 가능 인원: 1명 (Sinclair) + Claude Code
- 예산: 추가 비용 없음 (기존 인프라 활용)

### 6.4 컴플라이언스

- KT DS 내부 정책: 코드 외부 공유 시 보안 검토 필요
- 스킬에 시크릿/크레덴셜 포함 금지 (기존 PreToolUse 훅 유지)

---

## 7. 오픈 이슈

| # | 이슈 | 담당 | 마감 |
|---|------|------|------|
| 1 | bkit 188개 스킬의 카테고리 분류를 자동화할 수 있는지 검토 | Sinclair | 스프린트 초 |
| 2 | ax commands(15개)와 ax skills(1개)를 통합할 것인지 별도 관리할 것인지 | Sinclair | 스프린트 초 |
| 3 | 팀 배포 시 Git org repo vs Plugin Marketplace 중 어느 것이 적합한지 | Sinclair | Phase 2 |
| 4 | 스킬 사용량 추적 훅의 데이터 저장 위치 및 포맷 | Sinclair | Phase 2 |
| 5 | ax-req-manage 인터뷰 절차 보강의 구체적 범위 | Sinclair | Phase 1 |

---

## 8. 검토 이력

| 라운드 | 날짜 | 주요 변경사항 | 스코어 |
|--------|------|--------------|--------|
| 초안 | 2026-03-20 | 인터뷰 기반 최초 작성 | - |

---

## 부록: Anthropic 9가지 스킬 카테고리 (참고 모델)

| # | 카테고리 | 설명 | 예시 |
|---|----------|------|------|
| 1 | Library & API Reference | 라이브러리/SDK 올바른 사용법 | billing-lib, frontend-design |
| 2 | Product Verification | 코드 동작 테스트/검증 | signup-flow-driver, checkout-verifier |
| 3 | Data Fetching & Analysis | 데이터/모니터링 연결 | funnel-query, grafana |
| 4 | Business Process & Team Automation | 반복 워크플로우 자동화 | standup-post, weekly-recap |
| 5 | Code Scaffolding & Templates | 보일러플레이트 생성 | new-migration, create-app |
| 6 | Code Quality & Review | 코드 품질 강제/리뷰 | adversarial-review, code-style |
| 7 | CI/CD & Deployment | 코드 배포 자동화 | babysit-pr, deploy-service |
| 8 | Runbooks | 증상 → 조사 → 리포트 | service-debugging, oncall-runner |
| 9 | Infrastructure Operations | 운영/유지보수 절차 | resource-orphans, cost-investigation |

### 핵심 작성 팁 (가이드라인에 반영할 항목)

- **당연한 것은 쓰지 말 것** — Claude의 기본 지식에서 벗어나는 정보에 집중
- **Gotchas 섹션** — 가장 높은 신호 가치, 시간이 지나며 축적
- **파일 시스템과 점진적 공개** — references/, assets/, scripts/ 폴더 활용
- **과도한 제약 금지** — 유연하게 적응할 여지 남기기
- **설정(Setup) 과정** — config.json 패턴, AskUserQuestion 활용
- **Description = 트리거 조건** — 요약이 아니라 "언제 이 스킬을 쓸 것인가"
- **메모리/데이터 저장** — ${CLAUDE_PLUGIN_DATA}에 저장
- **On Demand Hooks** — 스킬 호출 시에만 활성화되는 훅

---

*이 문서는 ax-req-interview 스킬에 의해 자동 생성되었습니다.*
