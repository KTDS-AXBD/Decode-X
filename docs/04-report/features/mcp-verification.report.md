---
code: AIF-RPRT-028
title: Foundry-X MCP 통합 Phase 1-1 PoC 완료 보고서
version: 1.0
status: Active
category: RPRT
created: 2026-03-19
updated: 2026-03-19
author: Sinclair Seo
related: AIF-REQ-026, AIF-ANLS-026
---

# Foundry-X MCP 통합 Phase 1-1 PoC 완료 보고서

## Executive Summary

| 항목 | 값 |
|------|-----|
| **Feature** | MCP 검증 (AIF-REQ-026 Phase 1-1) |
| **기간** | 2026-03-18 ~ 2026-03-19 (세션 173) |
| **소요** | 1 세션 |
| **Match Rate** | 94% → 100% (R2 해소 후) |

### 결과 요약

| 지표 | 값 |
|------|-----|
| Match Rate | 94% (설계 현행화 후) → 100% (R2 해소) |
| 구현 항목 | 8 / 8 (요구사항 5 + 통합 포인트 3) |
| 변경 파일 | 8 (양쪽 리포) |
| 변경 라인 | +520 |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | AI Foundry의 848개 정책 Skill 자산이 Foundry-X 에이전트에서 사용 불가 — 두 시스템이 격리 |
| **Solution** | MCP 프로토콜 기반 양방향 연동 — Foundry-X McpServerRegistry에 AI Foundry Skill 등록 → tools/call 왕복 |
| **Function UX Effect** | Foundry-X 에이전트가 `pol-pension-ct-406` 등 848개 정책 도구를 직접 호출하여 비즈니스 룰 판정 가능 |
| **Core Value** | 역공학(AI Foundry)으로 추출한 도메인 지식이 순공학(Foundry-X) 에이전트의 판단 근거로 즉시 활용 — "과거의 지식 → 미래의 코드" 파이프라인 실증 |

---

## 1. 배경 및 목표

### 1.1 배경
AI Foundry(v0.6)는 SI 산출물에서 848개 정책을 추출하여 12개 Skill 번들로 패키징했으나, 이 자산은 AI Foundry 내부에서만 사용 가능했어요. Foundry-X(v1.3)는 에이전트 협업 플랫폼이지만 AI Foundry의 도메인 지식에 접근할 수 없었어요.

### 1.2 목표
AIF-ANLS-026의 "Phase 1: MCP 연동" 실증 — AI Foundry MCP 서버를 Foundry-X에 등록하고, 에이전트가 정책 도구를 호출하여 비즈니스 룰 평가 결과를 받는 전체 왕복을 검증.

---

## 2. 구현 내역

### 2.1 AI Foundry 측

| 파일 | 변경 | 설명 |
|------|------|------|
| `packages/types/src/mcp-shared.ts` | 신규 | 공유 타입 4종 (McpTool, McpAdapterResponse, PolicyEvalResult, McpServerRegistration) — Zod 스키마 + TS 타입 |
| `packages/types/src/index.ts` | 수정 | mcp-shared export 추가 |
| `scripts/rebundle-production.ts` | 수정 | R2 업로드 `--env production` → `--remote` 수정 |
| `docs/03-analysis/AIF-ANLS-026_...md` | 수정 | Phase 1 로드맵 현행화 (완료 항목 체크, resources/sampling → Phase 2 이동) |
| `SPEC.md` | 수정 | AIF-REQ-026 상태 OPEN → IN_PROGRESS |

### 2.2 Foundry-X 측

| 파일 | 변경 | 설명 |
|------|------|------|
| `packages/shared/src/agent.ts` | 수정 | AifMcpAdapterResponse, AifMcpTool, AifPolicyEvalResult 타입 추가 |
| `packages/shared/src/index.ts` | 수정 | AI Foundry 타입 export |
| `packages/api/src/services/mcp-transport.ts` | 수정 | HttpTransport에 `Accept: application/json, text/event-stream` 헤더 추가 |
| `scripts/test-aif-mcp-roundtrip.sh` | 신규 | 9단계 왕복 검증 스크립트 (Phase A 직접 4 + Phase B FX 경유 5) |
| `scripts/bulk-register-aif-mcp.sh` | 신규 | 다중 skill 일괄 등록 (--org, --dry-run, --cleanup) |

### 2.3 인프라 작업

