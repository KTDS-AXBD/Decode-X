---
id: AIF-DESIGN-229
title: Sprint 229 Design — F383 AXIS DS Tier 3 기여 PR
type: design
status: IN_PROGRESS
sprint: 229
f_items: [F383]
created: 2026-04-22
updated: 2026-04-22
---

# Sprint 229 Design — F383 AXIS DS Tier 3 기여

## §1 배경

AXIS DS는 외부 리소스를 `apps/web/data/*.json`에 등록하는 federation 방식을 사용한다.
기존 `shadcn-blocks.json`, `monet-resources.json` 패턴을 따라 `decode-x-kit-resources.json`을 추가한다.

## §2 대상 컴포넌트

| 컴포넌트 | 소스 파일 | Category | AXIS DS 등록명 |
|----------|----------|----------|---------------|
| SpecSourceSplitView | `apps/app-web/src/components/engineer/SpecSourceSplitView.tsx` | agentic | `decode-x-spec-source-split-view` |
| ProvenanceInspector | `apps/app-web/src/components/engineer/ProvenanceInspector.tsx` | agentic | `decode-x-provenance-inspector` |
| FoundryXTimeline (StageReplayer) | `apps/app-web/src/components/executive/FoundryXTimeline.tsx` | agentic | `decode-x-stage-replayer` |

## §3 Generic Props Shape

### SpecSourceSplitViewProps

```typescript
export interface PolicyItem {
  code: string;
  title: string;
  condition: string;
  criteria: string;
  outcome: string;
  confidence: number;
}

export interface SpecSourceData {
  skillId: string;
  domain: string;
  extractedAt: string;
  policies: PolicyItem[];
  sources: SourceItem[];
  pipelineStages: string[];
  terms: TermItem[];
  documentIds: string[];
}

export interface SpecSourceSplitViewProps {
  data: SpecSourceData | null;
  loading?: boolean;
  error?: string;
  locale?: "ko" | "en";           // i18n 확장 포인트
}
```

### ProvenanceInspectorProps

```typescript
export interface ProvenanceInspectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: SpecSourceData | null;
  selectedPolicyCode?: string;
}
```

### StageReplayerProps

```typescript
export type HandoffStatus = "completed" | "pending" | "failed";

export interface ComplianceItem {
  label: string;
  passed: boolean;
}

export interface StageItem {
  id: string;
  name: string;
  nameDisplay?: string;            // optional localized name
  status: HandoffStatus;
  completedAt?: string;
  aiReadyScore?: number;
  policyCount?: number;
  compliance?: ComplianceItem[];
  roundTripSummary?: string;
}

export interface StageReplayerProps {
  items: StageItem[];
  title?: string;
  subtitle?: string;
  dataSource?: string;
}
```

## §4 AXIS DS JSON Schema

파일: `apps/web/data/decode-x-kit-resources.json` (AXIS DS 레포 내)

