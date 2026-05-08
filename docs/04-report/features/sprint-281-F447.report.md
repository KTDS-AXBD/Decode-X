---
id: AIF-RPRT-079
sprint: 281
feature: F447
title: updateMarkerStatus resolvedBy/resolvedAt 자동 추가 — 실행 보고서
status: completed
created: 2026-05-09
related_plan: AIF-PLAN-079
match_rate: 95
mode: Master inline
---

# F447 Report — AIF-RPRT-079

## 실행 결과

| # | DoD | 결과 | 비고 |
|---|-----|------|------|
| 1 | updateMarkerStatus opts.resolvedBy/At 시그니처 | ✅ | `opts?: { resolvedBy?: string; resolvedAt?: string }` 추가 |
| 2 | OPEN → RESOLVED 시 자동 삽입 | ✅ | status: RESOLVED 직후 `resolvedBy + resolvedAt` 2줄 |
| 3 | 기존 resolvedBy skip (manual 우선) | ✅ | `\n\s+resolvedBy:` 정규식 검사 후 skip |
| 4 | resolvedAt 생략 시 today | ✅ | `new Date().toISOString().slice(0, 10)` UTC date-only |
| 5 | write-provenance CLI --resolved-by 옵션 | ✅ | parseArgs + planDomain 시그니처 + default 메시지 (`"Detector auto-detected (write-provenance --apply)"`) |
| 6 | unit test 5건 신규 | ✅ | (a) 자동 추가 / (b) opts 없음 status만 / (c) resolvedAt today / (d) 기존 skip / (e) 역전환 OPEN skip |
| 7 | utils 184/184 PASS (179 → +5, 회귀 0) | ✅ | `pnpm exec vitest run` |
| 8 | typecheck PASS + Plan + Report + SPEC | ✅ | AIF-PLAN-079 + AIF-RPRT-079 |

**DoD 8/8 PASS — Match Rate 95%**

## 핵심 결과

### 자동 동작 예시

```bash
# Sprint 281 도입 후 차기 호출
tsx scripts/divergence/write-provenance.ts --all-domains --apply \
  --resolved-by "F<N> Sprint <NUM> auto-detected (PRESENCE)"
```

→ status OPEN→RESOLVED 자동 전환 시 yaml에 자동 삽입:
```yaml
  - marker: DIVERGENCE
    ruleId: <BL-XXX>
    status: RESOLVED
    resolvedBy: "F<N> Sprint <NUM> auto-detected (PRESENCE)"
    resolvedAt: "2026-05-09"
    ... (기존 필드 유지)
```

### 기존 manual 우선 (보존)

Sprint 279에서 manual로 추가한 credit-card CC-001/002의 `resolvedBy`/`resolvedAt`는 자동 logic이 skip하므로 보존됨. 자동 logic은 신규 PRESENCE 전환 시점에만 동작.

## Code 변경

### 1. `provenance-writer.ts` updateMarkerStatus 확장 (~30 lines)

- 시그니처: `opts?: { resolvedBy?: string; resolvedAt?: string }` 추가
- Step 2 (신규): status OPEN → RESOLVED 시 block 추출 → 기존 resolvedBy 검사 → 없으면 status 직후 2줄 삽입
- 정규식 `m` flag 1차 fail → 제거 (block 추출 시 string end `$` 의도)

### 2. `write-provenance.ts` CLI 확장

- parseArgs: `--resolved-by` 옵션 추가
- printUsage: F447 옵션 안내
- planDomain 시그니처: `(mapping, resolvedBy?: string)`
- main: default 메시지 (`"Detector auto-detected (write-provenance --apply)"`) effectiveResolvedBy 계산
- statusUpdates 호출 시 opts 전달 (RESOLVED 전환 + resolvedBy 있을 때만)

### 3. unit test 5건 신규 (`provenance-writer.test.ts`)

```
F447 — updateMarkerStatus opts.resolvedBy/At 검증
  ✓ OPEN → RESOLVED 시 resolvedBy/At 자동 추가
  ✓ opts 없으면 status만 변경 (이전 동작 유지)
  ✓ resolvedAt 생략 시 today 자동 사용
  ✓ resolvedBy 이미 있는 block skip (manual 우선)
  ✓ RESOLVED → OPEN 역전환 시 resolvedBy 추가 안 함 (audit trail 보존)
```

## 시간 / 비용

- 작업 소요: ~30분 (Master inline, 1차 정규식 m flag fail → 즉시 수정 포함)
- LLM cost: $0

## 메타 학습

- **detector 신뢰도 시스템 4 Sprint cascade 완성** (S278 ABSENCE 발견 → S279 detector logic fix Path A/B → S280 SUPPORTED auto-sync → S281 resolvedBy/At 자동 audit trail)
- **manual fix → 자동화 사이클 정착** (S279 manual entry → S281 logic 도입). 차기 PRESENCE 시 자동 동작, manual annotation은 best-effort 보존
- **best-effort 중복 회피 + manual annotation 우선** — 정규식 검사 1줄로 manual/auto 양립
- **정규식 `m` flag 함정** — block 추출에서 `$`가 line end 아닌 string end 의도였다면 `m` flag 제거 필수. 1차 fail 후 즉시 fix 표준화

## 차기 후보

1. **summary `byStatus` 필드 자동 추가** — recomputeDivergenceSummary 확장 (Sprint 279 credit-card manual 추가 → 자동화)
2. **신규 산업 도메인 시리즈** — Delivery, Subscription, Insurance (LPON 외 산업 다양성 + detector 자동 SUPPORTED + resolvedBy 자동 audit trail 활용)
3. Phase 4 후속 / 보안 후속 2건
