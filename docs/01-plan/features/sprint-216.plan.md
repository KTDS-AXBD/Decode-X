# Sprint 216 Plan — Working Prototype 데이터 동작 검증 하네스

**Sprint**: 216
**REQ**: AIF-REQ-035 Phase 2 F
**작성일**: 2026-04-20
**상태**: IN_PROGRESS

---

## 1. 목표

Working Prototype(pilot-lpon-cancel)이 Spec Container 계약 테스트를 실제로 통과하는지
round-trip 일치율로 측정한다. KPI: **round-trip 일치율 ≥90%**.

## 2. 범위

### In Scope
- `scripts/roundtrip-verify/` (신규)
  - `index.ts` — CLI 진입점 (glob spec-containers → run → report)
  - `runner.ts` — 도메인 함수 직접 호출 실행기
  - `comparator.ts` — then 절 비교 + 원인 분류
  - `fixtures.ts` — SQLite in-memory DB 시나리오별 픽스처 세팅
  - `types.ts` — 공유 타입
  - `package.json`, `tsconfig.json`
- `apps/app-web/src/pages/poc-phase-2-report.tsx` (신규)
  - Phase 2 KPI 대시보드 (Track A Fill 진행 + Track B round-trip 결과)
  - 실패 케이스 원인 분석 테이블
- `apps/app-web/src/data/poc-phase-2-report-data.ts` (신규)
  — 리포트 페이지용 정적 데이터 (roundtrip 검증 결과 스냅샷)
- React Router 라우트 등록 (`/poc-phase-2`)

### Out of Scope
- 실제 HTTP 서버 기동 (도메인 함수 직접 import 방식 채택)
- 외부 API 연동 (mockCardApi/mockNotificationService 사용)
- CI 자동 실행 (scripts/ 수동 실행 스크립트)

## 3. 구현 접근 — 도메인 함수 직접 임포트

```
spec-containers/*/tests/contract/*.yaml
         ↓ 파싱
runner.ts: processPayment(db, scenario.given) 직접 호출
         ↓ 결과
comparator.ts: actual vs scenario.then 비교
         ↓
report: 일치율 + 실패 원인 분류
```

도메인 함수 경로: `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/`
- `payment.ts` → `processPayment()`
- `refund.ts` → `processRefund()`
- `charging.ts` → `processCharging()`

## 4. KPI

| 지표 | 기준 |
|------|------|
| round-trip 일치율 | ≥90% |
| 실패 케이스 원인 분석 | 100% (각 실패에 원인 코드 기재) |
| 대상 계약 테스트 수 | lpon-payment + lpon-refund (contract/*.yaml) |

## 5. 파일 매핑

| Worker | 파일 | 작업 |
|--------|------|------|
| A | `scripts/roundtrip-verify/types.ts` | 공유 타입 정의 |
| A | `scripts/roundtrip-verify/fixtures.ts` | SQLite 픽스처 |
| A | `scripts/roundtrip-verify/comparator.ts` | then 절 비교기 |
| A | `scripts/roundtrip-verify/runner.ts` | 도메인 함수 실행기 |
| A | `scripts/roundtrip-verify/index.ts` | CLI 진입점 |
| A | `scripts/roundtrip-verify/package.json` | 패키지 설정 |
| A | `scripts/roundtrip-verify/tsconfig.json` | TS 설정 |
| B | `apps/app-web/src/data/poc-phase-2-report-data.ts` | 리포트 데이터 |
| B | `apps/app-web/src/pages/poc-phase-2-report.tsx` | Phase 2 리포트 페이지 |
| B | `apps/app-web/src/App.tsx` | 라우트 등록 |

## 6. 의존성

- Sprint 214b (lpon-payment/lpon-refund Spec Container) ✅ MERGED
- Sprint 215 (Handoff Adapter) ✅ MERGED
- pilot-lpon-cancel working-version 도메인 코드 존재 ✅
