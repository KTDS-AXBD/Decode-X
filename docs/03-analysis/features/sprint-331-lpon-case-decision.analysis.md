---
title: Sprint 331 F503 — LPON vs lpon Case Sensitivity 정책 결정
project: Decode-X
type: Analysis
docCode: AIF-ANLS-120
sprint: 331
fitem: F503
sessionId: 298
author: Sinclair Seo
created: 2026-05-11
updated: 2026-05-11
status: DONE
related:
  - F501 (Sprint 329 /skills GET endpoint ?org= query param 지원, AIF-REQ-040 R3 후속)
  - F487 (Sprint 321 F358 Phase 4 LPON 전수 production 재추출 PARTIAL)
  - F492 (Sprint 325 F356-A iterate Sonnet 79.2% Conditional GO)
  - F356-A (LPON-schema bundled skills AI-Ready evaluation)
  - AIF-REQ-040 R3 (LPON vs lpon 케이스 분리 패턴)
---

# Sprint 331 F503 — LPON vs lpon Case Sensitivity 정책 결정

## 1. 배경

Sprint 329 F501 (`?org=` query param 지원, 세션 297 Master inline) production smoke 검증 시 결정적 발견:

```
?org=lpon   →  total=8    (lowercase superseded 잔존)
?org=LPON   →  total=894  (859 superseded + 35 bundled)
?org=LPON&status=bundled  →  total=35  (F356-A 평가 대상 정확 매칭)
```

D1 `skills.organization_id` 컬럼이 **case-sensitive 그대로 저장**되어 동일 tenant가 두 cluster로 분리됨. AIF-REQ-040 R3 후속 항목 ("LPON vs lpon 케이스 분리 패턴")으로 등록되었던 본 이슈를 본 Sprint에서 정책 결정 + TD 등록(docs-only) 단계로 진행한다.

## 2. 현 상태 (실측 데이터)

| Tenant ID | bundled | reviewed | published | superseded | 합계 | 비고 |
|-----------|---------|----------|-----------|------------|------|------|
| **LPON** (대문자) | 35 | 0 | 0 | 859 | 894 | F356-A Phase 2 평가 대상 (Conditional GO) |
| **lpon** (소문자) | 0 | 8 | 0 | 0 | 8 | Sprint 245 F414 reviewed 8건 잔존 |
| **(합계)** | 35 | 8 | 0 | 859 | 902 | |

> **출처**: production D1 `wrangler d1 execute db-skill --remote --command "SELECT organization_id, status, COUNT(*) FROM skills GROUP BY 1, 2"` (Sprint 323 F487 후속 Master 독립 검증 + Sprint 329 F501 smoke)

## 3. 3안 정량 분석

### 3.1 안 A — Case-Insensitive Normalize at Endpoint

```typescript
// services/svc-skill/src/routes/skills.ts:220
const organizationId =
  (url.searchParams.get("org") ?? request.headers.get("X-Organization-Id") ?? "unknown")
    .toUpperCase();
```

| 항목 | 평가 |
|------|------|
| **코드 변경 규모** | 1 line (.toUpperCase() 추가) |
| **D1 데이터 변경** | 없음 (column 그대로 유지) |
| **즉시 효과** | `?org=lpon` → 894 (LPON 894 통합 노출, lpon 8 흡수) |
| **호환성** | 기존 LPON 호출 차질 0건 (이미 대문자) |
| **장점** | 최소 변경 + 즉시 효과 + 회귀 위험 거의 0 |
| **단점** | (a) tenant ID convention이 코드 1곳에 갇힘 (다른 endpoint가 동일 normalize 안 적용 시 drift 재발), (b) `unknown`도 `UNKNOWN`이 되어 의미 변경, (c) production D1 row의 `organization_id` 값은 그대로라 SELECT 쿼리에서 case-sensitivity 신중 (`WHERE organization_id = ?` 그대로 동작 — `?org` 입력만 normalize되어 binding 값도 대문자) |
| **롤백 비용** | 1 line revert, ~5분 |
| **추정 시간** | 코드 fix 10분 + production deploy + smoke verify 5분 = ~15분 |
| **추정 비용** | $0 (LLM 호출 없음, Workers 배포만) |

