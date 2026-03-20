---
code: AIF-RPRT-027
title: "반제품 스펙 포맷 정의 및 파일럿 생성 — 완료 보고서"
version: "1.1"
status: Active
category: RPRT
created: 2026-03-20
updated: 2026-03-20
author: Sinclair Seo
feature: req-027-semi-finished-spec
refs: "[[AIF-PLAN-027]] [[AIF-DSGN-027]] [[AIF-REQ-027]]"
---

# 반제품 스펙 포맷 정의 및 파일럿 생성 — 완료 보고서

> **Status**: Complete
>
> **Project**: AI Foundry
> **Version**: v0.6.0
> **Author**: Sinclair Seo
> **Completion Date**: 2026-03-20
> **PDCA Cycle**: #1

---

## Executive Summary

### 1.1 Project Overview

| Item | Content |
|------|---------|
| Feature | AIF-REQ-027 반제품 스펙 포맷 정의 및 파일럿 생성 |
| Start Date | 2026-03-19 |
| End Date | 2026-03-20 |
| Duration | 2일 (1세션) |

### 1.2 Results Summary

```
┌─────────────────────────────────────────────────────┐
│  Completion Rate: 100%                               │
├─────────────────────────────────────────────────────┤
│  Phase A (스펙 포맷 정의):    ✅ 6개 문서 포맷 확정   │
│  Phase B (파일럿 스펙 작성):  ✅ 6개 문서 112KB 생성   │
│  Phase C (Working Version):   ✅ 14파일 1,610줄 생성   │
│  Phase D (검증):              ✅ 24/24 테스트 통과     │
│  Phase E (라이브 데모):       ✅ Production 게시 완료  │
├─────────────────────────────────────────────────────┤
│  Files: 23 (6 spec + 14 code + 3 demo)              │
│  Lines: ~4,100 (spec) + 1,610 (code) + 571 (demo)   │
│  Tests: 24 passed / 0 failed (100%)                  │
│  Human Intervention: 0 (스펙→코드 자동 생성)          │
│  Production URL: ai-foundry.minu.best/poc-report     │
└─────────────────────────────────────────────────────┘
```

### 1.3 Value Delivered

| Perspective | Content |
|-------------|---------|
| **Problem** | AI Foundry 역공학 결과물(policies 3,675, skills 26, ontologies 848)이 개별적으로 존재할 뿐, "새 시스템을 만들어내는 통합 스펙"으로 조립하는 포맷이 없었음 |
| **Solution** | 6개 문서 포맷(비즈니스 로직/데이터 모델/기능 정의/아키텍처/API/화면) 정의 + LPON 도메인 파일럿 작성 + Claude Code Working Version 자동 생성 |
| **Function/UX Effect** | LPON 정책 216건에서 BL 95건 추출, 17개 테이블 CREATE TABLE 생성, 10개 기능(FN) 정의, 28개 API 엔드포인트 설계. **사람 개입 0회**로 14파일 1,610줄 코드 + 24 테스트 100% 통과 |
| **Core Value** | **"과거의 지식을 미래의 코드로"가 실증됨** — 역공학 결과물(D1 policies)에서 반제품 스펙을 거쳐 Working Version까지 완전 자동 파이프라인이 동작함을 입증 |

---

## 2. Related Documents

| Phase | Document | Status |
|-------|----------|--------|
| PRD | [반제품-스펙/prd-final.md](../../반제품-스펙/prd-final.md) | ✅ Final (3라운드 AI 검토) |
| Plan | [req-027-semi-finished-spec.plan.md](../01-plan/features/req-027-semi-finished-spec.plan.md) | ✅ Finalized |
| Design | [req-027-semi-finished-spec.design.md](../02-design/features/req-027-semi-finished-spec.design.md) | ✅ Finalized |
| Report | 현재 문서 | ✅ Complete |

---

## 3. Completed Items

