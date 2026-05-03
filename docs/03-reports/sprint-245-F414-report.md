---
id: AXBD-RPRT-sprint-245
title: "Sprint 245 Report — F414 TD-56 fix: Queue burst LLM HTML 응답 차단 해소"
sprint: 245
f_items: [F414]
status: DONE
match_rate: 92
created: "2026-05-03"
author: "Sprint Autopilot"
---

# Sprint 245 Report — F414 (TD-56 fix)

## 요약

Queue burst 환경에서 LLM이 HTML index 페이지를 반환하는 문제를 3계층 방어로 해소했다.
Sprint 244 F412 PARTIAL_FAIL의 직접 원인(LLM 48/48 fail, avg_score=0)이 본 Sprint에서 코드 레벨 수정 완료.

## 구현 결과

| Step | 변경 파일 | 내용 | 상태 |
|---|---|---|---|
| S1 wrangler throttle | `services/svc-skill/wrangler.toml` | `max_concurrency` 10→3 (staging+production) | ✅ |
| S2 sequential criteria | `services/svc-skill/src/ai-ready/evaluator.ts` | `Promise.all` → sequential `for...of` | ✅ |
| S3 HTML guard + retry | `packages/utils/src/llm-client.ts` | content-type guard + 2회 retry + exponential backoff | ✅ |
| 테스트 | `packages/utils/src/llm-client.test.ts` | HTML guard 4 unit test 케이스 추가 | ✅ |

## 검증 결과

| 항목 | 결과 |
|---|---|
| `pnpm typecheck` | ✅ 14/14 PASS |
| `pnpm test` (전체 모노레포) | ✅ 416(svc-skill) + 72(utils) PASS |
| lpon 8건 batch 재실행 | ⏳ 배포 후 진행 (F416 재시도 Sprint 247) |
| Master smoke | ⏳ 배포 후 진행 |

## Match Rate

**92%** — 코드 구현 9/9 항목 완료. 배포 후 DoD 2건(lpon batch, Master smoke)은 F416 Sprint 247에서 달성.

## 트레이드오프 / 잔여 리스크

| ID | 내용 |
|---|---|
| R1 (수용) | max_concurrency=3 → 대규모 배치 처리 속도 3.3배 감소. 현 scope(lpon 8건) 무관. F356-B 운영 시점 재평가 |
| R2 (수용) | sequential 6 criteria → 단건 evaluate ~360s. UI force=true 빈도 낮음 |
| R3 (수용) | HTML guard retry 시 최대 3배 비용. 정상 환경에서 retry 0회 |

## 학습 / 교훈

- **optional chaining 방어**: `response.headers?.get()` — Fetch mock이 완전한 Response 객체가 아닐 때를 대비해 optional chaining 필수. 테스트에서 발견.
- **HTML guard 위치**: `response.ok` 체크보다 content-type 체크가 앞에 있어야 함. Gateway가 HTTP 200으로 HTML을 반환할 수 있음.
- **3계층 방어의 가치**: 각 계층이 독립적으로 방어. S1만으로도 크게 개선되나 S2+S3 추가로 일시적 rate limit 우회까지 커버.

## 다음 단계

1. **CI/CD deploy** — main merge 후 자동 배포
2. **production smoke** — `curl https://svc-skill.ktds-axbd.workers.dev/health` + evaluate 1건
3. **F416 Sprint 247** — lpon 8건 batch 재실행 (TD-55/56 모두 MERGED 후) → F412 DoD 완주
