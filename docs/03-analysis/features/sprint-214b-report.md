# Sprint 214b Report — Track A Fill: 결제 + 환불

**Sprint**: 214b
**REQ**: AIF-REQ-035 Phase 2 D2
**완료일**: 2026-04-20
**Match Rate**: 100% (36/36 파일)

---

## 1. 요약

lpon-payment + lpon-refund 두 Spec Container를 lpon-charge 패턴에 맞춰 완성.
결제/환불 도메인의 [미정의] BL 10건을 Empty Slot으로 명시화하고 규칙/테스트/운영가이드를 Fill.

---

## 2. 구현 결과

### lpon-payment
| 항목 | 결과 |
|------|------|
| provenance.yaml | ✅ sInput: 0.87 |
| payment-rules.md | ✅ BL-013~019 (7개) |
| Empty Slots | ✅ 5개 (ES-PAYMENT-001~005) |
| Runbooks | ✅ 5개 |
| Tests | ✅ 5개 ES yaml + 1 contract (6개 시나리오) |

### lpon-refund
| 항목 | 결과 |
|------|------|
| provenance.yaml | ✅ sInput: 0.83 |
| refund-rules.md | ✅ BL-020~030 (11개) |
| Empty Slots | ✅ 5개 (ES-REFUND-001~005) |
| Runbooks | ✅ 5개 |
| Tests | ✅ 5개 ES yaml + 1 contract (6개 시나리오) |

---

## 3. KPI 달성

| KPI | 기준 | 결과 |
|-----|------|------|
| 완결성 (Design vs Impl) | 100% | ✅ 100% (36/36) |
| AI-Ready (condition/criteria/outcome) | ≥70% | ✅ 100% (10/10 ES) |
| 출처 추적성 | 100% | ✅ 100% (전체 BL 소스 연결) |

---

## 4. 주요 Empty Slot 의사결정

| ES | 핵심 결정 | 비고 |
|----|-----------|------|
| ES-PAYMENT-001 | 멱등성: X-Idempotency-Key 기반 중복 방지 | DB 조회 기반, 분산락 불필요 |
| ES-PAYMENT-002 | CARD 재시도: 503/504만, 3회, 지수백오프 | 400계열은 즉시 실패 |
| ES-PAYMENT-003 | MIXED 부분실패: Saga 롤백 + CARD_DANGLING P1 에스컬레이션 | 카드사 청구 위험 |
| ES-PAYMENT-004 | SMS 실패: 결제 성공 유지, best-effort 재발송 | SMS는 부가 서비스 |
| ES-PAYMENT-005 | AP06 실패: 자동 1회 재시도 → P2 에스컬레이션 + 202 반환 | 비동기 처리 |
| ES-REFUND-001 | rfndPsbltyYn: 5개 우선순위 규칙 자동 판정 | 수기 관리 제거 |
| ES-REFUND-002 | 캐시백 대안: 포인트 자동 전환 (1원=1포인트, 1년) | CS 부담 감소 |
| ES-REFUND-003 | 계좌오류: 7일 재등록 대기 후 자동 재처리, 초과 시 CS P2 | SLA 명시 |
| ES-REFUND-004 | 강제환불: ADMIN 권한 + 사유코드 + 1년 이내 + 연 3건 한도 | 감사 5년 보존 |
| ES-REFUND-005 | 제외금액: 캐시백+할인보전+수수료1%+포인트전환액 합산 | 100원 미만 절사 |

---

## 5. Sprint 215 핸드오프 준비

- `lpon-payment/tests/contract/payment-contract.yaml` — 6개 시나리오 (결제/취소 E2E 입력)
- `lpon-refund/tests/contract/refund-contract.yaml` — 6개 시나리오
- FX-SPEC-003 Handoff Contract 준수 (provenance.yaml `extractedBy` 명시)
- Sprint 215: `services/svc-skill/src/routes/handoff.ts` + `packages/utils/src/handoff-adapter.ts`에서 이 Contract 파일을 참조

---

## 6. 미해결 사항

- TD-16 (MyBatis XML 파서): 이번 Sprint 스코프 외 유지. 결제 Fill은 MyBatis 참조 없이 완료됨.
- TD-17/18/19: Phase 3 이관 유지.
- lpon-payment sInput 0.87 / lpon-refund sInput 0.83: [미정의] BL은 ES로 명시화했으나
  외부 API 스펙(AP06, BC카드 MPM) 미확보로 완벽한 sInput 0.95 달성에는 한계.
  Phase 3에서 외부 API 스펙 확보 후 보완 예정.
