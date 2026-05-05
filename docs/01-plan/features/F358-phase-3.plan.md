---
id: AIF-PLAN-056
title: "F425 — F358 Phase 3a Production smoke + drift 정량화 + F354 자동화 분석"
sprint: 258
f_items: [F425]
req: AIF-REQ-035
td: [TD-24, TD-28]
related_features: [F358, F354]
status: PLANNED
created: "2026-05-05"
author: "Master (session 270, Sprint 258)"
related: [AIF-PLAN-053, AIF-PLAN-054, AIF-PLAN-055]
---

> **Sprint 258 — F358 Phase 3 분할안 (Phase 3a)**: 원안("LPON 전수 production 재추출 + DIVERGENCE 5건 + F356-A 통합")은 LPON 실 Java 소스 미보유 + F356-A 평가 입력은 R2 `.skill.json` policies로 Tree-sitter 결과 직접 반영 불가라는 메커니즘 한계 발견. 본 Sprint는 **현실적으로 검증 가능한 3축**(Production smoke + Drift 정량화 회귀 + BL-level 자동화 가능성 분석)에 한정한다. F356-A 재평가는 Phase 3b 별도 Sprint(LPON 재패키징 결정 후) 분리.

# F425 — F358 Phase 3a: Production smoke + Drift 정량화 + F354 자동화 분석

## Background

Sprint 257 (Phase 2, AIF-PLAN-054)에서 Tree-sitter Java parser가 `services/svc-ingestion`에 production 통합 완료 + Master 독립 검증 PASS (`wrangler dev` cold-start 9분 ALIVE / `wrangler deploy --dry-run` 2,764 KiB 통과 / `/health` HTTP 200). PR #52 `552056d` MERGED.

Sprint 254 (Phase 1 PoC, AIF-PLAN-053) 결과:
- 5 샘플 parse 성공률 100%
- regex CLI 대비 **silent drift 17건 검출** (base_path_missing×2 + path_incomplete×7 + return_type_generic_loss×7 + mapper_skipped×1)

Phase 3 잔여 미증명 항목:
1. Sprint 257 production 환경에서 Tree-sitter parser cold-start 후 실 ingest 1건 종단 동작 여부 (Master 검증은 `wrangler dev` 한정, production endpoint 헬스만 확인)
2. PoC 17 silent drift가 Phase 2 production 코드에서 0으로 회귀했는지 정량 재측정
3. F354 manual DIVERGENCE 5건 (BL-level)을 Tree-sitter AST + reconcile.ts로 자동 검출 가능한지 분석 (TD-24 자동화 확장 준비)

## Objective

본 Sprint의 DoD:
- (a) **Production smoke** — `https://svc-ingestion.ktds-axbd.workers.dev/health` HTTP 200 + 1건 Java 샘플 실 업로드 시도 + svc-ingestion 로그에서 `extractClasses()` 호출 흔적 (`wrangler tail` 또는 D1 `document_chunks` 신규 row)
- (b) **Drift 정량화 회귀** — `scripts/java-ast/` CLI를 5 PoC 샘플(`PaymentController/ChargeService/PaymentEntity/WithdrawalController/RefundMapper`)에 실행 → AST 산출물의 silent drift 4종(base_path_missing/path_incomplete/return_type_generic_loss/mapper_skipped) **모두 0건** 회귀 검증
- (c) **API-level reconcile.ts 정상 동작 확인** — Tree-sitter 산출물을 `packages/utils/src/reconcile.ts`에 투입 시 SOURCE_MISSING/DOC_ONLY/DIVERGENCE markers가 정상 분류되는지 sanity check (1건 이상 marker 산출)
- (d) **F354 BL-level 자동화 가능성 분석** — F354 5건(BL-024 HIGH 7-day check 누락 + BL-026 MEDIUM 캐시백 환불 분기 부재 + BL-027 LOW 부분 구현 + BL-028 MEDIUM hard-coded `exclusionAmount=0` + BL-029 MEDIUM 강제환불 기준 부재) 각각에 대해 AST 패턴으로 자동 검출 가능 여부 평가 (가능/조건부/불가 3분류 + 패턴 정형화 초안)
- (e) `reports/sprint-258-drift-quantification-2026-05-05.json` + `reports/sprint-258-drift-quantification-2026-05-05.md` 실파일 산출
- (f) `docs/03-analysis/features/sprint-258-divergence-automation.analysis.md` 신규 (AIF-ANLS-056)
- (g) `docs/04-report/features/sprint-258-F425.report.md` 신규 (AIF-RPRT-056)
- (h) Match Rate ≥ 90%, typecheck/lint/test 전체 PASS

