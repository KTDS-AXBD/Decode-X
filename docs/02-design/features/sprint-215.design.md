---
id: AIF-DSGN-049
title: Sprint 215 Design — Handoff Adapter + submit/callback Routes
type: design
status: 1.0
linked:
  plan: AIF-PLAN-049
  feature: F-track-B-handoff-adapter
  sprint: 215
  pdca_phase: Design
  retroactive: true
  retroactive_reason: "Sprint 215 autopilot이 Plan/Design 단계 스킵 (TD-20). 본 문서는 commit 18022c8 (2026-04-20) 실 코드 + Phase 2 종합 Gap Analysis §3.1 (AIF-ANLS-029) 근거로 세션 264 (2026-05-04)에 retroactive 작성."
created: 2026-04-20
retroactive_at: 2026-05-04
session: 264
---

# Sprint 215 Design — Handoff Adapter (retroactive)

## 1. 아키텍처 개요

```
[svc-skill]
  ↓ POST /handoff/submit (외부 → Decode-X)
  ├─ handleSubmitHandoff
  │    1. handleGenerateHandoff 재사용 → Working Prototype + AI-Ready 점수
  │    2. checkHandoffGate(overall ≥ 0.75) → Pass/Deny
  │    3. handoff_jobs INSERT (status=queued, verdict=pending)
  │    4. buildFoundryXPayload (FX-SPEC-003 §5.1)
  │    5. fetch(FOUNDRY_X_URL) with X-Foundry-Secret header
  │    6. handoff_jobs UPDATE (status=forwarded, foundry_job_id, forwarded_at)
  └─ Response { jobId, verdict: 'ALLOWED' | 'DENIED', foundryJobId? }

[Foundry-X 런타임]
  ↓ Working Prototype 실행 + 검증 결과 산출
  ↓ POST /callback/:jobId (Foundry-X → Decode-X)

[svc-skill]
  └─ handleHandoffCallback
       1. handoff_jobs SELECT WHERE jobId=? (idempotency check)
       2. 동일 verdict 재호출 시 status quo 반환 (idempotent)
       3. handoff_jobs UPDATE (verdict, processed_at, sync_result_json)
       4. Response { ok: true }
```

## 2. 핵심 설계 결정

| ID | 결정 | 근거 |
|----|------|------|
| D1 | `handoff-adapter.ts`를 `packages/utils/`에 두고 svc-skill route에서 import | Foundry-X repo도 유사 adapter가 필요할 수 있어 monorepo 공용 위치. Decode-X 단일 사용 시점에는 svc-skill 내부에 두는 것도 가능했으나, FX-SPEC-003 payload 빌더는 cross-repo 재사용 가능성 고려. |
| D2 | Persist job before forwarding 패턴 — handoff_jobs INSERT를 forward HTTP fetch보다 먼저 수행 | Foundry-X forward 실패 시 jobId가 D1에 보존되어 retry 가능. forward 후 INSERT 시 fetch 실패 → orphan jobId 발생. |
| D3 | callback idempotency를 Decode-X 측 jobId UNIQUE 제약 + verdict 재진입 시 status quo로 보장 | Foundry-X retry 시 중복 callback 가능성. Foundry-X 측 jobId(`foundry_job_id`)는 별도 추적 필드로 둠. |
| D4 | AI-Ready Gate threshold = 0.75 hard-coded (Sprint 215 시점) | Phase 2 PRD §5.2 "AI-Ready 70% 목표" → buffer 5%pp 적용. 추후 도메인별 조정은 TD-60(세션 260에서 0.6으로 인하) |
| D5 | 6 criteria의 `overall` = simple average (`(c1+c2+...+c6)/6`) | Sprint 215 시점에는 weighted scoring 미정의. F356-A Phase 1(Sprint 230)에서 정식화 예정. |
| D6 | Foundry-X 인증 = `X-Foundry-Secret` 헤더 단일 token | mTLS는 Cloudflare Workers↔Foundry-X 환경에서 미지원. shared secret으로 minimum viable security. |
| D7 | callback URL은 `https://<svc-skill-host>/callback/:jobId` 패턴 — Foundry-X가 jobId echo | URL path-level idempotency key. Foundry-X 측 코드 변경 최소화 (jobId만 알면 됨). |

## 3. 데이터 모델

### `handoff_jobs` (D1, 0007 migration)