```json
[
  {
    "name": "Spec Source Split View",
    "slug": "decode-x-spec-source-split-view",
    "description": "좌측 정책 목록(Spec Panel)과 우측 재구성 마크다운 패널이 동기화되는 Spec→Source 역추적 뷰. AI 역공학 파이프라인 결과물을 검토하는 엔지니어 워크벤치용.",
    "category": "agentic",
    "version": "0.1.0",
    "author": "AXBD-Team",
    "tags": ["split-view", "spec", "provenance", "ai-pipeline", "engineer"],
    "features": [
      "Synchronized Spec/Source Panel",
      "Policy Card List",
      "Smooth Section Scroll",
      "Confidence Badge",
      "Provenance Inspector Trigger"
    ],
    "dependencies": {
      "react": "^18",
      "lucide-react": "^0.400.0"
    },
    "devDependencies": {},
    "type": "external",
    "externalUrl": "https://github.com/KTDS-AXBD/Decode-X/blob/main/apps/app-web/src/components/engineer/SpecSourceSplitView.tsx",
    "source": "decode-x-kit"
  },
  {
    "name": "Provenance Inspector",
    "slug": "decode-x-provenance-inspector",
    "description": "AI 역공학 결과물의 출처(provenance)를 소스/파이프라인/용어 3-탭으로 시각화하는 사이드 드로어. 정책 코드별 신뢰도·원본 문서·추출 스테이지 추적.",
    "category": "agentic",
    "version": "0.1.0",
    "author": "AXBD-Team",
    "tags": ["provenance", "inspector", "dialog", "tabs", "ai-pipeline"],
    "features": [
      "3-Tab Panel (Sources / Pipeline / Terms)",
      "Confidence Badge",
      "Document Link List",
      "Pipeline Stage Timeline",
      "Ontology Term Browser"
    ],
    "dependencies": {
      "react": "^18",
      "lucide-react": "^0.400.0"
    },
    "devDependencies": {},
    "type": "external",
    "externalUrl": "https://github.com/KTDS-AXBD/Decode-X/blob/main/apps/app-web/src/components/engineer/ProvenanceInspector.tsx",
    "source": "decode-x-kit"
  },
  {
    "name": "Stage Replayer",
    "slug": "decode-x-stage-replayer",
    "description": "AI 파이프라인의 N-stage 처리 결과를 가로 스크롤 타임라인으로 시각화. 각 스테이지별 상태(completed/pending/failed), AI-Ready Score, 컴플라이언스 항목을 카드로 표시.",
    "category": "agentic",
    "version": "0.1.0",
    "author": "AXBD-Team",
    "tags": ["timeline", "pipeline", "stages", "ai-ready", "compliance"],
    "features": [
      "Horizontal Scroll Timeline",
      "Stage Status Cards",
      "AI-Ready Score Badge",
      "Compliance Checklist",
      "Progress Bar"
    ],
    "dependencies": {
      "react": "^18",
      "lucide-react": "^0.400.0"
    },
    "devDependencies": {},
    "type": "external",
    "externalUrl": "https://github.com/KTDS-AXBD/Decode-X/blob/main/apps/app-web/src/components/executive/FoundryXTimeline.tsx",
    "source": "decode-x-kit"
  }
]
```

## §5 구현 파일 매핑

| 파일 | 작업 | 위치 |
|------|------|------|
| `apps/app-web/src/components/engineer/SpecSourceSplitView.tsx` | generic props 타입 분리 + `locale` prop 추가 | Decode-X 레포 (로컬) |
| `apps/app-web/src/components/engineer/ProvenanceInspector.tsx` | `ProvenanceResolveData` → `SpecSourceData` 타입 별칭 export | Decode-X 레포 (로컬) |
| `apps/app-web/src/components/executive/FoundryXTimeline.tsx` | `StageReplayerProps` generic 분리 export | Decode-X 레포 (로컬) |
| `apps/app-web/src/components/executive/HandoffCard.tsx` | `HandoffService` → `StageItem` 별칭 export | Decode-X 레포 (로컬) |
| `apps/web/data/decode-x-kit-resources.json` | 3 컴포넌트 federation 등록 | **AXIS DS fork** |

## §6 PR 메타데이터

- **Fork**: `AXBD-Team/AXIS-Design-System`
- **Branch**: `feat/decode-x-kit-resources`
- **Base**: `IDEA-on-Action/AXIS-Design-System:main`
- **Title**: `feat(web): Add Decode-X Kit agentic components to federation registry`

## §7 DoD 체크리스트

- [ ] `SpecSourceSplitViewProps` generic 타입 export
- [ ] `ProvenanceInspectorProps` generic 타입 export
- [ ] `StageReplayerProps` generic 타입 export
- [ ] AXIS DS fork 생성
- [ ] `apps/web/data/decode-x-kit-resources.json` 추가
- [ ] PR open + URL 확보
- [ ] SPEC.md F383 DONE + PR URL 기록

## §8 Storybook Story 가이드 (PR description 포함)

```tsx
// SpecSourceSplitView.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { SpecSourceSplitView } from './SpecSourceSplitView';

const meta: Meta<typeof SpecSourceSplitView> = {
  title: 'Agentic/SpecSourceSplitView',
  component: SpecSourceSplitView,
};
export default meta;

export const WithData: StoryObj<typeof SpecSourceSplitView> = {
  args: {
    data: {
      skillId: 'demo-001',
      domain: '예시 도메인',
      extractedAt: new Date().toISOString(),
      policies: [
        {
          code: 'POL-DEMO-001',
          title: '예시 정책',
          condition: '적용 조건',
          criteria: '판단 기준',
          outcome: '결과',
          confidence: 0.9,
        },
      ],
      sources: [],
      pipelineStages: ['Ingestion', 'Extraction', 'Policy Inference'],
      terms: [],
      documentIds: ['doc-001'],
    },
  },
};
```
