---
sprint: 1
task: A-1
title: Plumb E2E 대상 Skill 선정
created: 2026-04-19
---

# Sprint 1 A-1 — 대상 Skill 선정

## 선정 기준 (OD-1: 문서 40% / 테스트 30% / Plumb 30%)

| 기준 | 배점 | 충전-001 평가 |
|------|:---:|:---:|
| 문서 풍부도 (rules/ 커버리지) | 40 | 38 (BL-001~008, 8개 규칙 완비) |
| 테스트 가능성 (정량 조건 수) | 30 | 28 (잔액 비교, 한도 비교 등 수치 조건 다수) |
| Plumb 호환성 (triangle 구성 용이) | 30 | 30 (3자 파일 모두 생성 가능) |
| **합계** | **100** | **96** |

## 선정 결과

| 항목 | 값 |
|------|-----|
| **Skill ID** | `POL-LPON-CHARGE-001` |
| **도메인** | 온누리상품권 (LPON) 충전 (Top-up) |
| **출처** | `반제품-스펙/pilot-lpon-cancel/01-business-logic.md` §시나리오1 |
| **커버 BL** | BL-001, BL-002, BL-003, BL-004, BL-005, BL-006, BL-007, BL-008 |
| **Spec Container 경로** | `.decode-x/spec-containers/lpon-charge/` |

## 선정 근거

1. LPON 충전 시나리오는 비즈니스 룰 8건 완비 (condition/criteria/outcome 3자 구조)
2. 잔액 ≥ 충전금액, 한도 ≤ 충전금액 등 수치 조건이 명확 → 테스트 작성 용이
3. 이미 추출된 반제품-스펙 문서에서 rules/ 직접 생성 가능 (A-2 소요 최소화)
4. 타임아웃 처리(BL-004), 자동충전(BL-008) 등 엣지 케이스 포함 → Triangle 풍부
