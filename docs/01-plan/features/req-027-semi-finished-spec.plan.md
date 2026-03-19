---
code: AIF-PLAN-027
title: "반제품 스펙 포맷 정의 및 파일럿 생성"
version: "1.0"
status: Active
category: PLAN
created: 2026-03-19
updated: 2026-03-19
author: Sinclair Seo
feature: req-027-semi-finished-spec
refs: "[[AIF-REQ-027]] [[반제품-스펙/prd-final.md]]"
---

# 반제품 스펙 포맷 정의 및 파일럿 생성

> **Summary**: AI Foundry 역공학 결과물을 AI Agent가 바로 구현 가능한 6개 스펙 문서로 변환하는 포맷을 정의하고, 파일럿 1건으로 Working Version 생성을 검증한다.
>
> **Project**: AI Foundry
> **Version**: v0.6.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-19
> **Status**: Active

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | AI Foundry의 역공학 결과물(policies 3,675, skills 26, ontologies 848)이 축적되어 있으나, 이를 하나의 시스템으로 만들 수 있는 통합 스펙으로 조립하는 포맷과 수준 기준이 없음. 사람이 맞고 틀리고를 판단할 수 없고, AI Agent가 바로 구현할 수도 없는 상태 |
| **Solution** | 6개 스펙 문서(비즈니스 로직 명세, 데이터 모델, 기능 정의서, 아키텍처 정의서, API 명세, 화면 정의) 포맷을 정의하고, LPON 온누리상품권 '결제 취소' 플로우를 파일럿으로 실제 작성 + Claude Code Working Version 생성 검증 |
| **Function/UX Effect** | 본부장이 스펙을 읽고 비즈니스 룰의 정확성을 판단 가능. Claude Code에 스펙을 입력하면 핵심 로직이 실동작하는 웹/앱이 생성됨 |
| **Core Value** | "과거의 지식을 미래의 코드로" — 역공학 결과물이 단순 분석 보고서가 아니라, 실제 시스템 생성의 입력이 되는 구조 완성 |

---

## 1. Overview

### 1.1 Purpose

AI Foundry 5-Stage 파이프라인의 역공학 결과물(policies, ontologies, skills, structure)을 **AI Agent(Claude Code)가 바로 시스템을 만들 수 있는 수준의 개발 스펙**으로 재구성하는 포맷을 정의한다. 동시에 **사람(의사결정권자)이 읽고 정확성을 판단**할 수 있는 상세도를 갖춘다.

### 1.2 Background

- **현재 상태**: 역공학 결과물이 개별적으로 존재(policies: condition-criteria-outcome 트리플, ontologies: SKOS/JSON-LD, skills: .skill.json) 하지만 통합 스펙으로 조립되지 않음
- **동기**: 본부장(의사결정권자)이 역공학 결과물의 스펙 수준을 직접 확인하고자 함
- **PRD**: `반제품-스펙/prd-final.md` (3라운드 AI 검토 완료, ChatGPT+DeepSeek Conditional→확정)
- **상위 연결**: AIF-REQ-026(Foundry-X 통합)과 연계 — 반제품 스펙이 Foundry-X Working Prototype 포맷의 기반

### 1.3 Related Documents

- PRD: `반제품-스펙/prd-final.md`
- 인터뷰 로그: `반제품-스펙/interview-log.md`
- AI 검토: `반제품-스펙/review/round-1~3/`
- Foundry-X 통합: [[AIF-PLAN-026]]
- PRD/TDS: `docs/AI_Foundry_PRD_TDS_v0.7.4.docx`

---

## 2. Scope

### 2.1 In Scope

- [ ] **Phase A: 스펙 포맷 정의** — 6개 문서의 포맷, Acceptance Criteria, 샘플 템플릿 확정
- [ ] **Phase B: 파일럿 스펙 작성** — LPON 온누리상품권 대표 플로우 1건(결제 취소)에 대해 6개 문서 실작성
  - [ ] B-1: 비즈니스 로직 명세 (policies → 시나리오별 When/If/Then/Else)
  - [ ] B-2: 데이터 모델 명세 (ontologies → CREATE TABLE SQL + ERD)
  - [ ] B-3: 기능 정의서 (skills → 입력/출력/플로우/에러)
  - [ ] B-4: 아키텍처 정의서 (레이어/모듈/인증/비기능)
  - [ ] B-5: API 명세 (엔드포인트/스키마/에러코드)
  - [ ] B-6: 화면 정의 (와이어프레임/플로우) — 후순위
