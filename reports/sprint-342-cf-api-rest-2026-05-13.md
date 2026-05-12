---
name: AIF-RPRT-124 — Sprint 342 F515 secret-sync-all-workers v2 (CF API REST 패치) + TD-59 retrospective
description: Sprint 342 reframe — TD-59 audit 적중 (RESOLVED S261 F420) → F515 신규 (F490 v2 CF API REST 패치) 진행
category: report
project: Decode-X
sprint: 342
fItem: F515
created: 2026-05-13
updated: 2026-05-13
author: Sinclair Seo
status: DONE
---

# Sprint 342 F515 — secret-sync-all-workers v2 (CF API REST 패치) + TD-59 retrospective

## 1. 배경 — Sprint reframe (S283 audit 7회차 적중)

**원안 (사전 등록 S301)**: F513 TD-59 large skill evaluator chunking 도입 (~2h).

**fs 실측 결과 — TD-59 이미 ✅ RESOLVED**: 세션 261 (2026-05-04), F420 Master inline에서 해소 완료.
- SPEC.md line 1800: `~~TD-59~~ | ... | ✅ **해소 (세션 261, 2026-05-04, F420 Master inline)**`
- Fix: `services/svc-skill/src/ai-ready/evaluator.ts`의 `capSpecContentForLargeSkills` 도입 (2단계 cap + JSON parse fail 로깅).

**S283 audit 패턴 재현** (S300 TD-60 retrospective 동계열): 사전 등록 OPEN 가정 → fs 실측 RESOLVED 확정 → reframe. 7회차 패턴 정착.

**reframe 결정 (사용자 S301 AskUserQuestion 3안 중)**: **C 채택** — Sprint 341에서 식별한 P1 TD-NEW-A (F490 v2 CF API REST 패턴 패치) 즉시 해소. F513 DROPPED + F515 신규.

## 2. 산출물

### 2.1 `scripts/secret-sync-all-workers-v2.sh` (~280 lines)

**v1 → v2 변경점 (S341 학습 반영)**:
1. **stdin pipe → CF API REST PUT 전환** (line 231 v1 `printf | wrangler` → v2 `curl -X PUT`)
   - 이유 1: bkit shell wrapper 자동 `< /dev/null`로 stdin 차단 (wrangler hang)
   - 이유 2: wrangler 4.80.0 `secret bulk` fetch failed 자체 버그 (curl로 동일 API 정상)
2. **Worker name 매핑 함수 도입** — `worker_id_for_env()`:
   ```
   default     → svc-X
   production  → svc-X-production
   staging     → svc-X-staging
   ```
3. **wrangler 의존 제거** — curl + CLOUDFLARE_API_TOKEN만 필요
4. **CF account ID 자동 감지** — `curl /accounts | grep -oE '"id":"[a-f0-9]{32}"' | head -1 | cut -d'"' -f4`
5. **`--worker NAME` 단일 worker 옵션** 신설 (점진 적용 안전성)
6. **non-interactive stdin 자동 감지** — bkit shell 환경에서 confirm prompt 자동 생략

### 2.2 v1 → v2 우열

| 항목 | v1 (wrangler) | v2 (CF API REST) |
|------|---------------|------------------|
| stdin 의존 | ✅ 필요 | ❌ 불필요 |
| wrangler 의존 | ✅ 필요 | ❌ 불필요 |
| bkit shell 환경 동작 | ❌ stdin 차단 | ✅ 정상 |
| wrangler 4.80.0 fetch failed 회피 | ❌ | ✅ |
| Worker name 매핑 | 명시 안 함 | ✅ 명시 함수 |
| CF account auto 감지 | ❌ | ✅ |
| 점진 적용 (`--worker`) | ❌ | ✅ |

## 3. 회귀 검증 (단일 worker --apply)

```
$ bash scripts/secret-sync-all-workers-v2.sh --worker svc-ingestion --apply

▶ Cloudflare account ID 감지 중...
  ✅ ACCT_ID: b6c06059b413892a92f150e5ca496236

▶ 정본 파일 점검 (/home/sinclair/.secrets)
  ✅ CLOUDFLARE_AI_GATEWAY_URL → chmod 600, size=110
  ✅ INTERNAL_API_SECRET → chmod 600, size=64
  ✅ OPENROUTER_API_KEY → chmod 600, size=73

▶ 실행 계획 (apply=true)
  ── svc-ingestion
     PUT /workers/scripts/svc-ingestion/secrets — INTERNAL_API_SECRET
     PUT /workers/scripts/svc-ingestion-production/secrets — INTERNAL_API_SECRET

▶ 총 2건 (worker × secret × 2 env)

▶ 적용 중 (CF API REST)

▶ svc-ingestion
  ✅ INTERNAL_API_SECRET → default (worker=svc-ingestion, HTTP 200)
  ✅ INTERNAL_API_SECRET → production (worker=svc-ingestion-production, HTTP 200)

▶ 결과: 2건 성공 / 0건 실패 (총 2건)
✅ 전체 적용 완료.
```