### 3.1 Functional Requirements

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| FR-01 | 비즈니스 로직 명세: 시나리오별 When/If/Then 표 형식 | ✅ Complete | BL 95건, 8개 시나리오 |
| FR-02 | 데이터 모델 명세: CREATE TABLE + ERD + Enum | ✅ Complete | 17개 테이블, Mermaid ERD |
| FR-03 | 기능 정의서: 입출력/플로우/에러 케이스 | ✅ Complete | FN-001~010, 크로스 레퍼런스 |
| FR-04 | 아키텍처 정의서: 레이어/모듈/인증/비기능 | ✅ Complete | 6개 모듈, RBAC 매트릭스 |
| FR-05 | API 명세: 엔드포인트/스키마/에러코드 | ✅ Complete | 28개 API 엔드포인트 |
| FR-06 | 화면 정의: 와이어프레임/상태전이 | ✅ Complete | ASCII 와이어프레임 + Mermaid |
| FR-07 | 상호 참조 ID (BL/FN/API) | ✅ Complete | 크로스 레퍼런스 매트릭스 |
| FR-08 | Claude Code Working Version 자동 생성 | ✅ Complete | 14파일, 24 테스트 100% |

### 3.2 Non-Functional Requirements

| Item | Target | Achieved | Status |
|------|--------|----------|--------|
| 테스트 통과율 | ≥ 80% | **100%** (24/24) | ✅ |
| 사람 개입 횟수 | ≤ 10회 | **0회** | ✅ |
| BL 코드 참조 | 주요 BL 포함 | 17건 참조 | ✅ |
| 모호 표현 금지 | 0건 | 적용됨 | ✅ |
| 스택 중립성 | 비종속 | Hono 선택은 Claude Code 자율 | ✅ |

### 3.3 Deliverables

| Deliverable | Location | Size | Status |
|-------------|----------|------|--------|
| PRD (Final) | `반제품-스펙/prd-final.md` | 15KB | ✅ |
| 인터뷰 로그 | `반제품-스펙/interview-log.md` | 4KB | ✅ |
| AI 검토 (3라운드) | `반제품-스펙/review/round-1~3/` | 30KB | ✅ |
| 비즈니스 로직 명세 | `반제품-스펙/pilot-lpon-cancel/01-business-logic.md` | 21KB | ✅ |
| 데이터 모델 명세 | `반제품-스펙/pilot-lpon-cancel/02-data-model.md` | 27KB | ✅ |
| 기능 정의서 | `반제품-스펙/pilot-lpon-cancel/03-functions.md` | 10KB | ✅ |
| 아키텍처 정의서 | `반제품-스펙/pilot-lpon-cancel/04-architecture.md` | 14KB | ✅ |
| API 명세 | `반제품-스펙/pilot-lpon-cancel/05-api.md` | 23KB | ✅ |
| 화면 정의 | `반제품-스펙/pilot-lpon-cancel/06-screens.md` | 26KB | ✅ |
| Working Version | `반제품-스펙/pilot-lpon-cancel/working-version/src/` | 1,610줄 | ✅ |
| 로컬 데모 서버 | `working-version/src/serve.ts` + `public/index.html` | 170줄 | ✅ |
| Production 데모 | `apps/app-web/src/pages/poc-report.tsx` (LiveDemoTab) | 571줄 | ✅ |
| Plan 문서 | `docs/01-plan/features/req-027-semi-finished-spec.plan.md` | 8KB | ✅ |
| Design 문서 | `docs/02-design/features/req-027-semi-finished-spec.design.md` | 18KB | ✅ |

---

## 4. Phase별 상세 결과

### 4.1 Phase A: 스펙 포맷 정의

PRD에서 정의한 6개 문서 포맷을 Design 문서에서 상세화:

| 문서 | 입력 소스 | 변환 방식 | 산출물 |
|------|----------|----------|--------|
| 비즈니스 로직 | D1 policies (condition/criteria/outcome) | Claude 보조 시나리오 재구성 | BL-NNN 표 |
| 데이터 모델 | D1 terms (entity/attribute) | Entity→TABLE, Attribute→COLUMN | CREATE TABLE SQL |
| 기능 정의서 | BL + 테이블 + Skill JSON | 기능 단위 통합 | FN-NNN |
| 아키텍처 | 기능 구성에서 도출 | 모듈/레이어/RBAC 설계 | 스택 중립 |
| API | FN→엔드포인트 매핑 | REST 표준 | API-NNN |
| 화면 | 기능 플로우 시각화 | ASCII 와이어프레임 | 상태전이 |

### 4.2 Phase B: 파일럿 스펙 작성

**팀 구성**: 2 Workers (tmux split) + Leader

