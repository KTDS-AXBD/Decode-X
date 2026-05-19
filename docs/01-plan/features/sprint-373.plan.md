# Sprint 373 Plan — F545 LB Library 77번째 도메인

**Sprint**: 373  
**F-item**: F545  
**Domain**: LB Library (도서관 산업, 66번째 신규 산업)  
**Session**: 세션 307 후속3  
**Date**: 2026-05-19  

---

## 목표

오프라인 엔터테인먼트 8-클러스터 확장 (AM+TH+KP+AQ+ZO+MS+MV+**LB**).  
📚 **단일 클러스터 8 도메인 첫 사례 마일스톤** + **4 Sprint 연속 첫 사례 마일스톤 달성 경로**.  
withRuleId 78 Sprint 정점 도전 (신규 detector 0개, 거울 변환 30회차 round 마일스톤).

---

## 도메인 비즈니스 룰 (LB-001 ~ LB-006)

도서관 도메인의 핵심 차별성: **대출/반납 atomic + 연체료 정책** (과거 오프라인 엔터 도메인들과 달리 반납/overdue fee 개념 존재).

| ID | 함수 | detector | 설명 |
|----|------|----------|------|
| LB-001 | `borrowBook` | ThresholdCheck (Path A var-vs-UPPERCASE) | 도서관별 동시 대출 한도 검증 |
| LB-002 | `applyMemberLimit` | ThresholdCheck (Path B var-vs-var, limit keyword) | 회원 일일 대출 한도 비교 |
| LB-003 | `processBookEntry` | AtomicTransaction | 도서 대출 atomic — loans + books 상태전환 + loan_payments |
| LB-004 | `transitionLoanStatus` | StatusTransition | 대출 상태 전환 (active → returned / overdue / cancelled) |
| LB-005 | `expireOverdueLoanBatch` | StatusTransition (batch) | overdue loan 일괄 만료 처리 |
| LB-006 | `processOverdueRefund` | AtomicTransaction | 연체료 환불 atomic |

---

## 구현 파일 목록

| 파일 | 신규/수정 | 설명 |
|------|-----------|------|
| `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/library.ts` | 신규 | LB-001~LB-006 구현 (305줄) |
| `.decode-x/spec-containers/library/rules/library-rules.md` | 신규 | 비즈니스 룰 명세 |
| `.decode-x/spec-containers/library/tests/LB-001.yaml` | 신규 | 테스트 시나리오 |
| `.decode-x/spec-containers/library/provenance.yaml` | 신규 | 출처 메타데이터 |
| `scripts/divergence/domain-source-map.ts` | 수정 | DOMAIN_MAP LB 항목 추가 |
| `packages/utils/src/divergence/bl-detector.ts` | 수정 | LB-001~LB-006 Registry 항목 추가 |
| `packages/utils/test/bl-detector.test.ts` | 수정 | LB 도메인 테스트 케이스 추가 (S372 DoD 패턴) |

---

## DoD (Definition of Done)

1. `library.ts` 305줄 ± 20줄, 6 함수 + LibraryError 완성
2. spec-container 3 파일 (rules.md + LB-001.yaml + provenance.yaml)
3. `BL_DETECTOR_REGISTRY` LB-001~LB-006 6 entries 추가
4. `DOMAIN_MAP` library 항목 추가
5. `pnpm typecheck` PASS (turbo cache 우회 직접 tsc 실행)
6. `detect-bl --all-domains` 실행 — LB 6 containers 전부 PRESENCE (0 ABSENCE)
7. **utils test 보강** (S372 DoD 패턴): `bl-detector.test.ts`에 LB-001~LB-006 테스트 케이스 추가, `pnpm test` PASS
8. git commit + push (sprint/373 브랜치)