**idempotent 입증**: Sprint 341에서 이미 적용된 동일 값을 다시 PUT → 양쪽 env HTTP 200. 안전성 입증.

## 4. 초기 ACCT_ID 파싱 버그 + 패치

**1차 시도**: `grep -oE '"id":"[a-f0-9]+"'` 정규식이 nested object의 id field도 매칭 → ACCT_ID가 `d\n<32자>` 줄바꿈 포함 → URL 깨짐 → HTTP 000.

**패치**: `grep -oE '"id":"[a-f0-9]{32}"' | head -1 | cut -d'"' -f4` — 32자 hex만 정확 매칭.

**메타**: CF account_id는 정확히 32자 hex. 정규식 길이 제약 명시로 false positive 차단.

## 5. DoD

| # | 항목 | Status |
|---|------|--------|
| 1 | scripts/secret-sync-all-workers-v2.sh 신설 (CF API REST 패턴) | ✅ |
| 2 | Worker name 매핑 함수 (default/production/staging) | ✅ |
| 3 | CF account auto 감지 + 정규식 정확화 | ✅ (1차 버그 → 32자 hex 패치) |
| 4 | wrangler 의존 제거 | ✅ |
| 5 | dry-run 전체 30건 PASS | ✅ |
| 6 | --worker 단일 worker --apply 회귀 PASS (HTTP 200 × 2) | ✅ |
| 7 | non-interactive stdin 자동 감지 | ✅ |
| 8 | reports/sprint-342 작성 + AIF-RPRT-124 | ✅ |
| 9 | TD-59 retrospective + Sprint reframe 명시 | ✅ |
| **합계** | | **9/9 PASS** |

## 6. 차기 후속

- **Sprint 후속 A 전체 sync (P2)**: 6 worker (svc-ingestion 외) × 2 env 잔여 28 ops 일괄 적용 (`bash scripts/secret-sync-all-workers-v2.sh --apply`). ~5분. 시간 절약 효과 vs 단계적 안전성 trade-off.
- **Sprint 후속 B 진짜 rotation (P2)**: openssl로 새 INTERNAL_API_SECRET 64char 생성 → ~/.secrets/ 갱신 → v2 --apply. ~1h, downtime risk 평가 필수.
- **v1 deprecate 결정**: v1 (`scripts/secret-sync-all-workers.sh`) 유지 vs 삭제 후 v2가 기본. 현재는 둘 다 유지 (안전성).

## 7. 메타 학습

(a) **S283 audit 7회차 적중 + TD retrospective 패턴 정착** — 사전 등록 시 OPEN 가정이었으나 fs 실측 결과 이미 RESOLVED (TD-59 S261 F420 완료). S300 TD-60 retrospective 패턴과 동계열. 사전 fs 실측 의무화 절차 + reframe 결정 표준 절차 7회차 정착.
(b) **S341 학습의 즉시 패치 가치** — Sprint 341에서 발견한 3종 우회 패턴 (stdin 차단 / wrangler fetch failed / CF API REST 우회) 을 Sprint 342에서 즉시 v2 패치로 인프라화. P1 TD 단일 세션 내 해소.
(c) **idempotent 검증 패턴** — Sprint 341 PUT한 동일 값을 v2 --apply로 재 PUT → 양쪽 env HTTP 200. CF API의 idempotent 동작 입증. 안전 반복 적용 보장.
(d) **정규식 길이 제약 가치** — `"id":"[a-f0-9]+"` (greedy) → `[a-f0-9]{32}` (정확 32자). nested object id field false positive 차단 패턴 정착. 후속 스크립트 표준 권장.
(e) **점진 적용 옵션 가치** — `--worker NAME` 단일 worker 적용 옵션으로 30 ops 일괄 진입 안전망 확보. trapped state 위험 회피.

## 8. 참조

- AIF-RPRT-122: Sprint 339 F490 v1 dry-run only
- AIF-RPRT-123: Sprint 341 F512 svc-ingestion CF API REST 1단계 시범
- rules/development-workflow.md "Worker Secret Store env-scoped divergence" (S246+S260+S341 누적)
- Cloudflare API: `PUT /accounts/{account_id}/workers/scripts/{script_name}/secrets`