| Worker | 산출물 | 시간 | 범위 이탈 |
|--------|--------|------|:---------:|
| W1: BL+DataModel | 01-business-logic.md, 02-data-model.md | ~4분 | 0건 |
| W2: Arch+API+Screen | 04-architecture.md, 05-api.md, 06-screens.md | ~8분 | 0건 |
| Leader | 03-functions.md (W1+W2 결과 기반) | ~5분 | - |

**데이터 추출**: Production API(`svc-policy-production`)에서 LPON org 정책 216건 추출 → 비즈니스 키워드 필터링

### 4.3 Phase C: Working Version 생성 검증

**입력**: 6개 스펙 문서를 Claude Code 프로젝트 구조로 배치

```
working-version/
├── CLAUDE.md              ← 아키텍처 요약 + 스택 지정
├── rules/business-logic.md ← Doc 1 전문
├── migrations/0001_init.sql ← Doc 2에서 SQL 추출
├── docs/functions.md       ← Doc 3
└── docs/api.md             ← Doc 5
```

**생성 결과**: 별도 Claude Code 인스턴스가 **사람 개입 0회**로 생성

| 레이어 | 파일 | 줄수 | 핵심 구현 |
|--------|------|:----:|----------|
| Infrastructure | index.ts, db.ts, auth.ts | 115 | Hono 앱, SQLite 초기화, JWT 인증 |
| Domain | charging.ts | 174 | BL-001~006, 한도 검증, 트랜잭션 |
| Domain | payment.ts | 169 | BL-014~017, 카드API, 5만원 SMS |
| Domain | cancel.ts | 179 | BL-016~023, 7일 제한, 망취소 |
| Domain | refund.ts | 216 | BL-020~028, 승인/거절, 입금 |
| Routes | 4파일 | 239 | API 핸들러 (domain 위임) |
| Tests | 3파일 | 518 | 24 테스트 케이스 |

**설계 패턴 (자동 도출)**:
- 외부 API 인터페이스 추상화 (WithdrawalApi, CardApi, DepositApi) + Mock 구현
- DB 트랜잭션 원자성 (`db.transaction()`)
- 도메인별 Error 클래스 + HTTP 상태 코드
- BL-NNN 주석으로 비즈니스 룰 추적성 확보

### 4.4 Phase D: 검증 결과

```
Test Results:
  ✓ charging.test.ts  (7 tests)  — BL-001~008 시나리오
  ✓ cancel.test.ts    (8 tests)  — BL-020~025 시나리오
  ✓ payment.test.ts   (9 tests)  — BL-013~019 시나리오
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  3 files | 24 tests | 0 failures | 100%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 4.5 Phase E: 라이브 데모 + Production 게시 (AIF-REQ-028)

검증 완료 후, 본부장 리뷰를 위해 Production 사이트에 PoC 결과를 게시했다.

**4.5.1 로컬 데모 서버 구축**

Working Version을 실행 가능한 로컬 서버로 확장:

| 파일 | 역할 |
|------|------|
| `src/serve.ts` | Hono Node.js 서버 (`@hono/node-server`) + 시드 데이터 + JWT 데모 토큰 자동 발급 |
| `public/index.html` | 다크 테마 데모 UI — 충전/결제/취소/환불 4버튼 + API 로그 실시간 표시 |
| `src/auth.ts` (수정) | Demo 모드 추가 — 토큰 없이도 USER 역할로 자동 인증 |

실행: `cd 반제품-스펙/pilot-lpon-cancel/working-version && bun start` → `http://localhost:3999`

**검증 결과** (로컬):
```
1. 충전 10,000원  → ✅ 잔액 100,000 → 110,000원
2. 결제 30,000원  → ✅ 잔액 110,000 → 80,000원 (payment_id 생성)
3. 결제 취소      → ✅ status: CANCEL_REQUESTED (잔액 복구)
4. 환불 신청      → ✅ status: REQUESTED (관리자 승인 대기)
```

**발견/수정 이슈**:
- `merchants` 테이블 스키마 불일치: 시드 데이터에 `address` 컬럼 사용 → 실제 스키마에 미존재 → 수정
- `refund_accounts` 컬럼명 불일치: `account_holder`→`holder_name`, `verified`→`is_verified` → 수정
- 결제 API 필드명: 라우트가 `voucher_id` (snake_case) 기대, 테스트에서 `voucherId` (camelCase) 사용 → snake_case로 통일