### 3.2 안 B — Strict 유지 + UI/Client 책임

| 항목 | 평가 |
|------|------|
| **코드 변경 규모** | 0 line (현 상태 유지) |
| **D1 데이터 변경** | 없음 |
| **즉시 효과** | 없음 (현 동작 유지) |
| **호환성** | 100% (변경 0) |
| **장점** | 변경 0 = 회귀 0 + tenant ID convention이 contract로 명시되면 architecture 정합성 ↑ |
| **단점** | (a) lpon 8건 사용자 경험 부정확 잔존, (b) 다른 endpoint마다 동일 case-sensitivity drift 위험 누적, (c) tenant ID convention 미문서화 시 외부 통합 시 마다 협의 필요, (d) F501 query param 지원이 case-sensitivity 차원에선 미해결로 잔존 |
| **롤백 비용** | N/A |
| **추정 시간** | docs 1건 (tenant ID 대문자 SSOT 명시) ~10분 |
| **추정 비용** | $0 |

### 3.3 안 C — Tenant ID 표준화 + 데이터 마이그레이션

`organization_id` 컬럼을 LPON 대문자 SSOT로 표준화. lpon 소문자 8건을 LPON으로 마이그레이션.

```sql
-- D1 migration (db-skill 0009_normalize_organization_id.sql 예시)
UPDATE skills SET organization_id = 'LPON' WHERE organization_id = 'lpon';
-- + 후속 row check
SELECT organization_id, COUNT(*) FROM skills GROUP BY 1;
```

| 항목 | 평가 |
|------|------|
| **코드 변경 규모** | (a) D1 migration 1 SQL file, (b) F501 endpoint normalize 1 line(보너스), (c) AIF-REQ-040 R3 후속 SPEC 갱신 |
| **D1 데이터 변경** | 8 rows UPDATE (production D1) |
| **즉시 효과** | tenant ID 대문자 SSOT, 모든 endpoint가 동일 case 처리 |
| **호환성** | (a) 기존 LPON 호출 차질 0건, (b) lpon 호출 시 D1 매칭은 endpoint normalize 적용 후 OK |
| **장점** | (a) tenant ID convention SSOT, (b) 다른 endpoint에도 영향 미적용 위험 영구 차단, (c) AIF-REQ-040 R3 후속 종결 + 데이터 정합성 최상 |
| **단점** | (a) production D1 UPDATE은 destructive (롤백 비용 ↑ — 원본 row 백업 필요), (b) Workers production deploy + D1 migration 두 단계 동시 진행 위험, (c) 8 rows의 audit trail 변경 (기록 컬럼 created_at 보존 가능하나 organization_id 변경 자체가 추적 항목 변동), (d) F490 secret rotation 등 다른 deferred 작업과 연계 일정 협의 필요 |
| **롤백 비용** | (a) D1 reverse migration 작성 + 재실행 (8 rows DOWN), (b) 일정 + 통보 비용 |
| **추정 시간** | (a) D1 migration 작성 + dry-run + production apply ~30분, (b) F501 normalize fix ~10분, (c) verify (lpon=0, LPON=902) ~5분 = ~45분 |
| **추정 비용** | $0 (LLM 0, D1 migration cost 무시) + 운영 통보 + 모니터링 |

## 4. 비교 매트릭스

| 평가 축 | 안 A (Normalize) | 안 B (Strict) | 안 C (표준화 + 마이그) |
|---------|:----------------:|:-------------:|:----------------------:|
| 즉시 효과 | ⭐⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐⭐ |
| 변경 규모 | ⭐⭐⭐⭐⭐ (1 line) | ⭐⭐⭐⭐⭐ (0 line) | ⭐⭐⭐ (migration + line) |
| 회귀 위험 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ (D1 UPDATE) |
| 영구 해소도 | ⭐⭐⭐ (1곳 normalize, 다른 endpoint drift 위험) | ⭐⭐ (docs만, 코드 강제 없음) | ⭐⭐⭐⭐⭐ (SSOT 영구 정착) |
| 운영 부담 | ⭐⭐⭐⭐⭐ (단순 fix) | ⭐⭐⭐⭐⭐ (none) | ⭐⭐⭐ (production migration 통보) |
| 데이터 정합성 | ⭐⭐⭐ (D1 row 그대로) | ⭐⭐ (lpon/LPON 분리 유지) | ⭐⭐⭐⭐⭐ (단일 case) |
| 추정 시간 | ~15분 | ~10분 | ~45분 |