**Phase 3b (별도 Sprint, deferred)**:
- LPON 35 R2 skill-packages 재패키징 (Tree-sitter 산출물을 policy inference 입력으로 통합)
- F356-A 6기준 재평가 (LPON 35 단독, vs 세션 264 baseline avg 0.506)
- F354 BL-level 자동 검출 엔진 구현 (Sprint 258 §(d) 분석 결과 기반)

## Scope

### In Scope (Sprint 258 = Phase 3a)
- Production svc-ingestion smoke (HTTP curl 실측)
- java-ast CLI offline 5 샘플 실행 + AST → reconcile.ts 통합 sanity check
- silent drift 17 → 0 회귀 검증
- F354 5건 자동화 가능성 paper analysis (코드 변경 X, 분석 문서 only)
- reports/ 정량 데이터 + analysis/report MD

### Out of Scope (Phase 3b 이관)
- LPON 35 R2 재패키징
- F356-A 6기준 재평가
- BL-level 자동 검출 엔진 구현 (분석 결과 기반 차기 Sprint)
- 다른 도메인(Miraeasset/lpon 8) Tree-sitter 적용 확장

## 4 Steps

### Step 1 — Plan/Design 작성 + SPEC §6 등록 (0.3h)

- `docs/01-plan/features/F358-phase-3.plan.md` (본 문서, AIF-PLAN-056)
- `docs/02-design/features/F358-phase-3.design.md` (AIF-DSGN-056)
- SPEC.md §6 Sprint 258 블록 신규 + F425 status [~] IN_PROGRESS
- SPEC.md §7 F425 신규 등록 (REQ AIF-REQ-035 후속)

### Step 2 — Drift 정량화 + reconcile sanity check (1h)

```bash
cd scripts/java-ast
pnpm install (이미 설치됨)
pnpm run build || npx tsx src/index.ts --dir samples/ --out /tmp/sprint-258-ast.json --verbose
```

산출물:
- `/tmp/sprint-258-ast.json` — SourceAnalysisResult JSON (5 샘플)
- silent drift 4종 카운트 측정 (Phase 1 PoC에서 17건 → 본 측정에서 0건 기대)

이어서 reconcile.ts sanity:
- 임시 mock DocApiSpec 작성 (5 샘플의 endpoint를 부분만 포함)
- `reconcile()` 호출 → SOURCE_MISSING/DOC_ONLY/DIVERGENCE 마커 분포 확인

### Step 3 — Production smoke (0.5h)

```bash
# Health
curl -s -w "HTTP=%{http_code}\n" https://svc-ingestion.ktds-axbd.workers.dev/health

# wrangler tail (background)
cd services/svc-ingestion && CLOUDFLARE_API_TOKEN=... npx wrangler tail --env production --format pretty &

# 1건 Java 업로드 시도 (필요 시 X-Internal-Secret + RBAC 헤더)
curl -X POST https://svc-ingestion.ktds-axbd.workers.dev/upload \
  -H "X-Internal-Secret: ..." -H "X-User-Role: Analyst" \
  -F "file=@scripts/java-ast/samples/PaymentController.java"
```

산출물:
- HTTP 응답 캡처 (200 또는 401/403 — 인증 차단 시 cold-start만 검증으로 충분)
- `wrangler tail` 로그 30초 캡처 (Tree-sitter parser 호출 흔적)

### Step 4 — F354 BL-level 자동화 분석 + 보고서 (0.7h)

