---
id: AXBD-PLAN-sprint-245
title: "Sprint 245 — F414 TD-56 fix: Queue burst LLM HTML 응답 차단 해소"
sprint: 245
f_items: [F414]
status: PLANNED
created: "2026-05-03"
author: "Sprint Autopilot"
---

# Sprint 245 Plan — F414 (TD-56 fix)

## 1. 목표

Queue burst 환경에서 LLM 호출 시 HTML index 페이지가 반환되는 문제를 3계층 방어로 해소한다.

**근본 원인 (확정)**: Queue concurrency 10 × 8 messages × 6 LLM criteria = 최대 480개 연속 subrequest → CF Workers subrequest 50개 한도 압박 + OpenRouter burst rate limit → HTML 에러 페이지 반환 → JSON parse crash (`SyntaxError: Unexpected token '<', "<!DOCTYPE..."`)

**증빙**: lpon-charge single evaluate 2회 정상(totalScore 0.54/0.443) vs lpon 8 batch 48/48 fail (avg_score=0) — burst 환경에서만 재현됨.

## 2. 범위

| 파일 | 변경 유형 | 설명 |
|---|---|---|
| `services/svc-skill/wrangler.toml` | 설정 변경 | `max_concurrency` 10→3 (staging+production 양쪽) |
| `services/svc-skill/src/ai-ready/evaluator.ts` | 로직 변경 | `Promise.all` → sequential `for...of` 루프 |
| `packages/utils/src/llm-client.ts` | 기능 추가 | content-type HTML guard + retry(2회) + exponential backoff |
| `packages/utils/src/llm-client.test.ts` | 테스트 추가 | HTML guard unit test |

## 3. 3 Step 매트릭스

| Step | 조치 | 효과 | 리스크 |
|---|---|---|---|
| **S1** wrangler throttle | `max_concurrency` 10→3 | Queue 동시 처리 Worker 3개로 제한. 8 messages = 최대 3×6=18 동시 LLM | R1: 5,154 전수 배치 처리 시간 3.3배 증가 (현 scope는 lpon 8건, 수용 가능) |
| **S2** sequential criteria | `Promise.all` → sequential | Worker당 6 LLM 호출이 순차 → subrequest 폭발 억제 | R2: 단건 evaluate 시간 6배 증가(~60s→~360s). UI force=true 빈도 낮음으로 수용 가능 |
| **S3** retry + HTML guard | content-type check + 2회 retry + backoff | HTML 응답 즉시 감지 후 재시도. 일시적 rate limit 우회 | R3: retry 시 총 비용 최대 3배. avg_score 의미 있는 경우에만 재시도 |

## 4. concurrency 비교 분석

| 설정 | Queue burst 시 동시 LLM | 처리 안전성 |
|---|---|---|
| current: concurrency=10, parallel | 10×6=60 동시 (subrequest 50 초과 ❌) | FAIL |
| S1만: concurrency=3 | 3×6=18 동시 | 개선 |
| S1+S2: concurrency=3, sequential | 최대 3 동시 (1 Worker당 1 LLM) | ✅ 안전 |
| S1+S2+S3: +retry | 일시 실패 시 자동 복구 | ✅ 최적 |

## 5. retry policy 결정 트리

```
LLM 응답 수신
├─ response.ok = false → 기존 throw (HTTP 오류)
├─ content-type: text/html → HTML guard 발동
│   ├─ attempt < 3 → backoff(1s×2^attempt) 후 재시도
│   └─ attempt = 3 → throw Error("LLM returned HTML, max retries exceeded")
├─ JSON parse 실패 → throw (기존 동작 유지)
└─ 정상 JSON → 반환
```

## 6. DoD (완료 기준)

- [ ] wrangler.toml staging+production `max_concurrency` = 3
- [ ] evaluator.ts `runSixCriteriaEvaluation` sequential 실행
- [ ] llm-client.ts HTML guard + 2회 retry
- [ ] llm-client.test.ts content-type guard unit test PASS
- [ ] `pnpm typecheck && pnpm test` 전체 통과
- [ ] lpon 8건 batch 재실행 LLM 48/48 SUCCESS (avg_score > 0)
- [ ] Master smoke 1회 PASS (HTTP 200 + totalScore > 0)
- [ ] Match Rate ≥ 90%

## 7. 의존성

- 없음 (TD-55 R2 누락 fix와 독립적)
- F415(TD-55)와 병렬 진행 가능 (Sprint 246)
- F416(F412 재시도)은 본 Sprint MERGED 후 진행

## 8. 예상 소요 시간

| 단계 | 예상 |
|---|---|
| Plan/Design | 0.5h |
| Implement (3 Step) | 2h |
| 검증 (typecheck/test) | 0.5h |
| lpon batch 재실행 + DoD 검증 | 2h |
| **합계** | ~5h |
