# Sprint 214b Plan — Track A Fill: 결제 + 환불

**Sprint**: 214b
**REQ**: AIF-REQ-035 Phase 2 D2
**작성일**: 2026-04-20
**상태**: IN_PROGRESS

---

## 1. 목표

lpon-payment(결제/결제취소) + lpon-refund(환불신청/환불승인) Spec Container를
lpon-charge 패턴에 맞춰 생성한다. Sprint 215 E2E Handoff의 핵심 입력이므로
214a/214c보다 우선 merge.

## 2. 범위

### In Scope
- `.decode-x/spec-containers/lpon-payment/` 신규 생성
  - `provenance.yaml`, `rules/payment-rules.md`, `rules/ES-PAYMENT-*.md` (5개)
  - `runbooks/ES-PAYMENT-*.md` (5개)
  - `tests/ES-PAYMENT-*.yaml` (5개), `tests/contract/payment-contract.yaml`
- `.decode-x/spec-containers/lpon-refund/` 신규 생성
  - `provenance.yaml`, `rules/refund-rules.md`, `rules/ES-REFUND-*.md` (5개)
  - `runbooks/ES-REFUND-*.md` (5개)
  - `tests/ES-REFUND-*.yaml` (5개), `tests/contract/refund-contract.yaml`

### Out of Scope
- TD-16 (MyBatis XML 파서) — 이번 Sprint 스코프 외. TD 유지.
- TD-17/18/19 — 이번 Sprint 스코프 외

## 3. 소스 근거

| 소스 | 경로 | 도메인 |
|------|------|--------|
| TypeScript 소스 (결제) | `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/payment.ts` | FN-003, BL-013~019 |
| TypeScript 소스 (환불) | `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/refund.ts` | FN-005, BL-020~030 |
| 비즈니스 룰 | `반제품-스펙/pilot-lpon-cancel/working-version/rules/business-logic.md` | BL-013~032 |
| API 명세 | `반제품-스펙/pilot-lpon-cancel/working-version/docs/api.md` | API-020, API-023, API-030~034 |
| 기능 정의서 | `반제품-스펙/pilot-lpon-cancel/working-version/docs/functions.md` | FN-003~006 |

## 4. KPI

| 지표 | 기준 |
|------|------|
| 완결성 | ≥ 95% (각 Container, provenance.yaml sInput 기준) |
| AI-Ready | 6기준 ≥ 70% (condition/criteria/outcome/exception + test + provenance) |
| 출처 추적성 | 100% (모든 BL에 소스 문서 + 섹션 연결) |

## 5. 의존성

- Sprint 214b merge → Sprint 215 (E2E Handoff 어댑터) 입력
- 214a, 214c와 병렬 (파일 충돌 없음)
