# Sprint 216 Report — Working Prototype 데이터 동작 검증 하네스

**Sprint**: 216
**REQ**: AIF-REQ-035 Phase 2 F
**작성일**: 2026-04-20
**상태**: DONE

---

## 1. 결과 요약

| 지표 | 기준 | 실제 |
|------|------|------|
| 구현 서비스 round-trip 일치율 | ≥90% | **91.7%** ✅ |
| Gap 분석 Match Rate | ≥90% | **98%** ✅ |
| 타입체크 / 린트 | pass | ✅ pass |
| 실패 케이스 원인 분석 | 100% | ✅ (전 실패건 원인코드 기재) |

## 2. 구현 내용

### Track B — Round-trip 검증 하네스
- `scripts/roundtrip-verify/` 신규 생성 (5 TypeScript 파일)
- 28개 계약 시나리오 실행 → 12개 구현 서비스 중 11개 통과 (91.7%)
- 16개는 Working Prototype 미구현 서비스(UNSUPPORTED_WHEN)

### Track A — Spec Fill 가시화
- `apps/app-web/src/pages/poc-phase-2-report.tsx` 신규
- `/poc-phase-2` 라우트 등록
- Phase 2 KPI 대시보드 (Track A Fill + Track B round-trip)

## 3. 주요 발견 (Finding)

| # | 발견 | 유형 | 의미 |
|---|------|------|------|
| F1 | TC-REFUND-002 실패: BL-024(7일 초과 환불 거부) 코드 미구현 | SOURCE_MISSING | 소스에 기간 체크 로직 없음 — 추후 구현 필요 |
| F2 | Payment error code 불일치: MERCHANT_INACTIVE↔E409-MS 등 | DIVERGENCE | Spec 비즈니스 코드 vs 구현 에러 코드 차이 |
| F3 | 구현 범위: 결제/취소/환불만 Working Prototype 존재 | SCOPE_GAP | budget/charge/purchase/gift/settlement 미구현 |

## 4. 의존성

- Sprint 214b (lpon-payment/refund Spec Container) ✅
- Sprint 215 (Handoff Adapter) ✅

## 5. 다음 단계

- AIF-REQ-035 Phase 2 G: BL-024 기간 체크 구현 + TC-REFUND-002 통과
- Working Prototype에 budget/charge/purchase 추가 시 전체 일치율 상승
- `/poc-phase-2` UI를 Foundry-X 핸드오프 대시보드에 연결
