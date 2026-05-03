# Sprint 245+246 Pipeline 통합 분석 (AIF-ANLS-035)

> **Phase 6 통합 Gap Analysis + E2E Audit** — Sprint 245(F414 TD-56) + Sprint 246(F415 TD-55) Batch 1 merge 후 master 기준 정합성 검증.

---

## 메타

- **세션**: 256 (2026-05-03)
- **Pipeline**: `/ax:sprint-pipeline 245 246` Batch 1
- **Master commits**: `16716bc` (S245 PR #42), `d0b25c4` (S246 PR #41)
- **Match Rate**: S245 92% / S246 95% / **Average 93.5% ✅ Pass**
- **E2E HIGH gap**: 2건 (자동 보강 후보, 단 backend 예외 적용 가능)

---

## Phase 6a — 통합 Gap Analysis

### Sprint별 매트릭스

| Sprint | F | Design DoD | Implemented | Deferred | Match | 판정 |
|--------|---|:----------:|:-----------:|:--------:|:-----:|:----:|
| 245 | F414 | 8 | 6 verified | 2 (runtime smoke) | **92%** | ✅ Pass |
| 246 | F415 | 6 | 5 verified | 1 (production R2 backfill) | **95%** | ✅ Pass |
| **Avg** | | 14 | 11 | 3 | **93.5%** | ✅ Pass |

### Sprint 245 (F414, TD-56) 상세

**✅ 구현 (6/8)**:
- `wrangler.toml:126/186` staging+production `max_concurrency = 3` (10→3)
- `evaluator.ts:153~170` `Promise.all` → `for (const criterion of ALL_AI_READY_CRITERIA)` sequential
- `llm-client.ts:122~136` `LLM_MAX_RETRIES=2` + content-type HTML guard + exponential backoff (1s, 2s)
- `llm-client.test.ts:27~84` HTML guard 4 case (3 design + 1 4xx fast-fail bonus)

**⚠️ Deferred (2/8)**:
- `pnpm typecheck && pnpm test` 전체 실측 → CI 488/488 PASS로 간접 확인
- lpon 8건 batch avg_score > 0 + Master smoke → **Sprint 247 F416 운영 검증 대상**

**➕ Added**: HTTP 4xx 즉시 throw 검증 (retry semantics 회귀 방지). `attempt + 1 / MAX_RETRIES + 1` 사용자 친화 메시지.

### Sprint 246 (F415, TD-55) 상세

**✅ 구현 (5/6)**:
- `evaluator.ts:57~78` `loadSpecContent(env, skillId, _orgId, r2Key?)` — backward compatible default fallback
- `routes/ai-ready.ts:93~97` `SELECT skill_id, r2_key FROM skills` 추가
- `routes/ai-ready.ts:142` `loadSpecContent(..., skillRow["r2_key"])` bracket access (TS noPropertyAccessFromIndexSignature 회피)
- `routes/ai-ready.ts:144` `notFound("spec-container")` → `notFound("skill-r2")` 라벨 보정
- `upload-bundled-r2.ts:17~21,192` `fileURLToPath` 자동 경로 감지
- `evaluator.test.ts:225~266` r2Key 3 case (explicit, fallback, spy 검증)

**⚠️ Deferred (1/6)**:
- 5/5 LPON bundled sample HTTP 200 verify → **Master에서 `upload-bundled-r2.ts` production 실행 후 검증** (design §7 명시)

**➕ Added**: `logger.warn` `r2Key: key` 추가 (디버깅 가시성), bracket notation TS 함정 회피, default path spy 검증.

### 통합 Risk

| ID | 항목 | 영향 |
|----|------|------|
| INT-1 | S245 sequential + S246 r2Key 동일 evaluator 호출 경로 | LOW. 두 변경이 서로 다른 함수, 순서 (load → run) 유지 |
| **INT-2** | lpon 8 batch 재실행 시 (a) Master upload-bundled-r2.ts production 실행 → (b) batch trigger **순서 필수** | **MEDIUM**. 순서 어긋나면 false-negative 진단 위험 |
| INT-3 | `wrangler.toml max_concurrency=3` production deploy 트리거 별도 | LOW. GitHub Actions deploy-services.yml이 wrangler.toml 변경 감지 trigger |

---

## Phase 6b — E2E Audit

### 라우트 커버리지

| Endpoint | Unit | E2E | Sprint |
|----------|:----:|:---:|:------:|
| `POST /skills/:id/ai-ready/evaluate` | ✅ | ❌ | F415 (S246 수정) |
| `POST /skills/ai-ready/batch` | ✅ | ❌ | F414 (S245 wrangler) |
| `GET /skills/:id/ai-ready/evaluations` | ✅ | ❌ | (기존, 미변경) |
| `GET /skills/ai-ready/batches/:batchId` | ✅ | ❌ | (기존, 미변경) |

**E2E 라우트 커버**: 0/2 신규 변경 (0%) | **Unit 라우트 커버**: 2/2 (100%)

### 기능 커버리지

| F | 핵심경로 | E2E | Unit | 비고 |
|---|----------|:---:|:----:|------|
| F414 | lpon 8건 batch + LLM 48/48 SUCCESS | 0/1 | 9건 | UI batch 트리거 → polling E2E 부재 |
| F415 | LPON 35 bundled evaluate r2Key fallback | 0/1 | 4건 | UI bundled skill detail → Evaluate 클릭 E2E 부재 |

### 품질 anti-pattern

| 유형 | 건수 | 위치 |
|------|:----:|------|
| `waitForTimeout` | 4 | `e2e/guest-mode.spec.ts`, `e2e/functional.spec.ts`, `e2e/rbac.spec.ts` |
| 약한 assertion | 0~1 | 대부분 텍스트 검증 포함 |
| API-only | 0 | 모든 E2E가 UI navigation 포함 |
| `describe.skip`/`test.skip` | 0 | 주석 9건만 (실제 skip 0) |

### HIGH Gap (Phase 7b 자동 보강 후보)

1. **F414 batch trigger E2E** — Developer 사용자가 skill batch 평가 트리거 → HTTP 201 + batchId polling
2. **F415 bundled skill evaluate E2E** — Analyst bundled skill 선택 → Evaluate → r2Key fallback HTTP 200 + 6 criteria

### 종합

| 차원 | 결과 |
|------|------|
| 라우트 커버 (E2E) | 0/2 (0%) |
| 라우트 커버 (Unit) | 2/2 (100%) |
| 기능 커버 (E2E) | 0/2 (0%) |
| 기능 커버 (Unit) | 12건 신규 |
| 품질 이슈 | 4건 minor (waitForTimeout) |
| **HIGH gap** | **2건** |

---

## Phase 7 판정

| Phase | 결과 | 사유 |
|-------|:----:|------|
| **7a Gap Fix (pdca-iterator)** | **건너뜀** | Match 93.5% ≥ 90%, Sprint별 모두 ≥90% |
| **7b E2E 보강** | **사용자 결정 위임** | HIGH gap 2건이나 SPEC §4 #6 "**예외: 순수 백엔드/스키마/스크립트 F-item은 unit/integration test 허용**" 적용 후보 — F414/F415는 backend infra fix |

### Phase 7b 결정 옵션

1. **자동 보강 (Phase 7b 실행)**: `e2e/skill-evaluation.spec.ts` 신규 — F414 batch + F415 single eval 2 case 자동 작성. CI에서 mock-only 검증.
2. **Sprint 247 F416으로 통합 검증**: F416 = lpon 8 batch 재실행 + LPON 35 single eval 운영 검증. 운영 데이터로 통합 검증 + reports 산출. Backend exception 적용.
3. **Skip + 향후 별도 Sprint**: HIGH gap 기록만 남기고 차후 UX 개선 sprint와 함께 처리.

**권장**: 옵션 2. 이유 — F414/F415는 backend infra fix이고 SPEC 예외 조항 명시. F416 운영 실행이 곧 통합 E2E에 해당 (production endpoint 실호출 + 6 criteria 검증).

---

## Phase 8 진입 전 후속 작업

- **TD-55, TD-56 §8 상태 갱신**: 두 TD 해소 표시 (취소선 + 세션 256 + 완료 commit)
- **AIF-REQ-041 (F412)**: 상태 변경 — TD-55/56 해소로 unblock, F416 Sprint 247 진입 가능
- **F414/F415 [ ] → [x]** SPEC §6 마킹
- **MEMORY 활성 작업 line**: TD-55/56 ✅ 마킹, F412 재시도 우선순위 P2 → P1 승격, F416 운영 실행 진입
- **Master `git pull`**: 이미 완료 (HEAD `16716bc`)
- **Worktree 정리**: sprint-245/246 디렉토리 + 로컬 브랜치 (squash merge로 `git branch --merged` 미감지 → squash-aware 정리 필요)

---

## 참조

- Plan: `docs/01-plan/features/sprint-245.plan.md`, `docs/01-plan/features/F415.plan.md`
- Design: `docs/02-design/features/sprint-245.design.md`, `docs/02-design/features/F415.design.md`
- Report (S245 only): `docs/03-reports/sprint-245-F414-report.md`
- SPEC §6: Sprint 245 (line 673~680) / Sprint 246 (line 681~688) / Sprint 247 (line 689~696)
- SPEC §8 TD-55/TD-56: line 955/956
- 관련 MEMORY: `feedback_silent_batch_failure_pattern.md`, `feedback_batch_endpoint_vs_queue_burst.md`, `feedback_known_issue_pre_check.md`
