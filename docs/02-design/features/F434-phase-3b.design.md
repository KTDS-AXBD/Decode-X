---
id: AIF-DSGN-065
title: "F434 — F358 Phase 3b Design: BL-level Production 통합 설계"
sprint: 267
f_items: [F434]
status: ACTIVE
created: 2026-05-06
plan_ref: AIF-PLAN-065
---

# AIF-DSGN-065 — F434 Phase 3b Design

## §1 WS-1: BL-level Production 통합

### 1.1 실행 흐름

```
detect-bl --all-domains
  └─ DOMAIN_MAP 7개 순회
     ├─ lpon-refund   → refund.ts    → BL_DETECTOR_REGISTRY (31종)
     ├─ lpon-charge   → charging.ts  → BL_DETECTOR_REGISTRY (31종)
     ├─ lpon-payment  → payment.ts   → BL_DETECTOR_REGISTRY (31종)
     ├─ lpon-gift     → gift.ts      → BL_DETECTOR_REGISTRY (31종)
     ├─ lpon-settlement → settlement.ts → BL_DETECTOR_REGISTRY (31종)
     ├─ lpon-budget   → budget.ts    → BL_DETECTOR_REGISTRY (31종)
     └─ lpon-purchase → purchase.ts  → BL_DETECTOR_REGISTRY (31종)

write-provenance --all-domains [--dry-run] [--apply]
  └─ 3-way 동기화
     ├─ manual=OPEN + auto=0   → RESOLVED 권고 (apply 시 적용)
     ├─ manual=OPEN + auto≥1   → 일관 (no-op)
     └─ manual missing + auto≥1 → 신규 ABSENCE marker append
```

### 1.2 예상 결과

| Container | 현재 markers | 예상 변경 | 근거 |
|-----------|-------------|----------|------|
| lpon-refund | 5 markers (4 RESOLVED, 1 OPEN) | 0 changes | BL-026 OPEN 유지 (cashback branch 미구현), BL-024/027/028/029 RESOLVED 확정 |
| lpon-charge | 0 markers | 0 changes (PRESENCE) | REGISTRY 내 BL-005~008 (threshold) 전부 PRESENCE |
| lpon-payment | 0 markers | 0 changes (PRESENCE) | REGISTRY 내 BL-014/015 (status/threshold) PRESENCE |
| lpon-gift | 0 markers | 0 changes (PRESENCE) | REGISTRY 내 BL-G002~G006 PRESENCE |
| lpon-settlement | 0 markers | 0 changes (PRESENCE) | REGISTRY 내 BL-033~036 PRESENCE |
| lpon-budget | 0 markers | 0 changes (PRESENCE) | REGISTRY 내 BB-001~005 (budget threshold/status) PRESENCE |
| lpon-purchase | 0 markers | 0 changes (PRESENCE) | REGISTRY 내 BP-001~005 (purchase limit/status) PRESENCE |

> PRESENCE 결과 (0 ABSENCE markers) = spec에 정의된 BL이 모두 구현에 존재한다는 자동 증명.
> ABSENCE 있을 경우만 provenance.yaml에 신규 marker 추가 (write-provenance 설계 원칙).

## §2 WS-2: DIVERGENCE 5건 Production 매트릭스

### 2.1 F354에서 발행된 5건

| BL-ID | Severity | 원 설명 | Sprint 260 detector 상태 |
|-------|----------|---------|------------------------|
| BL-024 | HIGH | UNUSED_FULL 환불 7일 제한 미구현 | detectTemporalCheck → RESOLVED (refund.ts 이미 구현) |
| BL-026 | MEDIUM | cashback 환불 분기 미구현 | detectCashbackBranch → OPEN (미구현 확정) |
| BL-027 | LOW | 부분 환불 미완 구현 | detectUnderImplementation → RESOLVED (approveRefund 완전 구현) |
| BL-028 | MEDIUM | 제외 금액 하드코딩 | detectHardCodedExclusion → RESOLVED (exclusionAmount=0 제거) |
| BL-029 | MEDIUM | 만료 검사 미구현 | detectExpiryCheck → RESOLVED (expires_at 체크 구현) |

### 2.2 Production 재실측 (F434 신규 실행)

1. `tsx scripts/divergence/detect-bl.ts --source ... --rules ... --provenance ...` 실행 (lpon-refund)
2. CrossCheck recommendation 확인: 4 RESOLVED + 1 OPEN 유지 여부
3. docs/03-analysis/features/F358-phase-3b-divergence.analysis.md에 매트릭스 기록

