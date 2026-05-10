---
id: AIF-ANLS-118
title: "F487 — DIVERGENCE 5건 후속 재실측 결과"
sprint: 321
f_items: [F487]
created: "2026-05-11"
author: "autopilot (Sprint 321)"
---

# Sprint 321 F487 — DIVERGENCE 5건 후속 재실측 결과

**실측 기준**: spec-container TypeScript 소스 (반제품-스펙/pilot-lpon-cancel/working-version/src/domain/)  
**실측 시각**: 2026-05-11 (detect-bl v2.1.0)  
**측정 범위**: 45 containers / 272 BLs / 100.0% coverage

---

## 1. 5 DIVERGENCE 마커 재실측 결과 (Plan §Objective (a))

| BL-ID | 설명 | 이전 상태 | 현재 상태 | 결과 |
|-------|------|-----------|-----------|------|
| BL-024 | 7-day 윈도 체크 부재 | DIVERGENCE | **PRESENCE** | ✅ 해소 |
| BL-026 | 캐시백 ALT 분기 부재 | DIVERGENCE | **ABSENCE** (markers=1) | ❌ 잔존 |
| BL-027 | 부분 구현 (under-impl) | DIVERGENCE | **PRESENCE** | ✅ 해소 |
| BL-028 | hard-coded exclusion | DIVERGENCE | **PRESENCE** | ✅ 해소 |
| BL-029 | 강제환불 기준 체크 부재 | DIVERGENCE | **PRESENCE** | ✅ 해소 |

**소계**: 5건 중 4건 해소 (80%), 1건 잔존 (BL-026 캐시백)

---

## 2. LPON 8 컨테이너 전체 ABSENCE 현황

| Container | 전체 BLs | PRESENCE | ABSENCE | ABSENCE 상세 |
|-----------|---------|----------|---------|-------------|
| lpon-refund | 11 | 9 | 2 | BL-026 (캐시백), BL-030 (만료 거부) |
| lpon-charge | 8 | 8 | 0 | — |
| lpon-payment | 7 | 2 | 5 | BL-013/016/017/018/019 |
| lpon-gift | 6 | 5 | 1 | BL-G001 (gift 구현 부재) |
| lpon-settlement | 6 | 6 | 0 | — |
| lpon-budget | 5 | 5 | 0 | — |
| lpon-purchase | 5 | 5 | 0 | — |
| lpon-cancel | 1 | 1 | 0 | — |
| **합계** | **49** | **41** | **8** | |

**LPON 전체 coverage**: 41/49 = 83.7% PRESENCE (8 ABSENCE 잔존)

---

## 3. Risk R1 — Java 소스 미보유 판정

**판정**: **Option B 적용** (Sprint 257 PoC 5 샘플 → 현재 8 containers)

- R2 documents/lpon/ 확인 불가 (WT production 접근 없음) → **Option A 미수행**
- 8 spec-container TypeScript 소스 기준 DIVERGENCE 측정 완료 → **Option B 수행**
- LPON production Java 소스 미보유 상태 유지 → **Phase 4 전수 재추출 실현 불가**

**결론**: Phase 4 본 목표(LPON 전수 production 재추출)는 **Java 소스 미보유로 부분 종결**.  
DIVERGENCE 5건 재실측(Option B 기준)은 완료. Production 재추출은 별도 TD-XX 등록.

---

## 4. 전체 시스템 detect-bl 현황

```
총 containers: 45
총 BLs:        272
Coverage:      272/272 = 100.0%
ABSENCE count: 8 (모두 LPON containers)
```

---

## 5. BL-026 잔존 원인 분석

BL-026 (캐시백 환불 ALT 분기)은 lpon-refund spec-container에서 ABSENCE 1건 유지.

이유: 캐시백 ALT 분기 구현은 별도 cashback 서비스 연동을 요구하며, 현재 refund.ts 단독으로는 구현 불가. Production LPON Java 소스에서 실제 구현 여부를 검증해야 최종 판단 가능.

---

## 6. Master 독립 검증 위임 항목

Plan DoD §(b)~(e)는 Master 실행 위임:

| 항목 | 위임 이유 | 실행 스크립트 |
|------|-----------|--------------|
| Production deploy | WT production 접근 없음 | `wrangler deploy svc-skill --env production` |
| wrangler tail 30s | production 환경 필요 | `wrangler tail svc-skill --env production` |
| Multi-input 9 probe | production endpoint 필요 | `scripts/smoke/phase4-smoke-probes.sh` |
| R2 LPON ls | production credentials 필요 | `wrangler r2 object list --prefix=skill-packages/lpon` |
| D1 LPON row count | production D1 접근 필요 | D1 query |
| F356-A 재평가 | LLM API credentials 필요 | `scripts/ai-ready/evaluate.ts --org=lpon` |

---

## 7. 결론

- **DIVERGENCE 5건 재실측**: 4건 해소 ✅ (80%), 1건 잔존 (BL-026)
- **Phase 4 전수 재추출**: Java 소스 미보유로 부분 종결 → Option C(Partial) 적용
- **detect-bl 전체 coverage**: 272/272 = 100.0% 유지 ✅
- **Production 실행**: Master 위임 (reports/sprint-321-f487-production-smoke-2026-05-11.md로 기록)