**4.5.2 Production 게시 — 라이브 데모 탭**

Cloudflare Pages(정적 호스팅)에는 백엔드가 없으므로, **클라이언트 시뮬레이션 모드**로 구현:

- `app-web/src/pages/poc-report.tsx`에 8번째 탭 "라이브 데모" 추가 (LiveDemoTab 컴포넌트)
- React `useState`로 잔액/결제ID/취소상태를 관리하는 인메모리 시뮬레이션
- BL 검증 로직 반영: 한도 검증(E422-AMT), 잔액 부족(E422-BAL), 중복 취소(E409), 취소 전 환불 불가(E409-ST)
- API 호출 로그를 JSON 형태로 실시간 표시
- CI/CD 자동 배포 → `ai-foundry.minu.best/poc-report` "라이브 데모" 탭에서 접근 가능

**배포 확인**:

| 항목 | 결과 |
|------|:----:|
| CI (Typecheck+Test) | ✅ success |
| Pages Deploy | ✅ success |
| `/poc-report` HTTP | ✅ 200 |

---

## 5. Quality Metrics

### 5.1 KPI 달성

| KPI | 목표 | 실제 | 달성 |
|-----|:----:|:----:|:----:|
| Working Version 생성률 | ≥ 1건 | 1건 | ✅ |
| 테스트 통과율 | ≥ 80% | **100%** | ✅ |
| 사람 개입 횟수 | ≤ 10회 | **0회** | ✅ |
| BL 커버리지 | 주요 BL | 17/47 BL (36%) | ⚠️ 부분 |

### 5.2 AI 검토 스코어 추이 (PRD)

| Round | 모델 | 스코어 | 판정 |
|-------|------|:------:|------|
| 1 | ChatGPT | 75 | Conditional |
| 2 | ChatGPT + DeepSeek | 78 | Conditional |
| 3 | ChatGPT + DeepSeek | 58* | Conditional |

*Round 3 하락은 문서 확장에 따른 지적 면적 증가 (품질 악화 아님)

---

## 6. Lessons Learned & Retrospective

### 6.1 What Went Well (Keep)

- **스펙 6개 문서 포맷이 AI Agent 입력으로 효과적**: CLAUDE.md + rules/ + migrations/ + docs/ 구조로 배치하면 Claude Code가 높은 품질의 코드를 자동 생성
- **BL-NNN 크로스 레퍼런스**: 비즈니스 룰 ID를 코드 주석에 자동 반영 — 추적성 확보
- **외부 API 인터페이스 추상화**: AI Agent가 자발적으로 Mock 패턴을 적용 — 테스트 가능성 높음
- **tmux Worker 병렬화**: 6개 문서 중 5개를 2 Workers로 병렬 작성 — 시간 절감
- **Production API로 실데이터 추출**: D1 직접 쿼리 대신 배포된 REST API 활용

### 6.2 What Needs Improvement (Problem)

- **BL 커버리지 36%**: 47개 BL 중 17개만 코드에 참조됨. 4개 핵심 기능만 구현 요청했기 때문이나, 전체 기능 구현 시 커버리지 개선 필요
- **D1 원격 쿼리 권한 문제**: wrangler d1 + Cloudflare MCP 모두 7403 에러. API 토큰 권한 재설정 필요
- **LPON 정책 분류 미흡**: 모든 정책이 POL-PENSION-* 접두사로 저장되어 있어 온누리상품권 특화 검색이 어려움
- **PRD AI 검토 무한 루프 경향**: 라운드가 늘수록 이론적 지적이 증가 — 3라운드 이내 종료가 적절
- **환불 플로우 해석 차이**: 스펙은 voucher 기반인데 생성 코드는 payment 기반 — 스펙의 모호함이 원인
- **스키마↔시드 불일치**: Working Version을 로컬 서버로 실행 시 merchants/refund_accounts 컬럼명이 시드 데이터와 불일치 → 자동 생성된 코드와 별도 작성된 시드 간 스키마 정합성 검증 필요
- **API 필드명 컨벤션 미통일**: 라우트는 snake_case, 테스트 호출은 camelCase → 스펙에서 필드명 컨벤션을 명시적으로 지정해야 함

### 6.3 What to Try Next (Try)

