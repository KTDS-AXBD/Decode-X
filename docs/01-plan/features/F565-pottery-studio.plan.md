# Sprint 393 F565 — PO Pottery Studio 96번째 신규 산업 사전 등록

**Feature**: F565  
**Sprint**: 393  
**Status**: DONE  
**Session**: S393 (2026-05-23)

---

## 목표

Pottery Studio (도예 공방) 산업을 Decode-X 96번째 합성 도메인으로 부트스트래핑.
오프라인 엔터테인먼트 27-클러스터 확장 + 23 Sprint 연속 신기록 달성.

---

## 사전 Audit (S283 패턴 49회차)

| 항목 | 확인 결과 |
|------|----------|
| PO prefix 충돌 | ❌ 0건 — BL_ID_PATTERN 92 prefixes 중 PO 미존재 |
| pottery.ts | ❌ 미존재 |
| spec-containers/pottery | ❌ 미존재 |
| DOMAIN_MAP 베이스라인 | ✅ 95 entries (escape-room 마지막, `b437322`) |
| BL_ID_PATTERN 베이스라인 | ✅ 92 prefixes |

---

## 구현 범위

| 파일 | 변경 | 설명 |
|------|------|------|
| `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/pottery.ts` | 신규 (305+ lines) | 6 함수 + PotteryError |
| `.decode-x/spec-containers/pottery/rules/pottery-rules.md` | 신규 | markdown table 형식 (S381 의무) |
| `.decode-x/spec-containers/pottery/provenance.yaml` | 신규 | detection 결과 기록 |
| `.decode-x/spec-containers/pottery/tests/PO-001.yaml` | 신규 | ThresholdCheck 시나리오 |
| `scripts/divergence/domain-source-map.ts` | 수정 | DOMAIN_MAP 96번째 entry 추가 |
| `packages/utils/src/divergence/rules-parser.ts` | 수정 | PO prefix + BL_ID_PATTERN 업데이트 |
| `packages/utils/src/divergence/bl-detector.ts` | 수정 | PO-001~006 REGISTRY 추가 |
| `packages/utils/test/bl-detector.test.ts` | 수정 | 440→446 detectors + PO 5축 테스트 |

---

## DoD 점검 (13/13 계획)

| # | 항목 | 상태 |
|---|------|------|
| 1 | pottery.ts 305+ lines + 6 함수 + PotteryError | ✅ |
| 2 | spec-container 3 files (markdown table 형식) | ✅ |
| 3 | DOMAIN_MAP 96번째 entry | ✅ |
| 4 | parser PO prefix (BL_ID_PATTERN 92→93) | ✅ |
| 5 | REGISTRY PO-001~006 (Threshold×2 + Atomic×2 + Status×2) | ✅ |
| 6a | detectors count 440→446 | ✅ |
| 6b | sorted keys PO-001~006 (PL-006 다음) | ✅ |
| 6c | PO-001~006 registered describe block | ✅ |
| 6d | pottery domain PRESENCE 6 tests | ✅ |
| 6e | findDomainMapping("pottery") 검증 | ✅ |
| 7 | pnpm test utils 784→791 PASS | ✅ 634/634 |
| 8 | tsc --noEmit PASS | ✅ (기존 무관 에러 제외) |
| 9 | detect-bl PO-001~006 PRESENCE 6 BLs | ✅ |
| 10 | Match ≥ 95% | — (PR/CI 단계) |
| 11 | PR + CI 4/4 green (Domain Sprint Guard 14회차) | — (PR/CI 단계) |
| 12 | auto-merge | — |
| 13 | git show HEAD --stat \| grep domain-source-map.ts | — |

---

## PO 도예 공방 BL 차별성

- **PO-001**: MAX_CONCURRENT_WHEELS_PER_STUDIO = 12 (studio별 동시 active wheel)
- **PO-002**: classLimit — 멤버십 등급별 일일 수강 횟수 제한
- **PO-003**: material_kits INSERT 포함 — 재료 사전 결제 atomic
- **PO-004**: kiln_pending 중간 상태 — 가마 1-2주 대기 차별화
- **PO-005**: kiln_pending → finished batch (vs ES ended→cancelled)
- **PO-006**: materialFeeNonRefundable 차감 — 재료비 비환불 정책
