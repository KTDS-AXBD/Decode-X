---
id: AIF-PLAN-079
sprint: 281
feature: F447
title: updateMarkerStatus resolvedBy/resolvedAt 자동 추가 + write-provenance --resolved-by 옵션
status: active
estimated_hours: 0.5
created: 2026-05-09
related: [AIF-PLAN-078]
req: AIF-REQ-035
related_features: [F446, F445, F430]
---

# F447 Plan — AIF-PLAN-079

## 목표

Sprint 280 F446에서 차기 후보로 등록된 **resolvedBy/resolvedAt 자동 추가** 구현.

OPEN → RESOLVED 자동 전환 시 detector 출처 + 시점 메타필드를 자동 보존하여 audit trail 완성. Sprint 279 manual fix 사례(credit-card CC-001/002)를 자동화.

## 근본 원인 (Sprint 280 후속 잔여)

Sprint 280 F446에서 `DETECTOR_SUPPORTED_RULES` auto-sync로 자동 OPEN→RESOLVED 전환은 가능해졌으나, **resolvedBy/resolvedAt 메타필드는 자동 추가 안 됨** (status 필드만 변경). Sprint 279에서 credit-card CC-001/002에 manual로 추가한 정보(`resolvedBy: "F445 Sprint 279 ..."` + `resolvedAt: "2026-05-08"`)를 자동화로 대체.

## Fix 설계

### `updateMarkerStatus()` 확장

```typescript
export function updateMarkerStatus(
  yamlText: string,
  ruleId: string,
  newStatus: "OPEN" | "RESOLVED",
  opts?: { resolvedBy?: string; resolvedAt?: string },  // F447 신규
): { text: string; changed: boolean }
```

logic:
1. status 필드 변경 (기존 동작 유지)
2. **F447 신규**: status OPEN → RESOLVED 전환 + opts.resolvedBy 제공 시 → block에 resolvedBy 없으면 status 직후에 `resolvedBy + resolvedAt` 줄 자동 삽입
3. resolvedAt 기본값: today (`new Date().toISOString().slice(0, 10)`)
4. 기존 resolvedBy 있으면 skip (manual annotation 우선)
5. RESOLVED → OPEN 역전환은 status만 변경 (audit trail 유지)

### `write-provenance.ts` CLI 확장

```bash
tsx scripts/divergence/write-provenance.ts --all-domains --apply --resolved-by "F<N> Sprint <NUM> auto-detected (PRESENCE)"
```

- `--resolved-by` 옵션 추가 (선택)
- 미지정 시 default 메시지: `"Detector auto-detected (write-provenance --apply)"`
- planDomain → updateMarkerStatus 호출 시 opts 전달

## DoD (8건)

| # | 항목 | 기준 |
|---|------|------|
| 1 | updateMarkerStatus opts.resolvedBy/At 추가 | TypeScript 시그니처 갱신, JSDoc 명시 |
| 2 | OPEN → RESOLVED 전환 시 resolvedBy/At 자동 삽입 | block 안 status: RESOLVED 직후 2줄 (resolvedBy + resolvedAt) |
| 3 | resolvedBy 이미 있는 block은 skip | manual annotation 우선 (정규식 검사) |
| 4 | resolvedAt 생략 시 today 자동 | `new Date().toISOString().slice(0, 10)` |
| 5 | write-provenance CLI --resolved-by 옵션 | parseArgs 확장 + planDomain 시그니처 + default 메시지 |
| 6 | unit test 5건 신규 | (a) opts 제공 시 자동 추가, (b) opts 없으면 status만, (c) resolvedAt today, (d) 기존 resolvedBy skip, (e) 역전환 RESOLVED→OPEN skip |
| 7 | utils 179 → 184 PASS (+5 신규, 회귀 0) | `pnpm exec vitest run` |
| 8 | typecheck PASS + Plan + Report + SPEC | AIF-PLAN-079 + AIF-RPRT-079 |

## Scope

### In Scope
- `updateMarkerStatus()` opts 확장
- write-provenance CLI --resolved-by 옵션
- unit test 5건
- Plan + Report

### Out of Scope
- credit-card provenance.yaml 갱신 (Sprint 279 manual entry 유지 — 자동 logic은 차기 PRESENCE 시 동작)
- `reopenedBy/reopenedAt` 역전환 메타필드 (audit trail 별도)
- summary `byStatus` 필드 자동 추가 (별도 후속)

## Risks

| ID | 리스크 | 회피 |
|----|--------|------|
| R1 | 정규식 `m` flag로 인한 block 추출 실패 (FAILED in 1차 try) | `m` flag 제거 → string-based `$` 매칭. 1차 fail 후 즉시 fix. |
| R2 | 기존 resolvedBy block에서 자동 추가 시 중복 발생 | 정규식 `\n\s+resolvedBy:` 검사 후 skip |
| R3 | resolvedAt 일자 timezone 우려 | `toISOString().slice(0, 10)` UTC 기반 (date-only 표시), 도메인 일관 |
| R4 | YAML 형식 일관성 (인덴트 4 spaces) | 기존 block 인덴트 동일 (`    ` 4 spaces) |

## Implementation Steps

1. `provenance-writer.ts` `updateMarkerStatus()` 확장 (opts + 자동 삽입 logic)
2. `write-provenance.ts` CLI: `--resolved-by` parseArgs + planDomain 시그니처 + default 메시지
3. unit test 5건 추가 (`packages/utils/test/provenance-writer.test.ts`)
4. `pnpm exec vitest run` (184/184 PASS 검증, 회귀 0)
5. `pnpm exec tsc --noEmit -p packages/utils` (turbo 우회 PASS)
6. SPEC §6 Sprint 281 + F447 등록
7. Plan + Report 작성
8. Commit + push

## 산출물

- Plan: `docs/01-plan/features/F447-resolved-by-at-auto-add.plan.md` (AIF-PLAN-079, 본 문서)
- Report: `docs/04-report/features/sprint-281-F447.report.md` (AIF-RPRT-079)
- Code:
  - `packages/utils/src/divergence/provenance-writer.ts` (updateMarkerStatus opts 확장 ~30 lines)
  - `scripts/divergence/write-provenance.ts` (CLI --resolved-by 옵션 + planDomain 호출 갱신)
  - `packages/utils/test/provenance-writer.test.ts` (F447 unit test 5건 ~70 lines)
- SPEC: §6 Sprint 281 블록 + F447 체크박스

## Success Criteria

- DoD 8/8 PASS
- utils 179 → 184 PASS (+5 신규, 회귀 0)
- typecheck PASS
- write-provenance CLI 호환성 유지 (--resolved-by 미지정 시 기존 동작 + default 메시지)

## 메타

- **detector 신뢰도 시스템 4 Sprint cascade 완성** (S278 ABSENCE 발견 → S279 Path A/B logic → S280 SUPPORTED auto-sync → S281 resolvedBy/At 자동 audit trail)
- **manual fix → 자동화 사이클** (Sprint 279 manual entry → Sprint 281 logic 도입). 차기 PRESENCE 시 자동 동작
- **best-effort 중복 회피 + manual annotation 우선** — manual fix 사례(Sprint 279 credit-card)와 자동 logic 양립
