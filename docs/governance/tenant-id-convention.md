---
name: tenant-id-convention
description: Tenant ID (organization_id) 대문자 SSOT — 모든 endpoint normalize 규칙
type: governance
code: AIF-GOV-001
version: 1.0
status: active
created: 2026-05-12
updated: 2026-05-12
author: Sinclair Seo
session: 299
related: AIF-ANLS-120, TD-64, F503, F505
---

# Tenant ID Convention — 대문자 SSOT

> **결정**: Decode-X 시스템의 모든 tenant ID(`organization_id`)는 **대문자**를 SSOT로 사용한다.
> 소문자 입력은 endpoint 진입 시점에 `.toUpperCase()` normalize한다.

## 배경

세션 297 Sprint 329 F501 `/skills` GET endpoint `?org=` query param 지원 추가 검증 시 발견:
- `?org=lpon` (소문자) → **8 rows** (오래된 lowercase tenant entries)
- `?org=LPON` (대문자) → **894 rows** (35 bundled + 859 superseded, 정식 운영 데이터)

같은 tenant가 케이스 차이로 **cluster 분리**되어 운영 데이터 가시성 저하.

세션 298 Sprint 331 F503에서 3안 정량 분석 (AIF-ANLS-120):
- (A) Endpoint Normalize `.toUpperCase()` — ~15분 / 1 line / 회귀 0 / 즉시 효과 ✅ 채택
- (B) Strict 유지 — 0 line / 효과 0 / case drift 재발 위험
- (C) Tenant ID 표준화 + D1 migration — ~45분 / 8 rows UPDATE / 영구 해소 / production destructive

## 규칙

### 1. SSOT는 대문자

- D1 `skills.organization_id`, `policies.organization_id` 등 모든 테넌트 식별자 컬럼: **대문자 저장**
- 예: `LPON`, `MIRAEASSET`, `KTDS`

### 2. Endpoint normalize 의무

모든 public/internal API endpoint가 `organizationId` 또는 `organization_id` query param/header를 읽을 때 다음 패턴을 강제:

```typescript
// F505 (Sprint 334 세션 299): tenant-id-convention.md 강제
const organizationId = (
  url.searchParams.get("org") ??
  request.headers.get("X-Organization-Id") ??
  "unknown"
).toUpperCase();
```

### 3. 적용 범위

| 위치 | 적용 |
|------|------|
| **API endpoint 진입점** | ✅ `.toUpperCase()` normalize 필수 |
| **D1 INSERT/UPDATE** | ✅ 대문자 저장 (정합성 강제) |
| **Internal service binding 호출** | ✅ caller 측에서 이미 normalize된 값 전달 |
| **R2 key prefix** | ⚠️ 별도 정책 (file system case sensitivity에 따라) |
| **MCP tool args** | ✅ tool 진입점에서 normalize |

### 4. 예외 처리

다음 경우 normalize 면제:
- **로그 출력**: 사용자 입력 그대로 표시 가능 (감사 추적)
- **에러 메시지**: 사용자가 입력한 case 그대로 echo

## 검증

```bash
# Smoke verify pattern
SECRET=$(cat ~/.secrets/decode-x-internal)
curl -s -H "X-Internal-Secret: $SECRET" \
  "https://svc-skill.ktds-axbd.workers.dev/skills?org=lpon&limit=1" | jq '.data.total'
# 기대: 894 (대문자 LPON cluster와 동일)
```

## 현 적용 상태 (2026-05-12 기준)

| Endpoint | 파일 | 적용 | Sprint |
|----------|------|:----:|--------|
| `GET /skills` (svc-skill) | `services/svc-skill/src/routes/skills.ts:220` | ✅ | 334 / F505 |
| `POST /skills` (svc-skill) | 동 파일 (확장 필요) | ⚠️ TODO | 차기 |
| `GET /policies` (svc-policy) | `services/svc-policy/src/routes/policies.ts` | ⚠️ TODO | 차기 |
| Pipeline event handler | 각 SVC consumer | ⚠️ TODO 별도 검토 |

## 차기 작업

- (a) **POST endpoints normalize 확장**: `POST /skills`, `POST /policies` 등 write endpoint도 동일 normalize 적용
- (b) **D1 migration auditor**: 기존 lowercase tenant rows를 cron/script로 detect (감사용)
- (c) **CI lint rule**: PR diff에서 `organizationId` 추출 시 `.toUpperCase()` 미포함 시 경고

## 참조

- **Sprint 331 F503** (세션 298, docs-only 결정): 3안 분석 + 안 A 채택
- **Sprint 334 F505** (세션 299, 본 문서 신설): 코드 fix + production deploy + smoke
- **AIF-ANLS-120**: `docs/03-analysis/features/sprint-331-lpon-case-decision.analysis.md`
- **TD-64**: SPEC.md §8 (해소 완료)
- **rules/development-workflow.md**: Worker Secret Store env-scoped divergence 참조 (별도 governance)
