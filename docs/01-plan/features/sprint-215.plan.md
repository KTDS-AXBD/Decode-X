---
id: AIF-PLAN-049
title: Sprint 215 — Track B Handoff Adapter → Foundry-X
type: plan
status: 1.0
linked:
  feature: F-track-B-handoff-adapter
  related:
    - AIF-REQ-035  # Decode-X v1.3 Phase 2
    - AIF-PLAN-040  # F356-B AI-Ready (handoff payload 종속)
  sprint: 215
  pdca_phase: Plan
  retroactive: true
  retroactive_reason: "Sprint 215 autopilot이 Plan/Design 단계 스킵하고 바로 Implement+Report로 진행 (PDCA 규약 미준수, TD-20). 본 문서는 commit 18022c8 (2026-04-20) + Phase 2 종합 Gap Analysis §3.1 (AIF-ANLS-029) 근거로 세션 264 (2026-05-04)에 retroactive 작성."
created: 2026-04-20
retroactive_at: 2026-05-04
session: 264
---

# Sprint 215 Plan — Track B Handoff Adapter (retroactive)

## 1. 배경

AIF-REQ-035 v1.3 Phase 2 본 개발 Track B 진입. Sprint 211 FX-SPEC-003 v1.0 서명 + Sprint 212~214c Track A Empty Slot Fill 완결 후, Decode-X 결과물(Working Prototype + Skill 패키지)을 **Foundry-X 런타임으로 실 핸드오프**하는 종단 흐름 구현이 필요했다. PRD MVP §5.2 "Track B E2E 1건 WP 실행 PASS"가 Sprint 215~216의 직접 목표.

**선행 산출물 (Sprint 211~214c)**:
- FX-SPEC-003 §5 Handoff Contract (Decode-X→Foundry-X payload schema)
- Working Prototype 생성기 (`services/svc-skill/src/prototype/`)
- AI-Ready 6 criteria 평가기 (Sprint 230 F356-A로 확장 예정, Sprint 215 시점에는 prototype overall score만 사용)

## 2. 목표

| ID | 목표 | 우선순위 |
|----|------|---------|
| G-1 | Decode-X svc-skill에 handoff submit 엔드포인트(`POST /handoff/submit`) 추가 — Working Prototype 생성 → AI-Ready Gate 검증 → Foundry-X로 forward | P0 |
| G-2 | Foundry-X로부터 SyncResult callback 수신 엔드포인트(`POST /callback/:jobId`) 추가 + D1 idempotent 갱신 | P0 |
| G-3 | AI-Ready Gate `overall ≥ 0.75` 임계 enforcement — Gate FAIL 시 verdict=DENIED + Foundry-X forward 차단 | P0 |
| G-4 | D1 `handoff_jobs` 테이블 신설 — submit 시점 row insert + callback 시점 verdict + processedAt update | P0 |
| G-5 | Foundry-X URL/secret 환경 변수 추가 — `FOUNDRY_X_URL`, `FOUNDRY_X_SECRET` (`wrangler.toml` + `env.ts`) | P1 |
| G-6 | Tests — handoff-adapter 단위 17건 + handoff.submit integration 10건 | P0 |

## 3. 범위

### In Scope
- `packages/utils/src/handoff-adapter.ts` (신규): `checkHandoffGate`, `buildFoundryXPayload` 순수 함수
- `services/svc-skill/src/routes/handoff.ts` (신규): submit + callback 핸들러
- `services/svc-skill/src/index.ts`: 라우트 등록
- `infra/migrations/db-skill/0007_handoff_jobs.sql` (신규)
- `services/svc-skill/src/env.ts` + `wrangler.toml`: FOUNDRY_X_* 환경 변수

### Out of Scope (Sprint 216으로 분리)
- round-trip 검증 하네스 (`scripts/roundtrip-verify/`)
- Foundry-X 측 종단 처리 검증 (Decode-X 측은 forward + callback 수신까지만)
- 실 production Foundry-X URL 적용 (개발 단계는 mock URL)

## 4. DoD

| # | DoD 항목 | 검증 방법 |
|---|---------|----------|
| 1 | `POST /handoff/submit` HTTP 200 + 신규 jobId 발급 + handoff_jobs row 1건 생성 | integration test 1건 |
| 2 | AI-Ready Gate `overall < 0.75` 시 verdict=DENIED + Foundry-X 미forward + handoff_jobs verdict='DENIED' | integration test 1건 |
| 3 | `POST /callback/:jobId` HTTP 200 + handoff_jobs verdict + processedAt 갱신 + idempotent (재호출 시 status quo) | integration test 1건 |
| 4 | handoff-adapter `checkHandoffGate` + `buildFoundryXPayload` 단위 테스트 17건 PASS | `pnpm test --filter handoff-adapter` |
| 5 | typecheck + lint clean | `pnpm typecheck && pnpm lint` |
| 6 | Match Rate ≥ 90% (autopilot 검증) | autopilot 자체 보고 |

## 5. 위험

- **R1**: Foundry-X URL/secret이 미합의 상태 → mock URL로 forward 동작만 검증, 실 production URL 검증은 Sprint 228 G-1 Phase 3에 이관 (실 발생: TD-25 → AIF-ANLS-031에서 7/7 PASS로 종결)
- **R2**: AI-Ready Gate threshold 0.75가 hard-coded — 추후 도메인별 조정 필요 시 별도 TD (실 발생: TD-60 0.75→0.6 인하, 세션 260)
- **R3**: handoff_jobs idempotency를 Foundry-X jobId로만 보장 — Decode-X 측 self-id 충돌 가능성 (실 발생: 관측 안 됨)

## 6. 추정

| Phase | 작업 | 시간 |
|-------|------|------|
| Plan/Design | (Sprint 215 시점 누락, retroactive 0.5h) | (해당 없음) |
| Implement | handoff-adapter + routes + migration + tests | ~3h |
| Test | 27 신규 tests + monorepo 기존 329 tests + typecheck | ~0.5h |
| Report | autopilot 자동 작성 | ~0.5h |
| **Total (retroactive 제외)** | | **~4h** |

## 7. 의존성

- 선행: Sprint 211 FX-SPEC-003 v1.0 서명, Sprint 214a/b/c Track A Fill, prototype generator (Sprint 1)
- 후속: Sprint 216 (round-trip 검증 하네스), Sprint 228 (Production E2E with real Foundry-X URL), Sprint 230 (F356-A AI-Ready 평가기 정식화)

## 8. 참조

- PRD: `docs/req-interview/decode-x-v1.3-phase-2/prd-final.md` §5.2 MVP "Track B E2E 1건 WP 실행 PASS"
- FX-SPEC: `docs/specs/FX-SPEC-003-handoff-contract.md` §5 Handoff Contract Payload
- Phase 2 통합 분석: `docs/03-analysis/features/phase-2-pipeline.analysis.md` §3.1 (AIF-ANLS-029)
- Implement commit: `18022c8` (2026-04-20)
- 후속 분석: AIF-ANLS-031 (Sprint 228 Production E2E 7/7 PASS)
