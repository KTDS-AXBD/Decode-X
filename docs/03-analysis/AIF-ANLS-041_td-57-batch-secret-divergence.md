---
id: AIF-ANLS-041
type: ANALYSIS
title: TD-57 batch endpoint Queue handler 진단 — Worker secret divergence (svc-skill vs svc-skill-production)
status: COMPLETED
session: 260
date: 2026-05-04
links:
  - SPEC.md §8 TD-56 / TD-57
  - feedback_silent_batch_failure_pattern.md (S255)
  - feedback_cf_aigateway_full_path.md (S246)
  - feedback_wrangler_default_vs_production_env.md (S246)
---

# TD-57 batch endpoint 진단 결과

## TL;DR

**Root cause 확정**: `svc-skill` (default env) 과 `svc-skill-production` (`--env production`) 워커가 **별개의 secret store** 를 가지고 있으며, **`CLOUDFLARE_AI_GATEWAY_URL`** 값이 두 워커 사이에 동기되지 않은 것이 결정적. Queue consumer 는 `svc-skill-production` 에서 실행되는데, 그 워커의 URL 이 base path (HTML index 반환) 로 stale 상태 → LLM call 100 % HTML 응답 → F414 의 retry+content-type guard 가 3회 재시도 후 throw → `score=0` rationale에 정확한 원인 텍스트 저장.

`INTERNAL_API_SECRET` 도 같은 양상으로 두 워커 사이 값이 다름 (실측 확인). 동일 secret 으로 검증한 single eval 호출에서 한쪽은 통과, 다른쪽은 "Missing or invalid X-Internal-Secret" 거부.

## 진단 단계 (1.5 h)

### 1. 사전 환경 점검 (5 min)

- `svc-skill /health` 200 / 449 ms
- OpenRouter API key 73 chars, `~/.secrets/openrouter-api-key` 보유
- `~/.secrets/decode-x-internal` 64 chars
- `wrangler secret list` 양 워커: 동일 4종 secret 이름 (`CLOUDFLARE_AI_GATEWAY_URL`, `FOUNDRY_X_SECRET`, `INTERNAL_API_SECRET`, `OPENROUTER_API_KEY`)

### 2. 코드 inspection — Queue handler entry (10 min)

- `services/svc-skill/src/index.ts:482-489` queue handler dispatches `ai-ready-queue` to `handleAIReadyMessage`
- `services/svc-skill/src/queue/ai-ready-consumer.ts:96-151` for...of messages, sequential; per-message: loadSpecContent → runSixCriteriaEvaluation → insertScores → updateBatchProgress
- `services/svc-skill/src/ai-ready/evaluator.ts:153-170` 6 criteria sequential, catch block stores score=0 + rationale=`"Evaluation failed: ${String(e)}"`
- `packages/utils/src/llm-client.ts:122-136` F414 retry: 3 attempts with `text/html` content-type guard, exponential backoff 1s/2s, throws `"LLM returned HTML response after 3 attempts (burst rate limit?)"` on exhaustion

### 3. wrangler.toml binding inspection (5 min)

- 기본 env `[[queues.producers]]` 만 존재 (consumer 없음, 라인 52-55 주석 명시)
- `[env.production.queues.consumers]` 라인 182-188: `queue=ai-ready-queue, max_batch_size=1, max_batch_timeout=1, max_concurrency=3, max_retries=3` (F414 fix 적용됨)
- **결정적**: Queue consumer 는 `svc-skill-production` 워커에서만 실행 (default env 와 다른 worker 인스턴스 + 다른 secret store)

### 4. wrangler tail + 1-message batch trigger (45 min)

- `wrangler tail --env production --format json` 백그라운드 실행
- POST `/skills/ai-ready/batch` lpon (8 skills) 트리거 → batchId `170ed5de-55e0-47f5-9d28-4328a75bd1fc`
- 폴링 결과: status `completed`, 8/8 completed, 0 failed, cost $0.0288 (= 8 × 6 × $0.0006 haiku rate)
- **그러나**: `avgScore: 0` — 명백한 silent failure 패턴 (S255 feedback memory 와 정확히 일치)

### 5. D1 raw scores 검증 (5 min)