## 5. 추천

**안 A (Case-Insensitive Normalize) 채택 권장** — 변경 최소 + 즉시 효과 + 회귀 위험 거의 0. 단 안 A는 본질적 해결책이 아니라 **단일 endpoint 차단막**이라 다른 endpoint(POST `/skills`, batch eval 등)에서 case 처리 일관성을 별도 docs로 강제할 필요. 안 C는 본질적 영구 해결책이지만 production D1 UPDATE 위험 + F490 등 다른 deferred 작업과 우선순위 협의 필요. 안 B는 case-sensitivity drift 재발 위험으로 비권장.

## 6. 결정

**사용자 결정 (2026-05-11 AskUserQuestion)**: **안 A — Endpoint Normalize** 채택.

근거:
- (a) 즉시 효과 ⭐⭐⭐⭐⭐ + 변경 1 line 최소 + 회귀 위험 거의 0 (안 C 대비 ~3배 빠른 배포)
- (b) Production D1 destructive UPDATE 회피 (안 C 대비 위험성 ↓)
- (c) lpon 8 rows의 audit trail 보존 (D1 row의 `organization_id` 변경 없음, endpoint에서만 normalize)
- (d) AIF-REQ-040 R3 후속 즉시 종결 가능

후속 시점: **F505 별도 Sprint 분리** — Sprint 331은 docs-only 결정/분석/TD 등록까지 완결, 실 코드 fix는 F505 후속 Sprint에서 `services/svc-skill/src/routes/skills.ts:220` `.toUpperCase()` + production deploy + smoke verify.

**보완 조치 (안 A 단점 차단)**:
- Tenant ID 대문자 SSOT를 `docs/governance/tenant-id-convention.md` (별도 docs, F505와 함께 작성)로 명시 → 다른 endpoint(POST `/skills` 등)에서 case-sensitivity drift 재발 차단
- F505 Plan에 "현 운영 단일 endpoint 외 다른 endpoint case 처리 grep audit" 단계 포함

## 7. TD-64 등록 (안 A 채택 후속)

```
TD-64 | LPON vs lpon case sensitivity 영구 차단 — F505 별도 Sprint (.toUpperCase() endpoint normalize) + docs/governance/tenant-id-convention.md 작성 | Sprint 329 F501 / Sprint 331 F503 후속 / P3 / 2026-05-11 (세션 298 등록)
```

## 8. 후속 (별도 Sprint 분리 대상)

- **F505 (Sprint 미정)** — 안 A 적용:
  1. `services/svc-skill/src/routes/skills.ts:220` `.toUpperCase()` 추가
  2. unit test 추가 (lowercase 입력 → uppercase normalize 검증)
  3. production deploy + smoke verify (`?org=lpon` → 894, `?org=LPON` → 894 양쪽 동일)
  4. `docs/governance/tenant-id-convention.md` 신설 (tenant ID 대문자 SSOT 명시)
  5. SPEC §8 TD-64 ✅ 해소 마킹
- **추정**: ~30분 (코드 + deploy + smoke + docs)
- **의존성**: Production deploy 권한 (wrangler CLI)

## 9. 참조

- `services/svc-skill/src/routes/skills.ts:220` — F501 query param parsing (X-Organization-Id fallback)
- Sprint 329 F501 — `/skills` GET endpoint ?org= query param 지원 (AIF-REQ-040 R3 후속)
- Sprint 323 F487 후속 — Production D1 cross-check (db-skill 3,985 rows 무손실 입증)
- Sprint 325 F492 — F356-A iterate Sonnet 38/48 PASS = 79.2% (LPON 8 skills 평가 대상 → 모두 대문자)
- AIF-REQ-040 R3 — LPON vs lpon 케이스 분리 패턴 (본 Sprint로 일부 종결)
