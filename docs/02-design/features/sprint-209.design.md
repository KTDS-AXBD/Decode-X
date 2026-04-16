---
sprint: 209
requirement: AIF-REQ-034 E
title: Org 단위 B/T/Q 종합 Spec + UI
status: draft
created: 2026-04-16
---

# Sprint 209 Design — Org 단위 B/T/Q 종합 Spec + UI

## 1) 아키텍처 개요

```
┌────────────────────────────────────────────────────────────────┐
│  Frontend (app-web)                                            │
│  ┌──────────────┐  ┌───────────────────────┐                   │
│  │ /org-spec    │  │ /poc/ai-ready/:id     │                   │
│  │ Org 종합 Spec│  │ + "Spec" 탭 추가       │                   │
│  └──────┬───────┘  └──────────┬────────────┘                   │
│         │                     │                                │
│    api/org-spec.ts       api/org-spec.ts                       │
└─────────┼─────────────────────┼────────────────────────────────┘
          │                     │
          ▼                     ▼
┌────────────────────────────────────────────────────────────────┐
│  svc-skill Worker                                              │
│                                                                │
│  GET /admin/org-spec/:orgId/:type  ← NEW                       │
│  GET /skills/:id/spec/:type        ← 기존 (Sprint 208)         │
│                                                                │
│  spec-gen/                                                     │
│  ├── org-collector.ts      ← NEW: Org 전체 skills 집계          │
│  ├── index.ts              ← 확장: generateOrgSpec()            │
│  ├── types.ts              ← 확장: OrgSpecData, OrgSpecDocument │
│  ├── collectors.ts         ← 기존 (개별 skill)                   │
│  ├── generators/           ← 재사용 (섹션 생성 로직)              │
│  ├── llm-enhancer.ts       ← 재사용                              │
│  └── markdown-renderer.ts  ← 확장: OrgSpecDocument 지원          │
└────────────────────────────────────────────────────────────────┘
```

## 2) Backend API 설계

### `GET /admin/org-spec/:orgId/:type`

| 파라미터 | 위치 | 필수 | 설명 |
|---------|------|-----|------|
| orgId | path | ✅ | Organization ID |
| type | path | ✅ | business \| technical \| quality \| all |
| format | query | ❌ | json (기본) \| markdown |
| llm | query | ❌ | true (기본) \| false |
| limit | query | ❌ | 최대 skill 수 (기본 50, 최대 100) |

**Response (JSON, type != all):**
```json
{
  "success": true,
  "data": {
    "organizationId": "org-001",
    "type": "business",
    "generatedAt": "2026-04-16T...",
    "skillCount": 42,
    "sections": [...],
    "metadata": {
      "domain": "pension",
      "totalPolicies": 320,
      "avgTrustScore": 0.72,
      "aiReadyScore": { "business": 0.65, "technical": 0.4, "quality": 0.55 }
    }
  }
}
```

**Response (JSON, type == all):**
```json
{
  "success": true,
  "data": {
    "organizationId": "org-001",
    "specs": [
      { "type": "business", ... },
      { "type": "technical", ... },
      { "type": "quality", ... }
    ]
  }
}
```

## 3) 타입 설계

### types.ts 확장

```typescript
// Org 단위 집계 데이터
export interface OrgSpecData {
  organizationId: string;
  domain: string;            // 가장 많은 도메인
  skillCount: number;
  // 개별 skill 데이터 집계
  allPolicies: PolicySummary[];
  allTechnicalSpecs: TechnicalSpecData[];   // skill별
  allExtractions: ExtractionData[];          // skill별
  allTerms: TermSummary[];
  // 집계 메트릭
  avgTrustScore: number;
  adapters: { mcpCount: number; openapiCount: number };
}

export interface OrgSpecDocument {
  organizationId: string;
  type: SpecType;
  generatedAt: string;
  skillCount: number;
  sections: SpecSection[];
  metadata: OrgSpecMetadata;
}

export interface OrgSpecMetadata {
  domain: string;
  totalPolicies: number;
  avgTrustScore: number;
  aiReadyScore: { business: number; technical: number; quality: number };
}
```

## 4) 핵심 모듈 설계

### org-collector.ts

1. D1에서 organization_id로 skills 조회 (limit 적용)
2. R2에서 각 SkillPackage 로드 (batch 5건씩)
3. 개별 collector.ts의 `toPolicySummaries()`, `toTechnicalSpec()` 재사용
4. 모든 데이터를 `OrgSpecData`로 합산

### index.ts 확장

- `generateOrgSpec(env, orgId, type, options)` → OrgSpecDocument
- `generateAllOrgSpecs(env, orgId, options)` → OrgSpecDocument[]
- 기존 generators를 내부적으로 호출하되, 입력이 OrgSpecData → SkillSpecData 형태로 변환

### org-spec 라우트 (routes/org-spec.ts)

- `handleOrgSpec(request, env, orgId, type)` → Response
- 기존 spec.ts 패턴 복제 (format/llm 쿼리 파라미터 처리)

## 5) Worker 파일 매핑

### Worker 1: svc-skill Backend
| 파일 | 작업 |
|------|------|
| `services/svc-skill/src/spec-gen/types.ts` | OrgSpecData, OrgSpecDocument, OrgSpecMetadata 타입 추가 |
| `services/svc-skill/src/spec-gen/org-collector.ts` | **신규** — Org 전체 skills 집계 |
| `services/svc-skill/src/spec-gen/index.ts` | generateOrgSpec(), generateAllOrgSpecs() 추가 |
| `services/svc-skill/src/spec-gen/markdown-renderer.ts` | renderOrgSpecToMarkdown() 추가 |
| `services/svc-skill/src/routes/org-spec.ts` | **신규** — handleOrgSpec 라우트 핸들러 |
| `services/svc-skill/src/index.ts` | org-spec 라우트 등록 |

### Worker 2: app-web Frontend
| 파일 | 작업 |
|------|------|
| `apps/app-web/src/api/org-spec.ts` | **신규** — org-spec API client |
| `apps/app-web/src/pages/org-spec.tsx` | **신규** — Org 종합 Spec 페이지 |
| `apps/app-web/src/pages/poc-ai-ready-detail.tsx` | "Spec" 탭 추가 (개별 skill spec 조회) |
| `apps/app-web/src/app.tsx` | org-spec 라우트 등록 |
| `apps/app-web/src/components/Sidebar.tsx` | Org Spec 메뉴 항목 추가 |

## 6) 테스트 계약

- typecheck PASS
- lint PASS
- 기존 테스트 regression 없음