| Column | Type | NULL | Index | 설명 |
|--------|------|------|-------|------|
| `job_id` | TEXT (UUID) | NOT NULL | PK | Decode-X 측 jobId (UUID v4, submit 시점 발급) |
| `skill_id` | TEXT | NOT NULL | INDEX | source skill ID |
| `organization_id` | TEXT | NOT NULL | INDEX | LPON / Miraeasset |
| `status` | TEXT | NOT NULL | — | `queued` / `forwarded` / `processed` / `failed` |
| `verdict` | TEXT | NULL | — | `pending` / `ALLOWED` / `DENIED` (Gate 결과 + Foundry-X 결과) |
| `ai_ready_overall` | REAL | NULL | — | 6 criteria avg (Gate 입력) |
| `foundry_job_id` | TEXT | NULL | INDEX | Foundry-X 측 발급 jobId (forward 응답에서 추출) |
| `forwarded_at` | TEXT | NULL | — | ISO8601 forward 시점 |
| `processed_at` | TEXT | NULL | — | ISO8601 callback 수신 시점 |
| `payload_json` | TEXT | NOT NULL | — | FX-SPEC-003 payload (Foundry-X로 forward한 본문) |
| `sync_result_json` | TEXT | NULL | — | Foundry-X SyncResult callback body |
| `error_text` | TEXT | NULL | — | forward fetch 또는 callback 처리 실패 시 사유 |
| `created_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | — | |

## 4. API Contract

### POST /handoff/submit

**Request**:
```json
{
  "skillId": "uuid",
  "organizationId": "LPON" | "Miraeasset"
}
```

**Response (verdict=ALLOWED)**:
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "verdict": "ALLOWED",
    "aiReadyOverall": 0.84,
    "foundryJobId": "fx-uuid",
    "forwardedAt": "2026-..."
  }
}
```

**Response (verdict=DENIED)**:
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "verdict": "DENIED",
    "aiReadyOverall": 0.72,
    "denyReason": "AI-Ready Gate FAIL: overall 0.72 < threshold 0.75"
  }
}
```

### POST /callback/:jobId

**Request (Foundry-X → Decode-X)**:
```json
{
  "verdict": "ALLOWED" | "DENIED",
  "syncResult": {
    "status": "completed" | "failed",
    "details": { ... }
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": { "ok": true }
}
```

idempotent: 동일 verdict 재호출 시 200 + status quo.

## 5. 핵심 함수

### `checkHandoffGate(scores)` (handoff-adapter.ts)

```ts
export interface HandoffGateInput {
  scores: { criterion: string; score: number }[];
  threshold?: number; // default 0.75
}

export interface HandoffGateResult {
  passed: boolean;
  overall: number;
  threshold: number;
  reason?: string;
}

export function checkHandoffGate(input: HandoffGateInput): HandoffGateResult;
```

### `buildFoundryXPayload(skill, prototype, scores)` (handoff-adapter.ts)

FX-SPEC-003 §5.1 schema 준수:
- `handoffId`, `decodeXVersion`, `skillId`, `organizationId`
- `prototype`: { runbook, tests, contractYaml, provenanceYaml }
- `aiReady`: { overall, criteria[] }
- `submittedAt` (ISO8601)

## 6. 테스트 전략

| 분류 | 테스트 수 | 위치 |
|------|----------|------|
| handoff-adapter 단위 (`checkHandoffGate` + `buildFoundryXPayload`) | 17 | `packages/utils/src/handoff-adapter.test.ts` |
| handoff.submit integration (Pass/Deny path + 외부 fetch mock) | 10 | `services/svc-skill/src/routes/handoff.submit.test.ts` |
| 기존 svc-skill tests (regression 보장) | 329 (Sprint 215 시점) | (전수 PASS) |
| **Total** | **356 PASS** | |

## 7. Out-of-scope (Sprint 216 이관)

- round-trip 하네스 (`scripts/roundtrip-verify/runner.ts`, `comparator.ts`) — Sprint 216 신규
- 6 영역 매핑 + implementedRate 계산 — Sprint 216
- TC-REFUND-002 BL-024 7일 규칙 검증 흐름 — Sprint 216 (실패 시 DIVERGENCE 마커는 Sprint 230 F354로 이관)

## 8. 회고 — Phase 2 분석 §3.1 (AIF-ANLS-029) 근거

**Strengths (실 검증)**:
- `handleGenerateHandoff` 재사용 — 신규 endpoint이지만 prototype 생성 로직은 기존 함수 호출
- Persist job before forwarding 패턴 — fetch 실패 시 D1 row 보존
- `foundry_job_id` 기반 idempotency — Foundry-X retry 안전

**−4% 차감 근거** (Match 96% 산출):
- Plan/Design 문서 부재 (PDCA 규약 위반, LOW) — **본 문서 retroactive 작성으로 종결 (TD-20, 세션 264)**
- `env.FOUNDRY_X_URL` / `FOUNDRY_X_SECRET` wrangler.toml 등록 직접 확인 안 됨 (MEDIUM) — Sprint 228에서 production 적용 시 함께 검증 (TD-25 7/7 PASS, AIF-ANLS-031)

**검증 16항 PASS** (전수): handoff-adapter, Gate aiReady≥0.75, verdict=DENIED 차단, callback URL, D1 0007 migration, 3종 verdict 수용, 네트워크 오류 복구, Zod 검증, 테스트 25건 (단위 17 + integration 10).

## 9. 참조

- Plan: AIF-PLAN-049 `docs/01-plan/features/sprint-215.plan.md`
- Implement commit: `18022c8` (2026-04-20)
- Phase 2 통합 분석: `docs/03-analysis/features/phase-2-pipeline.analysis.md` §3.1 (AIF-ANLS-029)
- 후속 Sprint: Sprint 216 (round-trip), Sprint 228 (Production E2E), Sprint 230 (F356-A 정식화)
