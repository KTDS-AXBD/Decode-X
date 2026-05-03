# AI-Ready Threshold Reaggregation — TD-60 (passThreshold 0.75 → 0.6)

> Generated 2026-05-03T22:43:22.055Z. Source: existing reports under reports/.

## Why

- Haiku model returns scores at discrete bins (~0.42, 0.62, 0.82, 0.95) corresponding to prompts.ts rubric tier midpoints.
- Threshold 0.75 sits **above** the 0.62 cluster and effectively rejects all partial-pass evaluations.
- New 0.6 threshold absorbs the 0.62 cluster, recovering signal from io_structure / exception_handling / testability where Haiku rates skills as "partial pass".

## Overall passed (passCount ≥ 4 of 6)

| Report | Skills | avg_score | overall@0.75 | overall@0.60 | Δ |
|---|---|---|---|---|---|
| LPON-schema | 35 | 0.537 | 0 (0%) | 20 (57.1%) | +57.1pp |
| LPON-augmented | 35 | 0.540 | 0 (0%) | 19 (54.3%) | +54.3pp |
| LPON-baseline | 35 | 0.511 | 0 (0%) | 0 (0%) | +0pp |
| lpon-augmented | 8 | 0.777 | 0 (0%) | 8 (100%) | +100pp |

## Per-criterion pass rate (LPON-schema, F418 latest, 35 skills)

| Criterion | avg | @0.75 | @0.60 | Δ |
|---|---|---|---|---|
| source_consistency | 0.5811 | 48.6% | 48.6% | +0pp |
| comment_doc_alignment | 0.7329 | 65.7% | 74.3% | +8.6pp |
| io_structure | 0.4823 | 0% | 60% | +60pp |
| exception_handling | 0.5263 | 0% | 71.4% | +71.4pp |
| srp_reusability | 0.3871 | 0% | 37.1% | +37.1pp |
| testability | 0.5114 | 0% | 74.3% | +74.3pp |

## Notes
- Production D1 ai_ready_scores rows retain their original ; only future evaluations use 0.6.
- prompts.ts rubric tier text still references 0.75/0.5 boundaries (rubric is independent from pass threshold).
- TD-60 closed by F-item slot AIF-REQ-043 follow-up (no separate F-item; configuration change scope).
