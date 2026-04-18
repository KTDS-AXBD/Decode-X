---
sprint: 1
task: B-2
title: Input Completeness Score (S_input) — 충전 서비스
created: 2026-04-19
formula-ref: PRD §2.5.3
---

# Sprint 1 B-2 — Input Completeness Score

## 공식 (§2.5.3)

```
S_input = w_rules × C_rules + w_tests × C_tests + w_provenance × C_provenance
        = 0.40 × C_rules + 0.30 × C_tests + 0.30 × C_provenance
```

## 측정 결과 (POL-LPON-CHARGE-001)

| 컴포넌트 | 가중치 | 값 | 기여 |
|----------|:------:|:--:|:----:|
| C_rules (규칙 커버리지) | 0.40 | 0.92 | 0.368 |
| C_tests (테스트 커버리지) | 0.30 | 0.78 | 0.234 |
| C_provenance (출처 연결) | 0.30 | 1.00 | 0.300 |
| **S_input** | | | **0.902** |

## 판정

- S_input = **0.902 ≥ 0.75** → **Deficiency Flag: OFF** (통과)
- 기준: S_input < 0.75 시 Deficiency Flag 설정

## 세부 측정 근거

### C_rules = 0.92
- BL-001 ~ BL-008: 8/8 규칙 condition-criteria-outcome 3자 구조 완비 (+0.92)
- 기술 명세(technicalSpec) 미존재 (-0.08): API 파라미터 스펙 누락

### C_tests = 0.78
- TC-CHARGE-001 ~ TC-CHARGE-006: 6개 시나리오 (정상 2 + 예외 3 + 엣지 1)
- 커버되지 않은 시나리오: 포인트 충전(BL-007) 상세, 수기처리 에스컬레이션
- 예상 총 시나리오 수: 7.7 → 6/7.7 = 0.779

### C_provenance = 1.00
- 출처 문서 링크: `반제품-스펙/pilot-lpon-cancel/01-business-logic.md` ✅
- AI Foundry 정책 DB 연결: ✅
- 추출 신뢰도(confidence): 0.92 ✅

## 보강 계획 (Sprint 2)
- `반제품-스펙/pilot-lpon-cancel/05-api.md` 연결 → C_rules 0.92 → 0.98
- TC-CHARGE-007 (포인트 충전) + TC-CHARGE-008 (수기처리) 추가 → C_tests 0.78 → 0.91
- 목표 S_input: 0.95+
