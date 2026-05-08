---
id: AIF-RPRT-080
sprint: 282
feature: F448
title: recomputeDivergenceSummary byStatus 자동 추가 — 실행 보고서
status: completed
created: 2026-05-09
related_plan: AIF-PLAN-080
match_rate: 95
mode: Master inline
---

# F448 Report — AIF-RPRT-080

## 실행 결과

| # | DoD | 결과 | 비고 |
|---|-----|------|------|
| 1 | byStatus 카운트 계산 | ✅ | `parseExistingMarkers` status 필드 활용, OPEN/RESOLVED 자동 |
| 2 | 신규 summary 시 byStatus 포함 | ✅ | 4 lines append (header + OPEN + RESOLVED) |
| 3 | 기존 byStatus update | ✅ | OPEN/RESOLVED 카운트 변화 시 갱신 |
| 4 | 기존 byStatus 없으면 LOW 다음 append | ✅ | LOW 줄 주석 허용 패턴(`[^\n]*\n`)으로 fix |
| 5 | unit test 4건 신규 + 기존 idempotent test 갱신 | ✅ | (a) 자동 추가 / (b) status update 후 / (c) 신규 summary / (d) marker status 일치 + idempotent 갱신 (첫 호출 changed=true → 두 번째 false) |
| 6 | utils 184 → 188 PASS (+4 신규, 회귀 0) | ✅ | `pnpm exec vitest run` |
| 7 | write-provenance --apply 자동 적용 | ✅ | **lpon-refund provenance.yaml 자동 byStatus 추가** (OPEN: 1, RESOLVED: 4) |
| 8 | typecheck + Plan + Report + SPEC | ✅ | AIF-PLAN-080 + AIF-RPRT-080 |

**DoD 8/8 PASS — Match Rate 95%**

## 핵심 결과

### 자동 동작 입증 (lpon-refund)

```bash
$ npx tsx scripts/divergence/write-provenance.ts --all-domains --apply
...
Summary: 1/12 containers with changes
  written: .decode-x/spec-containers/lpon-refund/provenance.yaml
```

### Before
```yaml
divergenceSummary:
  totalMarkers: 5
  bySeverity:
    HIGH: 1     # BL-024
    MEDIUM: 3   # BL-026, BL-028, BL-029
    LOW: 1      # BL-027
  auditEvidenceCoverage: "..."
```

### After (F448 자동)
```yaml
divergenceSummary:
  totalMarkers: 5
  bySeverity:
    HIGH: 1     # BL-024
    MEDIUM: 3   # BL-026, BL-028, BL-029
    LOW: 1      # BL-027
  byStatus:
    OPEN: 1       # F448 자동 추가
    RESOLVED: 4   # F448 자동 추가
  auditEvidenceCoverage: "..."
```

→ lpon-refund 5 marker 중 4개 이미 RESOLVED (Sprint 251 F359 + Sprint 260 F427 등 누적), 1개만 OPEN (BL-026 미구현). 자동 입증 정확.

## 다른 도메인

- **credit-card**: Sprint 279 manual byStatus(OPEN: 0, RESOLVED: 2) 이미 있음 → idempotent (no change)
- **나머지 10 도메인**: divergenceMarkers 비어있거나 lpon-cancel 1 marker만 → byStatus 추가 의미 없음 또는 summary 자체 부재 (no change)

## Code 변경

### 1. `provenance-writer.ts` recomputeDivergenceSummary 확장 (~25 lines)

```typescript
const byStatus: Record<"OPEN" | "RESOLVED", number> = { OPEN: 0, RESOLVED: 0 };
for (const m of markers) {
  bySev[m.severity]++;
  byStatus[m.status]++;  // F448 신규
}

// 신규 summary block
+ `  byStatus:\n    OPEN: ${byStatus.OPEN}\n    RESOLVED: ${byStatus.RESOLVED}\n`;

// 기존 update
const hasByStatusBlock = /^\s+byStatus:\s*$/m.test(updated);
if (hasByStatusBlock) {
  // OPEN/RESOLVED 카운트 갱신
} else {
  // LOW 줄(주석 허용 [^\n]*\n) 다음 append
  const lowLinePattern = /^(\s+LOW:\s+\d+[^\n]*\n)/m;
  ...
}
```

### 2. unit test 5건 (4건 신규 + 1건 갱신)

```
F448 — recomputeDivergenceSummary byStatus 검증
  ✓ idempotent — second call after F448 byStatus addition (갱신: 첫 호출 changed=true)
  ✓ F448: byStatus 자동 추가 (기존 byStatus 없는 summary block)
  ✓ F448: byStatus 자동 update (status 변경 후 recompute)
  ✓ F448: 신규 summary block 생성 시 byStatus 포함
  ✓ F448: byStatus 일관성 — marker status와 카운트 일치
```

전체 184 → **188 PASS** (회귀 0).

## 시간 / 비용

- 작업 소요: ~30분 (Master inline, 1차 정규식 LOW 주석 fail → 즉시 fix 포함)
- LLM cost: $0

## 메타 학습

- **detector 신뢰도 시스템 5 Sprint cascade 완성** (S278 ABSENCE → S279 logic Path A/B → S280 SUPPORTED auto-sync → S281 resolvedBy/At → **S282 byStatus auto-summary**)
- **manual fix → 자동화 사이클 완결** — Sprint 279 credit-card manual byStatus → Sprint 282 logic 도입 후 lpon-refund 자동 적용 입증 (1/12 containers)
- **정규식 주석 허용 패턴 표준화** — bySeverity 줄 인근 검색 시 `[^\n]*\n`으로 inline 주석 허용. 1차 fail (`\s*\n`) → 즉시 fix → 표준 정착
- **idempotent test 의미 보존 패턴** — 신규 logic 도입 시 기존 idempotent 깨질 때 → "첫 호출 changed=true (신규 추가) + 두 번째 호출 changed=false (idempotent)" 2-step 패턴

## 차기 후보

1. **신규 산업 도메인 시리즈** — Delivery (배송), Subscription (구독), Insurance (보험) — LPON 외 산업 다양성 + detector 신뢰도 시스템 5 Sprint cascade 완전 활용
2. **Phase 4 후속** (전수 7 LPON 도메인 + Java source 확보)
3. **보안 후속 2건** (1Password CLI signin + Master Password)
4. **detector 추가 확장** — 새 패턴 발견 시 (StatusTransition / AtomicTransaction 한계 발견 시)