5건 BL-level marker 각각 AST 패턴 정형화 시도:

| BL-ID | 패턴 | 자동화 가능성 |
|-------|------|---------------|
| BL-024 (7-day check 누락) | spec 명시 기간 vs source `payment.createdAt` 비교 분기 부재 | 조건부 (spec rules.md 정량 파싱 필요) |
| BL-026 (캐시백 환불 분기) | spec ALT 분기 명시 vs source 분기 함수 부재 | 조건부 |
| BL-027 (approveRefund 부분 구현) | source 함수 body line count vs spec policy depth 비교 | 가능 (heuristic) |
| BL-028 (`exclusionAmount=0` hard-coded) | AST literal `0` 직접 할당 + spec 공식 명시 | **가능** (정확) |
| BL-029 (강제환불 기준 부재) | spec ALT 분기 명시 vs source 함수 부재 | 조건부 |

분석 결과:
- 가능 1건 (BL-028)
- 조건부 3건 (BL-024/026/029)
- 가능 + heuristic 1건 (BL-027)
→ 현재 reconcile.ts 엔진 확장만으로는 1.5/5 자동화. 추가 spec parser(rules.md → 정량 룰 데이터화) 동반 시 4.5/5 가능

본 분석 결과는 **차기 Sprint(F354 자동화 엔진 신설) Plan 입력**으로 활용.

산출물:
- `reports/sprint-258-drift-quantification-2026-05-05.json` — 5 샘플 AST + drift 카운트
- `reports/sprint-258-drift-quantification-2026-05-05.md` — 측정 요약
- `docs/03-analysis/features/sprint-258-divergence-automation.analysis.md` — F354 자동화 분석 (AIF-ANLS-056)
- `docs/04-report/features/sprint-258-F425.report.md` — Sprint 종결 보고 (AIF-RPRT-056)

## DoD 매트릭스

- [ ] Plan/Design 신규 (AIF-PLAN/DSGN-056) ✅ Step 1
- [ ] SPEC §6 Sprint 258 블록 + F425 신규 + §7 backlog 추가 ✅ Step 1
- [ ] java-ast CLI 5 샘플 실 실행 + `/tmp/sprint-258-ast.json` 생성 ✅ Step 2
- [ ] silent drift 4종 모두 0건 회귀 검증 ✅ Step 2
- [ ] reconcile.ts 1건 이상 marker 산출 sanity ✅ Step 2
- [ ] svc-ingestion production /health HTTP 200 ✅ Step 3
- [ ] wrangler tail 로그 30초 캡처 (Tree-sitter 호출 흔적) ✅ Step 3
- [ ] F354 5건 자동화 가능성 분석 표 + 차기 Sprint 입력 ✅ Step 4
- [ ] reports/ JSON + MD 실파일 + analysis + report MD 생성 ✅ Step 4
- [ ] Match Rate ≥ 90% + typecheck/lint clean

## Risk

- **R1**: scripts/java-ast/ build 실패 (web-tree-sitter native binding 이슈) → fallback `npx tsx src/index.ts` 또는 PoC 재현 모듈 차용
- **R2**: production /upload endpoint 인증 차단으로 실 ingest 검증 못 함 → /health + wrangler tail로 cold-start만 입증 (downgrade)
- **R3**: F354 자동화 분석이 paper exercise 수준 머무름 → 차기 Sprint Plan 입력으로만 활용 (본 Sprint scope 한계 명시)
- **R4**: silent drift 회귀 측정 시 Phase 2 코드 갱신으로 새 drift 패턴 등장 → 기록 후 후속 Sprint TD 신규 등록

## Related

- AIF-PLAN-053 (Sprint 254 Phase 1 PoC)
- AIF-PLAN-054 (Sprint 257 Phase 2 production 통합)
- AIF-PLAN-055 (Sprint 256 F424 TD-62 PoC)
- F354 (TD-24 5건 manual DIVERGENCE markers, Sprint 218)
- F356-A (Phase 3b 분리 대상)