- [ ] **Phase C: Working Version 생성 검증** — 작성된 스펙을 Claude Code에 입력하여 실동작 확인
  - [ ] C-1: Claude Code에 스펙 입력 → 코드 자동 생성
  - [ ] C-2: 핵심 비즈니스 로직 실동작 확인
  - [ ] C-3: 자동화 테스트(유닛/시나리오) 생성 및 통과율 측정
- [ ] **Phase D: 검증 결과 보고** — 본부장 리뷰용 보고서 작성

### 2.2 Out of Scope

- 반제품 스펙 **자동 생성 엔진** 구현 (후속 과제)
- 특정 기술 스택 종속 (스펙은 스택 중립)
- 프로덕션 배포 파이프라인
- UI/UX 상세 디자인 (화면은 와이어프레임까지)
- 전체 도메인 스펙 작성 (파일럿 1건만)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 비즈니스 로직 명세: 모든 정책은 시나리오별 전제조건/조건/처리/예외/데이터영향/엣지케이스를 표 형식으로 포함 | High | Pending |
| FR-02 | 데이터 모델 명세: CREATE TABLE SQL + 비즈니스 의미 주석 + FK/인덱스 + Mermaid ERD | High | Pending |
| FR-03 | 기능 정의서: 입력/출력/검증규칙/처리플로우/에러케이스를 기능 단위로 기술 | High | Pending |
| FR-04 | 아키텍처 정의서: 레이어 구성, 인증/권한 매트릭스, 비기능 요구사항 수치 | Medium | Pending |
| FR-05 | API 명세: 엔드포인트/메서드/JSON Schema 요청·응답/에러코드 | Medium | Pending |
| FR-06 | 화면 정의: 주요 화면 와이어프레임 + 상태 전이 다이어그램 | Low | Pending |
| FR-07 | 모든 문서에 상호 참조 ID (BL-NNN, FN-NNN, API-NNN) 부여 | High | Pending |
| FR-08 | Claude Code 입력 시 Working Version 자동 생성 성공 | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 가독성 | 본부장이 체크리스트 기반으로 맞다/틀리다 판단 가능 | 본부장 리뷰 피드백 |
| AI 파싱 가능성 | Claude Code가 Markdown 표/코드블록을 정확히 해석 | Working Version 생성 성공 여부 |
| 정량 명확성 | 모호한 단어('적절히', '예외적으로') 사용 금지, 모든 조건 정량화 | 자동 검색으로 모호 표현 0건 |
| 스택 중립성 | 특정 프레임워크/DB에 종속되지 않는 스펙 | 별도 스택으로 구현 가능 여부 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 파일럿 도메인(LPON 결제 취소)에 대해 6개 문서 완성
- [ ] Claude Code에 스펙 입력 → 핵심 로직 실동작하는 Working Version 생성
- [ ] 자동화 테스트 통과율 ≥ 80%
- [ ] 본부장 리뷰 후 Go 판정

### 4.2 Quality Criteria

- [ ] 비즈니스 로직 커버리지 ≥ 80% (원본 산출물 대비)
- [ ] 사람 개입 횟수 ≤ 10회 (Working Version 생성 시)
- [ ] 모호 표현 0건 (자동 검색 검증)
- [ ] 문서 간 참조 무결성 (BL→FN→API 크로스 레퍼런스)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| AI Agent가 복잡한 비즈니스 로직(트랜잭션, 예외처리)을 구현 못함 | High | High | Human-in-the-loop 보완 기준 사전 정의. 실패 영역 문서화. 스텁코드 제공 |
| 원본 산출물(LPON) 품질 부족으로 스펙화 불가 | High | Medium | 불완전 산출물은 파일럿 제외, 샘플/가상 데이터로 대체 테스트 |
| "구현 가능한 수준"의 주관적 해석 차이 | Medium | High | Acceptance Criteria + 샘플 + 본부장 체크리스트로 객관화 |
| 스펙 작성이 원본 분석보다 더 오래 걸림 | Medium | Medium | 파일럿 범위를 단일 플로우로 축소, 시간 제한(1주) 설정 |
| 검증 순환 의존 (스펙↔구현 상호 의존) | Medium | Low | 원본 시스템 동작을 ground truth로 설정, 비교 검증 |

---

## 6. Implementation Plan

### 6.1 Phase A: 스펙 포맷 확정 (Day 1)

1. PRD의 6개 문서 포맷/Acceptance Criteria를 최종 확정
2. 본부장용 검증 체크리스트 작성
3. 파일럿 도메인/플로우 확정 (LPON 결제 취소)

