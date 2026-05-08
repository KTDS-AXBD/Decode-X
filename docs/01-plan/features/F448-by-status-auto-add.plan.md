---
id: AIF-PLAN-080
sprint: 282
feature: F448
title: recomputeDivergenceSummary byStatus 자동 추가/갱신
status: active
estimated_hours: 0.5
created: 2026-05-09
related: [AIF-PLAN-079]
req: AIF-REQ-035
related_features: [F447, F446, F445, F430]
---

# F448 Plan — AIF-PLAN-080

## 목표

Sprint 281 F447 차기 후보로 등록된 **summary `byStatus` 자동 추가/갱신**.

`recomputeDivergenceSummary()` 확장하여 `byStatus.OPEN`/`byStatus.RESOLVED` 카운트를 marker status 필드에서 자동 계산. Sprint 279에서 credit-card에 manual 추가한 패턴을 자동화.

## 근본 원인 (Sprint 281 후속 잔여)

`parseExistingMarkers()`는 status 필드(OPEN/RESOLVED) 이미 추출하지만 `recomputeDivergenceSummary()`는 `bySev`(HIGH/MEDIUM/LOW)만 계산하고 byStatus는 미지원. credit-card provenance.yaml의 `byStatus.OPEN: 0 / RESOLVED: 2`는 manual 추가.

## Fix 설계

### `recomputeDivergenceSummary()` 확장

```typescript
const byStatus: Record<"OPEN" | "RESOLVED", number> = { OPEN: 0, RESOLVED: 0 };
for (const m of markers) {
  bySev[m.severity]++;
  byStatus[m.status]++;  // F448 신규
}
```

logic:
1. **신규 summary block**: byStatus 포함 (4 lines: header + OPEN + RESOLVED)
2. **기존 byStatus 있는 block**: OPEN/RESOLVED 카운트 update
3. **byStatus 없는 기존 block**: bySeverity LOW 줄 다음에 byStatus block append (주석 허용 패턴 `[^\n]*\n`)

## DoD (8건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | recomputeDivergenceSummary byStatus 계산 | parseExistingMarkers status 필드 활용 |
| 2 | 신규 summary 시 byStatus 포함 | "byStatus:\n    OPEN: N\n    RESOLVED: N" |
| 3 | 기존 byStatus 있으면 update | OPEN/RESOLVED 카운트 갱신 |
| 4 | 기존 byStatus 없으면 LOW 다음 append | LOW 줄 주석 허용 (`[^\n]*\n`) |
| 5 | unit test 4건 신규 + 기존 idempotent test 갱신 | (a) 자동 추가 / (b) update / (c) 신규 summary / (d) marker status 일치 |
| 6 | utils 184 → 188 PASS (+4 신규, 회귀 0 — idempotent test 1건 갱신) | `pnpm exec vitest run` |
| 7 | typecheck PASS + write-provenance --apply 자동 적용 | lpon-refund provenance.yaml 자동 byStatus 추가 |
| 8 | Plan + Report + SPEC §6 Sprint 282 + F448 등록 | AIF-PLAN-080 + AIF-RPRT-080 |

## Scope

### In Scope
- `recomputeDivergenceSummary()` byStatus 계산 + 삽입 logic
- unit test 4건 + 기존 1건 갱신
- write-provenance --apply 자동 적용 demo (lpon-refund)
- Plan + Report

### Out of Scope
- credit-card provenance.yaml 갱신 (Sprint 279 manual byStatus 이미 있음, 자동 logic은 idempotent로 no change)
- top-level `resolvedMarkers`/`openMarkers` 필드 (Sprint 279 패턴 — byStatus와 중복 정보, 본 작업 불필요)
- summary 다른 필드 자동화 (auditEvidenceCoverage 등은 manual)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | LOW 줄 주석 매칭 실패 (`LOW: 1     # BL-027` 패턴) | 1차 fail 후 `[^\n]*\n` 패턴으로 fix (주석 허용) |
| R2 | OPEN/RESOLVED 정규식이 marker block의 `status: OPEN` 줄과 충돌 | summary block 추출 후 매칭이라 conflict 없음 (`^(\s+OPEN:\s+)(\d+)` 키워드 형식) |
| R3 | 기존 idempotent test 깨짐 (SAMPLE_WITH_SECTION에 byStatus 없음) | test 갱신 — 첫 호출 changed=true(byStatus 추가) + 두 번째 호출 changed=false (idempotent 의미 보존) |
| R4 | byStatus 위치가 bySeverity 위/중/아래 어느 곳인지 일관성 | 명시: 항상 bySeverity LOW 줄 직후 (자연 순서: total → bySev → byStatus) |

## Implementation Steps

1. `recomputeDivergenceSummary()` byStatus 계산 + insert/update logic
2. unit test 4건 추가 + 기존 idempotent test 갱신
3. `pnpm exec vitest run` (188/188 PASS 검증)
4. `pnpm exec tsc --noEmit -p packages/utils` (turbo 우회)
5. `npx tsx scripts/divergence/write-provenance.ts --all-domains --apply` (lpon-refund 자동 갱신 입증)
6. SPEC §6 Sprint 282 + F448 등록
7. Plan + Report 작성
8. Commit + push

## 산출물

- Plan: `docs/01-plan/features/F448-by-status-auto-add.plan.md` (AIF-PLAN-080, 본 문서)
- Report: `docs/04-report/features/sprint-282-F448.report.md` (AIF-RPRT-080)
- Code:
  - `packages/utils/src/divergence/provenance-writer.ts` (recomputeDivergenceSummary byStatus 확장 ~25 lines)
  - `packages/utils/test/provenance-writer.test.ts` (F448 unit test 4건 + 기존 1건 갱신)
  - `.decode-x/spec-containers/lpon-refund/provenance.yaml` (자동 byStatus 추가 demo: OPEN 1, RESOLVED 4)
- SPEC: §6 Sprint 282 블록 + F448 체크박스

## Success Criteria

- DoD 8/8 PASS
- utils 184 → 188 PASS (+4 신규, 회귀 0)
- typecheck PASS
- write-provenance --apply 1/12 containers (lpon-refund) 자동 갱신
- 다른 11 도메인은 marker 0개 또는 byStatus 이미 있어서 no change

## 메타

- **detector 신뢰도 시스템 5 Sprint cascade 완성** (S278 ABSENCE → S279 logic fix → S280 SUPPORTED auto-sync → S281 resolvedBy/At → **S282 byStatus auto-summary**)
- **manual fix → 자동화 사이클 완결** — Sprint 279 credit-card manual byStatus → Sprint 282 logic으로 lpon-refund 자동화 입증
- **정규식 주석 허용 패턴 표준화** — bySeverity 줄 인근 검색 시 `[^\n]*\n`으로 inline 주석 허용 (1차 fail 후 정착)
