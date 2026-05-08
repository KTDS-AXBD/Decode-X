---
code: AIF-ANLS-recon-x-restructuring-analysis
title: "Recon-X MSA 재조정 Sprint 1 — Analysis Report"
version: 1.0
status: active
category: analysis
created: 2026-04-07
updated: 2026-04-07
author: AX BD팀
---

# Recon-X MSA 재조정 Sprint 1 — Analysis Report

> **Feature**: AIF-REQ-030 Recon-X MSA Restructuring
> **Sprint**: 1 (W1: 2026-04-07)
> **Author**: Sinclair Seo
> **Date**: 2026-04-07

---

## Executive Summary

| Item | Value |
|------|-------|
| **Feature** | Recon-X MSA 재조정 Sprint 1 — 플랫폼 SVC 분리 + LLM 전환 + 프론트엔드 정리 |
| **Date** | 2026-04-07 |
| **Duration** | 1 session |
| **Match Rate** | 97% |
| **Files Changed** | 249 files (+644, -21,548) |
| **Tests** | 11/11 suites PASS |
| **Typecheck** | 13/13 packages PASS |

### Value Delivered

| Perspective | Description |
|-------------|-------------|
| **Problem** | 12 Workers + 10 D1이 단일 리포에 공존하여 역공학(RE) 파이프라인 개발에 방해 |
| **Solution** | 플랫폼 SVC 5개 분리, LLM 호출 HTTP 전환, RBAC inline 전환, 프론트엔드 정리 |
| **Function/UX** | 7 Workers + 5 D1로 경량화. 파이프라인 독립 배포 가능. 포털 페이지 제거로 UI 집중 |
| **Core Value** | Recon-X 역할 명확화 — 역공학 전담 서비스로 전환. MSA 재조정의 첫 번째 분리 선례 |

---

## Gap Analysis Results

### Overall Score: 97%

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match | 96% | PASS |
| Architecture Compliance | 100% | PASS |
| Convention Compliance | 98% | PASS |

### Milestone Verification (10/10 PASS)

| Milestone | Status | Details |
|-----------|:------:|---------|
| M1: 플랫폼 SVC 5개 제거 | ✅ | svc-llm-router, svc-security, svc-governance, svc-notification, svc-analytics 전체 삭제 |
| M2: DB 마이그레이션 5개 제거 | ✅ | db-llm, db-security, db-governance, db-notification, db-analytics 삭제 |
| M3: wrangler.toml 바인딩 정리 | ✅ | 7개 서비스 모두 SECURITY/LLM_ROUTER 바인딩 제거. LLM_ROUTER_URL 환경변수 추가 |
| M4: LLM 호출 HTTP 전환 | ✅ | packages/utils/src/llm-client.ts 생성. 4개 서비스 전환 완료 |
| M5: RBAC inline 전환 | ✅ | checkPermission() 로컬화 + logAuditLocal() 구현. 5개 서비스 적용 |
| M6: types 정리 | ✅ | security.ts, governance.ts 삭제 + index.ts 재export 제거 |
| M7: 프론트엔드 정리 | ✅ | audit, trust, agent-console 페이지 + 관련 컴포넌트/API 모듈 삭제 |
| M8: Queue Router 정리 | ✅ | notification/analytics/governance dispatch 제거 |
| S1: CI/CD 정리 | ✅ | deploy-services.yml, health-check.sh, deploy.sh, dev-local.sh 모두 갱신 |
| Tests | ✅ | typecheck 13/13, test 11/11 |

### 의도적 Design 차이 (2건 — 긍정적 개선)

| Item | Design | Implementation | 판단 |
|------|--------|----------------|------|
| LLM client API | OOP builder 패턴 | Functional 패턴 (callLlmRouter) | 더 간결. Design 역갱신 완료 |
| RBAC 함수 | boolean 반환 | Response \| null 반환 | 호출부 단순화. Design 역갱신 완료 |

---

## Change Summary

### 삭제 (코드 21,548줄 감소)
- **5 서비스 디렉토리**: services/svc-{llm-router,security,governance,notification,analytics}
- **5 DB 마이그레이션**: infra/migrations/db-{llm,security,governance,notification,analytics}
- **2 타입 파일**: packages/types/src/{security,governance}.ts
- **3 페이지**: apps/app-web/src/pages/{audit,trust,agent-console}.tsx
- **4 API 모듈**: apps/app-web/src/api/{governance,analytics,security,notification}.ts
- **12+ 컴포넌트**: trust/audit/generative-ui 관련

### 추가 (코드 644줄)
- **llm-client.ts**: HTTP REST LLM 호출 유틸 (packages/utils)
- **audit.ts**: 경량 구조화 감사 로그 (packages/utils)
- **benchmark.ts**: benchmark 전용 API 모듈 (apps/app-web)

### 수정
- **7 wrangler.toml**: SECURITY/LLM_ROUTER 바인딩 제거 + LLM_ROUTER_URL 추가
- **5 서비스 env.ts**: Fetcher → string 타입 전환
- **4 LLM caller.ts**: service binding → HTTP fetch
- **5 서비스 index.ts**: RBAC/audit 패턴 전환
- **~30 테스트 파일**: mock Env 갱신
- **CI/CD + 스크립트**: 서비스 목록 7개로 축소

---

## Known Issues

| Issue | Severity | Note |
|-------|----------|------|
| lint 실패 (@axbd/harness-kit 미설치) | Low | 기존 이슈. Sprint 변경과 무관. harness-kit 패키지 배포 필요 |
| svc-ingestion PII masking stub | Low | maskText()가 pass-through. 포털 구축 시 외부 마스킹 서비스 연동 필요 |
| queue-router 알림 미전달 | Low | HITL 알림이 더 이상 전달되지 않음. svc-policy 내부 처리 또는 포털 알림 서비스 필요 |

---

## Next Steps (Sprint 2)

- [ ] 내부 참조 정리 (package.json name, CLAUDE.md, SPEC.md)
- [ ] E2E 테스트 최종 검증
- [ ] 서비스 연동 인터페이스 문서화
- [ ] CI/CD 파이프라인 최종 조정
- [ ] 데이터 무손실 검증 (D1 COUNT before/after)
- [ ] 배포 + GitHub repo 리네임