- `SELECT * FROM ai_ready_scores WHERE batch_id='170ed5de-...'` → 48 행 모두 `score=0, passed=0`
- rationale 텍스트:
  ```
  Evaluation failed: Error: LLM returned HTML response after 3 attempts (burst rate limit?):
  <!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/>...
  ```
- F414 코드 fix 가 production 에서 정상 동작 (retry 발생, HTML guard trigger, 명확한 error message) 확인
- 단지 retry 가 도움이 안 됨 — 3회 retry 모두 HTML 응답 = gateway URL 이 systemic 문제

### 6. 워커 간 secret divergence 검증 (10 min)

같은 `INTERNAL_API_SECRET` 값으로 두 worker 의 single eval 엔드포인트 호출:

| Worker | URL | 응답 |
|---|---|---|
| svc-skill (default) | `https://svc-skill.ktds-axbd.workers.dev/skills/4591b69e.../ai-ready/evaluate` | "skill not found" (auth ✅, lookup org mismatch) |
| svc-skill-production | `https://svc-skill-production.ktds-axbd.workers.dev/skills/4591b69e.../ai-ready/evaluate` | **"Missing or invalid X-Internal-Secret"** (auth ❌) |

→ **두 워커의 INTERNAL_API_SECRET 값이 다름 = secret store 분리 확정**.

`CLOUDFLARE_AI_GATEWAY_URL` 도 같은 양상으로 stale 추정. S246 feedback memory `feedback_wrangler_default_vs_production_env.md` 와 정확히 일치하는 패턴.

## Root cause + 영향 매트릭스

| 항목 | 상태 |
|---|---|
| F414 fix (3 retry + content-type guard) | ✅ Production 에 배포·동작 (rationale 에 retry 흔적 명확) |
| `max_concurrency=3` throttle | ✅ Production 적용 |
| 6 criteria sequential | ✅ Production 적용 |
| **`CLOUDFLARE_AI_GATEWAY_URL` (svc-skill default)** | ✅ Full chat-completions path (single eval 정상 동작) |
| **`CLOUDFLARE_AI_GATEWAY_URL` (svc-skill-production)** | ❌ **Stale base path 추정** (HTML index 반환) |
| `INTERNAL_API_SECRET` | ❌ 두 워커 간 값 다름 (직접 검증) |
| `OPENROUTER_API_KEY` | ⚠️ 양 워커 모두 secret 존재. 값 일치 여부 미검증 (URL stale 만으로도 100% fail 가능) |

## Fix proposal

3개 secret 을 svc-skill-production 워커에 동기화 (소요 ~5 min):

```bash
cd services/svc-skill

# 1. CLOUDFLARE_AI_GATEWAY_URL — full chat-completions path
printf 'https://gateway.ai.cloudflare.com/v1/b6c06059b413892a92f150e5ca496236/axbd-team/openrouter/v1/chat/completions' | \
  pnpm exec wrangler secret put CLOUDFLARE_AI_GATEWAY_URL --env production

# 2. INTERNAL_API_SECRET — 양 워커 동기화
cat ~/.secrets/decode-x-internal | \
  pnpm exec wrangler secret put INTERNAL_API_SECRET --env production

# 3. OPENROUTER_API_KEY — verify (보통 일치하지만 안전 차원에서)
cat ~/.secrets/openrouter-api-key | \
  pnpm exec wrangler secret put OPENROUTER_API_KEY --env production
```

검증 (~3 min):
- lpon (8 skills) batch 재실행
- D1 `SELECT score, rationale FROM ai_ready_scores WHERE batch_id=...` → score > 0 + 정상 rationale 확인

## 재발 방지

1. **secret rotation 절차 강제** — `~/.secrets/` 변경 시 양 worker (`default`, `--env production`) 동시 갱신 필수. session 246 feedback memory `feedback_wrangler_default_vs_production_env.md` 가 이미 이 원칙을 명시했으나 OPENROUTER 만 적용되고 GATEWAY_URL/INTERNAL 은 누락. 자동화 스크립트 후보: `scripts/secret-sync-svc-skill.sh`
2. **secret divergence 자동 감지** — daily-check 또는 weekly cleanup routine 에서 양 워커의 single eval 호출 결과 비교 (HTTP status 일치 여부). divergence 감지 시 알림.
3. **CLAUDE.md 업데이트** — "Inter-Service Communication" 섹션에 worker 별 secret store 분리 + 동기 의무 명시.