**산출물**: `반제품-스펙/templates/` — 6개 문서 빈 템플릿 + 체크리스트

### 6.2 Phase B: 파일럿 스펙 작성 (Day 2-4)

**입력 소스**:
- AI Foundry D1: `db-policy` (LPON policies), `db-ontology` (LPON terms/ontologies), `db-skill` (LPON skills)
- R2: `skill-packages/` (bundled skill JSON)
- 원본 산출물: LPON 온누리상품권 관련 문서 (85/88 parsed)

**작성 순서** (의존 관계 기반):
```
1. 비즈니스 로직 명세 (독립 — policies에서 직접 추출)
   ↓
2. 데이터 모델 명세 (비즈니스 로직의 데이터 영향 참조)
   ↓
3. 기능 정의서 (비즈니스 로직 + 데이터 모델 결합)
   ↓
4. 아키텍처 정의서 (기능 구성에서 도출)
   ↓
5. API 명세 (기능 → 엔드포인트 매핑)
   ↓
6. 화면 정의 (기능 플로우 시각화)
```

**산출물**: `반제품-스펙/pilot-lpon-cancel/` — 6개 스펙 문서

### 6.3 Phase C: Working Version 생성 검증 (Day 5-6)

1. 6개 스펙 문서를 Claude Code 프롬프트로 구성
2. Claude Code에 입력하여 Working Version 자동 생성
3. 생성된 코드에 대해:
   - 핵심 비즈니스 로직 수동 검증 (결제 취소 플로우)
   - 자동화 테스트(Vitest) 생성 및 실행
   - 테스트 통과율, 에러율 측정
4. 실패 시 스펙 보완 → 재생성 (최대 3회 루프)

**산출물**: Working Version 코드 + 테스트 결과 리포트

### 6.4 Phase D: 검증 결과 보고 (Day 7)

1. 전체 과정 보고서 작성 (스펙 품질, AI 생성 결과, 한계점)
2. 본부장 리뷰 미팅 자료 준비
3. Go/No-Go 판단 근거 정리

**산출물**: `반제품-스펙/report.md`

---

## 7. Technical Approach

### 7.1 파일럿 도메인 선택: LPON 온누리상품권

| 기준 | LPON | 퇴직연금 | 선택 |
|------|------|----------|:----:|
| 데이터 규모 | policies 848, terms 7,332, skills 11 | policies 2,827, terms 1,441 | - |
| 도메인 복잡도 | 중간 (상품권 발행/결제/취소) | 높음 (금융 규제) | - |
| 산출물 완성도 | 85/88 parsed (96.6%) | 13/15 parsed (86.7%) | - |
| FactCheck 커버리지 | 31.2% | 미측정 | - |
| **선택** | **O** | | **LPON** |

**이유**: 중간 복잡도 + 높은 파싱률 + 실데이터 축적이 파일럿에 적합

### 7.2 파일럿 플로우: 결제 취소

LPON 온누리상품권의 "결제 취소" 플로우를 선택:
- 시작 이벤트: 사용자 결제 취소 요청
- 종료 이벤트: 환불 완료 또는 거부
- 관련 policies: 결제/취소/환불 관련 정책 추출
- 관련 엔티티: 결제(payment), 상품권(voucher), 사용자(user), 가맹점(merchant)

### 7.3 스펙 → Claude Code 입력 전략

```
[Step 1] CLAUDE.md에 프로젝트 컨텍스트 설정
  - 도메인 설명 + 아키텍처 정의서 요약

[Step 2] 비즈니스 로직 명세를 rules/ 폴더에 배치
  - Claude Code가 자동 참조

[Step 3] 데이터 모델 명세를 migrations/ 폴더에 배치
  - CREATE TABLE SQL 그대로 활용

[Step 4] 기능 정의서 + API 명세를 프롬프트로 전달
  - "이 기능 정의에 따라 API 핸들러를 구현해줘"

[Step 5] 자동 테스트 생성
  - "비즈니스 로직 명세의 엣지 케이스를 테스트로 작성해줘"
```

---

## 8. Next Steps

1. [ ] Phase A 착수: 스펙 포맷 확정 + 파일럿 범위 합의
2. [ ] LPON 결제 취소 관련 policies/ontologies/skills 데이터 추출
3. [ ] 비즈니스 로직 명세 작성 (Phase B-1)
4. [ ] Design 문서 작성 (`/pdca design req-027-semi-finished-spec`)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-19 | 초안 작성 (PRD final 기반, 3라운드 AI 검토 반영) | Sinclair Seo |
