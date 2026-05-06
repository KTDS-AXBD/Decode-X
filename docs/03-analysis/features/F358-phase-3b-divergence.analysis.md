---
id: AIF-ANLS-065
title: "F434 — F358 Phase 3b DIVERGENCE 5건 Production 재실측"
sprint: 267
f_items: [F434]
type: analysis
created: 2026-05-06
---

# AIF-ANLS-065 — F358 Phase 3b DIVERGENCE 5건 Production 재실측

## §1 측정 요약

- **측정일**: 2026-05-06 (세션 280, Sprint 267)
- **대상**: lpon-refund spec-container DIVERGENCE 5건 (TD-24, F354 발행)
- **도구**: `BL_DETECTOR_REGISTRY` 31종 + detect-bl CLI v2.1.0
- **방식**: detect-bl --all-domains + provenance cross-check

## §2 DIVERGENCE 5건 재실측 매트릭스

| BL-ID | Severity | F354 발행 상태 | Sprint 260 detector | 본 Sprint 재실측 | 판정 |
|-------|----------|--------------|---------------------|-----------------|------|
| BL-024 | HIGH | RESOLVED (7일 제한 미구현 → Sprint 251 F359 구현 완료) | detectTemporalCheck → PRESENCE | PRESENCE (RESOLVED auto-evidence) | ✅ RESOLVED 확정 |
| BL-026 | MEDIUM | OPEN (cashback 환불 분기 미구현) | detectCashbackBranch → 1 ABSENCE | 1 ABSENCE marker (BL-026 OPEN 유지) | 🔴 OPEN 유지 |
| BL-027 | LOW | RESOLVED (부분 환불 approveRefund 완전 구현) | detectUnderImplementation → 0 ABSENCE (underImplTargets 화이트리스트 적용) | cross-check recommend OPEN (requestDeposit stub false positive) | ⚠️ RESOLVED 유지 (false positive — requestDeposit은 BL-027 target 외) |
| BL-028 | MEDIUM | RESOLVED (exclusionAmount=0 하드코딩 제거) | detectHardCodedExclusion → PRESENCE | PRESENCE (RESOLVED auto-evidence) | ✅ RESOLVED 확정 |
| BL-029 | MEDIUM | RESOLVED (만료 검사 구현) | detectExpiryCheck → PRESENCE | PRESENCE (RESOLVED auto-evidence) | ✅ RESOLVED 확정 |

**판정 요약**: 4/5 RESOLVED + 1/5 OPEN (BL-026)

## §3 BL-027 Cross-Check 상세

detect-bl --source 직접 실행 시 `requestDeposit` 함수 (bodyLines=2, branchDepth=0)에 false positive 발생:

```
BL-027: 1 ABSENCE marker(s)
  L13: Function 'requestDeposit': bodyLines=2 (<10) + branchDepth=0 (<2). Likely under-implemented.
```

그러나 `underImplTargets: ["processRefundRequest", "approveRefund", "rejectRefund"]` 화이트리스트에 `requestDeposit`는 포함되지 않아 --all-domains 모드에서는 BL-027을 ABSENCE로 분류하지 않음.

**결론**: BL-027은 Sprint 251 F359에서 `approveRefund` 완전 구현 후 RESOLVED 확정. `requestDeposit`은 별개 기능 stub. provenance.yaml의 RESOLVED 상태 유지.

## §4 Production 코드 상태 (lpon-refund)

```
반제품-스펙/pilot-lpon-cancel/working-version/src/domain/refund.ts
  ├── processRefundRequest()   — BL-020/021/022/023/024/027/028 구현
  ├── approveRefund()          — BL-027/028/029 구현
  ├── rejectRefund()           — BL-020 exception 처리
  └── (cashback 분기 없음)     — BL-026 OPEN
```

## §5 7 containers 전체 BL 검출 결과

| Container | BLs in rules.md | Applicable detectors | ABSENCE | PRESENCE | 비고 |
|-----------|:-:|:-:|:-:|:-:|------|
| lpon-refund | 11 | 6 | **1** (BL-026) | 5 | cashback 미구현 확정 |
| lpon-charge | 8 | 4 | 0 | 4 | 전원 PRESENCE |
| lpon-payment | 7 | 2 | 0 | 2 | 전원 PRESENCE |
| lpon-gift | 6 | 5 | 0 | 5 | 전원 PRESENCE |
| lpon-settlement | 6 | 4 | 0 | 4 | 전원 PRESENCE |
| lpon-budget | 5 | 5 | 0 | 5 | 전원 PRESENCE |
| lpon-purchase | 5 | 5 | 0 | 5 | 전원 PRESENCE |
| **합계** | **48** | **31** | **1** | **30** | 64.6% coverage |

## §6 provenance.yaml 동기화 상태

```
write-provenance --all-domains --apply
→ 0/7 containers with changes

이유:
- lpon-refund: BL-026 OPEN + BL-024/027/028/029 RESOLVED → 기존 상태와 일치 (no change)
- lpon-charge~purchase: ABSENCE 0건 → 신규 marker 없음 (no change)
```

## §7 TD-28 해소 근거

TD-28의 핵심 요구사항: "Tree-sitter 기반 Java 파서 전환 + DIVERGENCE 마커 BL-level 자동 검출 체계 완성"

| 항목 | 상태 |
|------|------|
| Tree-sitter Workers 호환성 | ✅ Sprint 254 Phase 1 PASS |
| Production 통합 | ✅ Sprint 257 Phase 2 MERGED |
| Silent drift 정량화 | ✅ Sprint 258 Phase 3a (17→0 확정) |
| F354 DIVERGENCE 마커 5건 | ✅ F354 Sprint 218 발행 |
| DIVERGENCE 자동 검출 엔진 | ✅ Sprint 259~260 (5/5 BL 탐지) |
| 보편 detector 3종 | ✅ Sprint 262 (Threshold/Status/Atomic) |
| provenance.yaml auto-write | ✅ Sprint 263 |
| source PoC 7 domains | ✅ Sprint 264~266 (gift/settlement/budget/purchase) |
| BL-level production 통합 | ✅ 본 Sprint 267 (detect-bl + write-provenance 7 containers) |

**판정**: TD-28 ✅ 해소 조건 충족.

## §8 잔여 항목

| 항목 | 상태 | 다음 단계 |
|------|------|---------|
| BL-026 cashback 미구현 | 🔴 OPEN | Phase 4에서 실제 비즈니스 확인 후 구현 or 의도적 제외 결정 |
| LPON Java 전수 재파싱 | ⏳ Phase 4 | 5 sample → 전체 확장 (원본 Java 소스 필요) |
| LPON 35 R2 재패키징 (WS-4) | ⏳ Phase 4 | 전제조건 2가지 미충족: (1) LPON approved policies 0건 — Java 재파싱 후 ingestion 필요, (2) svc-llm-router production decommissioned (TD-44) → LLM classification 불가. `scripts/divergence/rebundle-all-domains.ts` 신설 (--dry-run 검증 완료). Phase 4 Java ingestion 후 실행 예정. |