| 작업 | 설명 |
|------|------|
| LPON rebundle | 848 정책 → 12 번들 (sinclairseo 토큰, `--remote` R2 업로드) |
| svc-skill-production 재배포 | R2 바인딩 최신화 |
| MCP adapter 12/12 검증 | 848 MCP tools 정상 동작 |

---

## 3. 검증 결과

### 3.1 왕복 테스트 (9/9 PASS)

| # | 단계 | 결과 |
|---|------|:----:|
| A1 | AI Foundry MCP Health | ✅ |
| A2 | MCP initialize (protocolVersion 2024-11-05) | ✅ |
| A3 | MCP tools/list (정책 도구 발견) | ✅ |
| A4 | MCP tools/call (정책 평가 → 판정+근거+신뢰도) | ✅ |
| B1 | Foundry-X API Health | ✅ |
| B2 | Foundry-X에 AI Foundry MCP 서버 등록 | ✅ |
| B3 | 연결 테스트 (tools/list 캐싱) | ✅ |
| B4 | 도구 목록 캐시 조회 | ✅ |
| B5 | 서버 정리 (삭제) | ✅ |

### 3.2 Bundled Skills MCP (12/12 PASS)

| 카테고리 | 도구 수 | 상태 |
|---------|:-------:|:----:|
| security | 245 | ✅ |
| operation | 171 | ✅ |
| member | 149 | ✅ |
| notification | 92 | ✅ |
| integration | 49 | ✅ |
| settlement | 38 | ✅ |
| other | 26 | ✅ |
| payment | 23 | ✅ |
| withdrawal | 19 | ✅ |
| gift | 17 | ✅ |
| account | 17 | ✅ |
| charging | 2 | ✅ |
| **합계** | **848** | **12/12** |

### 3.3 Gap Analysis 이력

| 회차 | Match Rate | 주요 Gap | 조치 |
|:----:|:----------:|---------|------|
| 1차 | 63% | shared-types 미생성, resources/sampling 미구현 | — |
| 2차 | 80% | bulk-register 미구현, R2 미실행 | shared-types 생성 + 설계 현행화 |
| 3차 | 94% | R2 재실행 대기 | bulk-register 구현 |
| 최종 | 100% | — | R2 `--remote` 수정 + rebundle 재실행 |

---

## 4. 발견 및 학습

### 4.1 근본 원인 체인 (R2 업로드 이슈)

```
wrangler r2 object put --env production
  → Resource location: local (원격 아님!)
    → 로컬 miniflare R2에만 저장
      → rebundle cleanup이 /tmp 파일 truncate
        → 로컬/원격 모두 빈 파일
```

**해결**: `--env production` → `--remote`로 변경. `wrangler r2`는 D1과 달리 `--env`만으로 원격 접근되지 않아요.

### 4.2 계정 불일치

| 리소스 | 계정 |
|--------|------|
| Workers/R2 (배포 대상) | sinclairseo (IDEA on Action, `02ae9a2b...`) |
| 환경변수 CLOUDFLARE_API_TOKEN | ktds.axbd (`b6c06059...`) |
| .env 파일 | sinclairseo (올바른 토큰) |

셸 환경변수가 `.env`보다 우선하여 잘못된 계정으로 R2 접근. AIF-REQ-020(계정 이전) 완료 시 해소 예정.

### 4.3 MCP Streamable HTTP 호환성

Foundry-X의 `HttpTransport`에 `Accept: application/json, text/event-stream` 헤더가 없어서 AI Foundry MCP 서버가 `Not Acceptable` 에러를 반환. MCP SDK 1.26+의 Streamable HTTP 프로토콜 요구사항.

### 4.4 wrangler 로컬 캐시 함정

`.wrangler/state/v3/r2/` 디렉토리에 로컬 R2 데이터가 남아있으면, `wrangler r2 object get`이 로컬 파일을 반환하여 "원격에 있는 것처럼" 보여요. 디버깅 시 로컬 캐시 삭제 후 확인 필수.

---

## 5. 후속 작업 (Phase 1-2)

| 항목 | 우선순위 | 설명 |
|------|:--------:|------|
| Miraeasset rebundle | P1 | 3,065 draft → bundled (같은 `--remote` 스크립트) |
| Foundry-X 에이전트 연동 | P1 | AgentRunner가 AIF MCP 도구를 자동 선택·호출 |
| MCP Resources | P2 | AIF 서버에 Skill 정책을 리소스로 노출 |
| MCP Sampling | P2 | FX sampling ↔ AIF 평가 E2E 검증 |
| 계정 통합 | P0 | AIF-REQ-020 완료 시 R2/D1 계정 불일치 해소 |