### 2.3 분석 문서 구조

```
§1 DIVERGENCE 매트릭스 (5건 × 4 축)
§2 detector 신뢰도 분석 (BL별 confidence)
§3 production 코드 상태 (refund.ts 현재 구현)
§4 provenance 동기화 상태
§5 TD-28 해소 근거
```

## §3 WS-3: F356-A 재평가

### 3.1 evaluate.ts 실행 흐름

```
scripts/ai-ready/evaluate.ts
  ├─ sample-loader: .decode-x/spec-containers/lpon-*/  로드
  ├─ LLM: OpenRouter (claude-haiku via openrouter)
  ├─ 6기준 rubric: spec-container markdown 기반 채점
  ├─ cost guard: $25 warn / $30 abort
  └─ 출력: reports/sprint-267-f356a-evaluation-{date}.{json,md}
```

### 3.2 환경 설정

```bash
export OPENROUTER_API_KEY="$(cat ~/.secrets/openrouter-api-key)"
export COST_LIMIT=25
```

### 3.3 기준 비교

| 항목 | Sprint 232 F402 (baseline) | F434 (목표) |
|------|---------------------------|------------|
| 컨테이너 | 7 lpon-* | 7 lpon-* |
| 모델 | claude-haiku (OpenRouter) | claude-haiku (OpenRouter) |
| 정확도 | 83.3% | ≥ 80% |
| 비용 | $0.162 | ~$0.15~0.25 추정 |

> Sprint 264~266 이후 source code 추가로 spec-container 내용이 enriched됨.
> 정확도 변화(향상/유지/저하)가 주요 분석 포인트.

## §4 WS-4: LPON 35 R2 재패키징

### 4.1 rebundle-production.ts 래퍼 설계

기존 `rebundle-production.ts`는 단일 도메인 실행. LPON 전체 도메인 일괄 실행을 위한 wrapper script 신설.

```typescript
// scripts/divergence/rebundle-all-domains.ts
// LPON org의 모든 도메인에 대해 rebundle-production.ts를 순차 실행
const LPON_DOMAINS = ["giftvoucher"]; // LPON의 production 도메인
```

> ⚠️ LPON Java 소스 전체 재파싱(Tree-sitter 기반 endpoint spec 완전 교정)은 원본 Java 소스 미보유로 Phase 4 이관.
> 본 Sprint는 기존 D1 policies에서 bundled skill 재생성 + R2 upload 범위.

### 4.2 실행 순서

```bash
export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN_KTDS"
export ORG_ID=LPON

# LPON 도메인별 rebundle
DOMAIN=giftvoucher npx tsx scripts/rebundle-production.ts

# R2 업로드 확인 (5 sample)
curl -s "https://svc-skill-production.ktds-axbd.workers.dev/skills?org=LPON&limit=5" \
  -H "X-Internal-Secret: $(cat ~/.secrets/decode-x-internal)"
```

### 4.3 검증 기준

| 항목 | 기준 |
|------|------|
| R2 PUT 성공 | rebundle 완료 후 exit code 0 |
| HTTP verify | 5 bundled skill id → `GET /skills/{id}` HTTP 200 |
| AI-Ready evaluate | 1건 `POST /skills/{id}/ai-ready/evaluate` HTTP 200 |

## §5 파일 의존성

```
detect-bl.ts ─────────────────────────────────┐
  └─ packages/utils/src/divergence/index.ts   │
  └─ scripts/divergence/domain-source-map.ts  │  → reports/detect-bl-all-*.json
  └─ 반제품-스펙/.../working-version/src/domain/* │
                                              │
write-provenance.ts ──────────────────────────┤
  └─ 동일 의존성                              │  → .decode-x/spec-containers/*/provenance.yaml
                                              │
evaluate.ts ──────────────────────────────────┤
  └─ scripts/ai-ready/sample-loader.ts        │  → reports/sprint-267-f356a-*.{json,md}
  └─ .decode-x/spec-containers/lpon-*/        │
  └─ OpenRouter API                           │
                                              │
rebundle-production.ts ───────────────────────┘
  └─ CF API token (KTDS account)             → R2 skill-packages/*.skill.json
  └─ svc-policy production API
```

## §6 테스트 계약 (TDD Red Target)

본 Sprint는 script 실행 + 분석 문서 중심 (신규 코드 최소화). 기존 159 unit tests 회귀 0건 유지.

- `pnpm typecheck` clean
- `pnpm lint` clean  
- `pnpm test` (packages/utils) 159/159 PASS 회귀 없음
