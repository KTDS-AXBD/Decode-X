---
id: AIF-RPRT-084
sprint: 286
feature: F452
title: Healthcare 16번째 도메인 신규 — 실행 보고서 (의료 산업, 5 산업 연속 0 ABSENCE)
status: completed
created: 2026-05-09
related_plan: AIF-PLAN-084
match_rate: 95
mode: Master inline
---

# F452 Report — AIF-RPRT-084

## 실행 결과

| # | DoD | 결과 |
|---|-----|------|
| 1 | healthcare.ts source | ✅ ~270 lines, 6 함수 + HealthcareError |
| 2 | spec-container 15 sub-files | ✅ provenance + healthcare-rules + HC-001~006 rules/runbooks (12) + test (1) |
| 3 | DOMAIN_MAP 16번째 entry | ✅ |
| 4 | parser regex HC prefix | ✅ |
| 5 | REGISTRY HC-001~HC-006 매핑 | ✅ withRuleId 14 Sprint 연속 정점 |
| 6 | utils unit test count 75→81 | ✅ expected list +HC × 6 |
| 7 | utils 188/188 PASS (회귀 0) | ✅ |
| 8 | typecheck PASS | ✅ |
| 9 | detect-bl 16 containers | ✅ **81.5% → 82.7%** (+1.2%pp). healthcare 6 BLs, **0 ABSENCE** |
| 10 | write-provenance --apply | ✅ --resolved-by + 0/16 changes |
| 11 | 5 산업 연속 0 ABSENCE 정착 | ✅ CC + DV + SB + IN + HC |
| 12 | Plan + Report + SPEC | ✅ AIF-PLAN-084 + AIF-RPRT-084 |

**DoD 12/12 PASS — Match Rate 95%**

## 핵심 결과

```
=== Multi-Domain BL Detector — 16 containers ===
  ...
  insurance: 6 BLs, 6 applicable detectors, 0 ABSENCE markers
  healthcare: 6 BLs, 6 applicable detectors, 0 ABSENCE markers  ← 16번째 도메인 (의료, 5번째 신규)

Summary: 98 total BLs, 81 detector applications across 16 containers
Detector coverage: 81/98 = 82.7%
```

## ★ 5 신규 산업 도메인 연속 0 ABSENCE 정착

| Sprint | 산업 | ABSENCE | PRESENCE 률 |
|--------|------|---------|-----------|
| S278 (CC) | Credit Card | 2 | 67% |
| S283 (DV) | Delivery | 0 | 100% |
| S284 (SB) | Subscription | 0 | 100% |
| S285 (IN) | Insurance | 0 | 100% |
| **S286 (HC)** | **Healthcare** | **0** | **100%** |

## 누적 효과 (S262~S286, 24 Sprint)

| 지표 | S262 | S278 | **S286** | 증가 |
|------|------|------|----------|------|
| Coverage | 13.2% | 77.0% | **82.7%** | **+69.5%pp** |
| 도메인 수 | 5 | 12 | **16** | **3.2배** |
| BL 수 | 38 | 74 | **98** | **2.6배** |
| Detector 수 | 5 | 51 | **81** | **16.2배** |
| 신규 산업 | 0 | 1 | **5** | — |

## 시간 / 비용

- 작업 소요: ~1.5h (Master inline)
- LLM cost: $0

## 메타 학습

- **5 신규 산업 도메인 연속 0 ABSENCE 정착** (CC + DV + SB + IN + HC)
- **withRuleId 재사용 14 Sprint 연속 정점**
- **CC-005 batch StatusTransition 5번째 재사용** (DV/SB/IN/HC-005)
- **F445 Path B var-vs-var keyword 5번째 활용** (CC/DV/SB/IN/HC-002)
- **6 BLs 균형 패턴 6번째 정착**

## 차기 후보

1. **6번째 신규 산업** — Education / Real Estate / Logistics / Hospitality
2. **Coverage 100% 도전** — 잔여 17건 미감지 분석
3. Phase 4 후속 / 보안 후속 2건