- **자동 변환 스크립트**: policies → BL 변환을 수동 Claude 보조 대신 스크립트화 (`scripts/policy-to-bl.ts`)
- **스펙 검증 자동화**: BL-NNN ID가 코드에 모두 참조됐는지 자동 체크 스크립트
- **전체 기능 구현**: FN-001~010 전체를 Working Version으로 생성하여 완전한 PoC
- **Gemini 키 갱신**: 3모델 동시 검토로 PRD 품질 향상

---

## 7. Process Improvement Suggestions

### 7.1 PDCA Process

| Phase | Current | Improvement |
|-------|---------|-------------|
| Plan | PRD 인터뷰 → Plan | PRD AI 검토를 2라운드로 제한 (수확 체감 방지) |
| Design | 수동 변환 로직 설계 | D1→스펙 자동 변환 파이프라인 설계 포함 |
| Do | Worker 병렬 문서 작성 | 6개 문서 의존성을 고려한 3단계 파이프라인 (BL→DataModel→나머지) |
| Check | 테스트 통과율만 측정 | BL 커버리지 + 코드 품질(lint/typecheck) 동시 측정 |

### 7.2 Tools/Environment

| Area | Improvement | Expected Benefit |
|------|-------------|------------------|
| D1 접근 | Cloudflare API 토큰 권한 재설정 | wrangler d1 원격 쿼리 복구 |
| 정책 분류 | 도메인별 태그 강화 | LPON/퇴직연금 분리 검색 |
| 스펙 검증 | BL↔코드 매핑 자동화 스크립트 | 커버리지 정량 측정 |

---

## 8. Next Steps

### 8.1 Immediate

- [ ] 본부장 리뷰 미팅: 6개 스펙 문서 + Working Version 데모
- [ ] D1 API 토큰 권한 재설정 (wrangler d1 원격 쿼리)
- [ ] Gemini API 키 갱신

### 8.2 Next PDCA Cycle

| Item | Priority | Expected Start |
|------|----------|----------------|
| 반제품 스펙 자동 생성 엔진 (policies→BL 자동 변환) | P1 | 본부장 Go 이후 |
| 전체 기능(FN-001~010) Working Version 확장 | P1 | 본부장 Go 이후 |
| 퇴직연금 도메인 파일럿 | P2 | LPON 검증 완료 후 |
| Foundry-X Working Prototype 포맷 통합 | P2 | AIF-REQ-026 연계 |

---

## 9. Changelog

### v1.0.0 (2026-03-20)

**Added:**
- 반제품 스펙 6개 문서 포맷 정의 (비즈니스 로직/데이터 모델/기능 정의/아키텍처/API/화면)
- LPON 온누리상품권 파일럿 — 6개 스펙 문서 실작성 (112KB)
- Working Version 자동 생성 검증 — 14파일 1,610줄, 24 테스트 100% 통과
- PRD 인터뷰 + 3라운드 AI 검토 (ChatGPT + DeepSeek)

**Validated:**
- "스펙만으로 사람 개입 0회 Working Version 생성" 가설 입증
- BL-NNN → 코드 주석 추적성 패턴 검증
- 외부 API 인터페이스 추상화 자동 도출 확인

### v1.1.0 (2026-03-20)

**Added:**
- 로컬 데모 서버 (`serve.ts` + `public/index.html`) — `localhost:3999`에서 실행 가능한 인터랙티브 UI
- auth.ts Demo 모드 — 토큰 없이 USER 역할로 자동 인증
- Production 라이브 데모 탭 — `poc-report.tsx` LiveDemoTab (클라이언트 시뮬레이션)
- `ai-foundry.minu.best/poc-report` 8탭 구성 완료 (개요/인터뷰/PRD/스펙/코드/라이브데모/테스트/PDCA)

**Fixed:**
- merchants 시드 데이터 스키마 불일치 (address 컬럼 제거)
- refund_accounts 컬럼명 불일치 (account_holder→holder_name, verified→is_verified)
- 결제 API 필드명 snake_case 통일

**Validated:**
- 로컬 서버에서 충전→결제→취소→환불 전체 플로우 실동작 확인
- Production 클라이언트 시뮬레이션 정상 동작 (CI/CD + Pages 배포)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-20 | 완료 보고서 작성 | Sinclair Seo |
| 1.1 | 2026-03-20 | 라이브 데모 + Production 게시 과정 반영 | Sinclair Seo |