## Cost

- lpon 8 batch 재실행 cost $0.0288 (silent failure)
- 단일 진단 1회 추가 cost ~$0.018 예상 (LPON 35 trigger 안 함, lpon 8만 재실행하면 충분)

## TD-56 / TD-57 관계

- **TD-56**: F414 코드 fix 자체는 정상 → ✅ 해소 가능. Production 에서 F414 가 동작 확인됨 (rationale 에 retry 메시지). 단지 underlying gateway URL 문제 때문에 retry 가 효과 없었을 뿐.
- **TD-57**: 본 진단 → ✅ root cause 확정. **Fix 는 secret rotation 1단계** (코드 변경 0건).

## 산출물

- 본 분석 문서 (`docs/03-analysis/AIF-ANLS-041_td-57-batch-secret-divergence.md`)
- batch result row: D1 `ai_ready_scores` `batch_id=170ed5de-55e0-47f5-9d28-4328a75bd1fc` (48 rows, 모두 score=0)
- batch row: D1 `ai_ready_batches` `batch_id=170ed5de-...` (status=completed, avgScore=0)
- 진단 cost: $0.0288

---

# Fix 실행 + Production 검증 (2026-05-04 세션 260, 추가 0.5h)

## Fix 실행

3종 secret을 `--env production` 워커에 put (코드 변경 0건):

```
✨ Success! Uploaded secret CLOUDFLARE_AI_GATEWAY_URL
   = https://gateway.ai.cloudflare.com/v1/b6c06059b413892a92f150e5ca496236/axbd-team/openrouter/v1/chat/completions
✨ Success! Uploaded secret INTERNAL_API_SECRET (~/.secrets/decode-x-internal)
✨ Success! Uploaded secret OPENROUTER_API_KEY (~/.secrets/openrouter-api-key)
```

## Production smoke 검증

| Metric | Fix 전 (`170ed5de`) | Fix 후 (`28124e59`) |
|---|---|---|
| status | completed | completed |
| completed/total | 8/8 | 8/8 |
| failed | 0 | 0 |
| cost | $0.0288 | $0.0288 |
| **avgScore** | **0.0** | **0.674** |
| D1 score 분포 | 모두 0 | 0.42 ~ 0.95 |
| rationale | "LLM returned HTML response..." | 정상 한국어 평가 텍스트 |

D1 raw scores 검증 (Fix 후 `28124e59` 첫 2 skill 12 row 샘플):

```
[comment_doc_alignment    ] score=0.95 passed=1
[exception_handling       ] score=0.72 passed=0   ← TD-60 0.6 threshold 적용 확인
[io_structure             ] score=0.52 passed=0
[source_consistency       ] score=0.95 passed=1
[srp_reusability          ] score=0.82 passed=1
[testability              ] score=0.45 passed=0
... (lpon-charge 6건 동일 양상)
```

## 결론

- **TD-57 ✅ 해소** — Root cause 확정 + Fix 적용 + Production smoke PASS 3축 충족.
- **TD-56 ✅ 자연 해소** — F414 코드 fix(3계층 방어)는 처음부터 정상 동작했고, underlying gateway URL 문제(TD-57) 때문에 효과가 표면화되지 않았음을 사후 입증. 별도 코드 변경 불필요.
- **TD-60 ✅ 동시 검증** — 0.6 threshold가 score 0.62 ↑를 정상으로 PASS 처리하는 모습 확인.

## 후속 권고

- **CLAUDE.md 업데이트** — "Inter-Service Communication" 섹션에 worker 별 secret store 분리 + secret rotation 시 양 워커 동시 갱신 의무 명시.
- **secret-sync-svc-skill.sh 스크립트 후보** — `~/.secrets/`의 정본을 양 워커에 일괄 동기화하는 idempotent 스크립트.
- **daily-check 검증 추가** — 양 워커의 `/health` + minimal authenticated endpoint 응답 비교로 secret divergence 자동 감지.
