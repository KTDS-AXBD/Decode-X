---
code: AIF-DSGN-deliverable-export-ui-design
title: "SI 산출물 Export UI Design Document"
version: 1.0
status: active
category: design
created: 2026-03-10
updated: 2026-03-10
author: Sinclair Seo
---

# SI 산출물 Export UI Design Document

> **Summary**: Export Center 페이지에 "SI 산출물" 탭을 추가하여 5종 마크다운 산출물(D1~D5)을 미리보기·다운로드하는 UI 설계

> **Planning Doc**: [deliverable-export-ui.plan.md](../01-plan/features/deliverable-export-ui.plan.md)

---

## 1. Design Principles

1. **기존 코드 패턴 준수**: `api/export.ts`, `api/reports.ts` 스타일의 API 클라이언트, `buildHeaders()` 활용
2. **최소 변경**: export-center.tsx는 Tabs 래핑만 추가, 기존 Spec Package 로직 유지
3. **Lazy fetch**: 미리보기 클릭 시에만 API 호출 (탭 진입만으로 5개 동시 호출 방지)
4. **MarkdownContent 확장**: react-markdown 미도입, 기존 커스텀 파서에 테이블만 추가

---

## 2. Architecture

### 2.1 컴포넌트 트리

```
ExportCenterPage (export-center.tsx) ─── 수정
├── 헤더 (제목 + 새로고침) ← 기존 유지
├── Tabs (Radix UI) ← 신규 래핑
│   ├── TabsTrigger "Spec Package"
│   │   └── TabsContent ← 기존 내용 그대로 이동
│   │       ├── KPI Dashboard
│   │       ├── ExportForm + PackageList
│   │       └── ApprovalGate
│   └── TabsTrigger "SI 산출물"
│       └── TabsContent
│           └── DeliverableTab ← 신규
│               ├── 좌측 (col-span-5): DeliverableCardList
│               │   ├── DeliverableCard × 5 (D1~D5)
│               │   └── "전체 다운로드" 버튼
│               └── 우측 (col-span-7): DeliverablePreview
│                   ├── 로딩 스피너 / 빈 상태
│                   └── MarkdownContent (테이블 지원)
```

### 2.2 데이터 흐름

```
1) 탭 전환 "SI 산출물" → DeliverableTab mount
   (API 호출 없음 — 카드 목록만 렌더링)

2) 사용자 "미리보기" 클릭
   → fetchDeliverableMarkdown(orgId, type)
   → GET /api/deliverables/export/{type}?organizationId={org}
   → Pages Function → svc-analytics → text/markdown 반환
   → state에 캐싱 + DeliverablePreview에 전달

3) 사용자 "다운로드" 클릭
   → 캐시에 있으면 즉시 Blob 변환 → triggerBlobDownload
   → 캐시에 없으면 fetch → Blob → download

4) "전체 다운로드" 클릭
   → fetchDeliverableMarkdown(orgId, "all")
   → 단일 .md 파일 다운로드
```

---

## 3. API Client

### 3.1 `api/deliverables.ts` (신규)

```typescript
import { buildHeaders } from "./headers";

const API_BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "/api";

export type DeliverableType =
  | "interface-spec"
  | "business-rules"
  | "glossary"
  | "gap-report"
  | "comparison"
  | "all";

/**
 * Fetch deliverable markdown text.
 * Returns raw markdown string (not JSON — backend returns text/markdown).
 */
export async function fetchDeliverableMarkdown(
  organizationId: string,
  type: DeliverableType,
): Promise<string> {
  const params = new URLSearchParams({ organizationId });
  const res = await fetch(
    `${API_BASE}/deliverables/export/${type}?${params.toString()}`,
    { headers: buildHeaders({ organizationId }) },
  );
  if (!res.ok) {
    throw new Error(`Deliverable fetch failed: ${res.status}`);
  }
  return res.text();
}
```

**설계 포인트**:
- `exportReportMarkdown()` (api/reports.ts) 패턴과 동일: `res.text()` 반환
- JSON 파싱 불필요 — 백엔드가 `text/markdown` 반환
- `buildHeaders()` 사용 — 기존 인증 패턴 준수

---

## 4. Component Specifications

### 4.1 `DeliverableTab.tsx` (신규)

**Props**: 없음 (organizationId는 useOrganization() 훅으로)

**State**:
```typescript
const [selectedType, setSelectedType] = useState<DeliverableType | null>(null);
const [previewCache, setPreviewCache] = useState<Partial<Record<DeliverableType, string>>>({});
const [loading, setLoading] = useState(false);
```

**동작**:
- `handlePreview(type)`: 캐시 확인 → 없으면 fetch → previewCache 저장 → selectedType 설정
- `handleDownload(type)`: 캐시 확인 → 있으면 즉시 Blob → 없으면 fetch → Blob → triggerBlobDownload
- `handleDownloadAll()`: `handleDownload("all")` 호출

**레이아웃**: `grid grid-cols-12 gap-6` (좌 col-span-5, 우 col-span-7)

### 4.2 `DeliverableCard.tsx` (신규)

**Props**:
```typescript
interface DeliverableCardProps {
  code: string;          // "D1" ~ "D5"
  title: string;         // "인터페이스 설계서"
  description: string;   // "API/테이블 매칭 현황 + Gap 목록"
  icon: React.ReactNode; // lucide-react 아이콘
  selected: boolean;     // 현재 미리보기 선택 여부
  loading: boolean;      // 로딩 중 여부
  onPreview: () => void;
  onDownload: () => void;
}
```

**렌더링**:
```
┌─────────────────────────────────────┐
│ [icon] D1 인터페이스 설계서         │
│ API/테이블 매칭 현황 + Gap 목록     │
│                    [미리보기] [⬇]   │
└─────────────────────────────────────┘
```

- Card 컴포넌트 활용 (기존 UI 일관성)
- `selected` 상태: `border-primary` 강조
- 미리보기 버튼: `variant="outline"` + `Eye` 아이콘
- 다운로드 버튼: `variant="ghost"` + `Download` 아이콘

### 4.3 `DeliverablePreview.tsx` (신규)

**Props**:
```typescript
interface DeliverablePreviewProps {
  markdown: string | null;
  loading: boolean;
  selectedType: DeliverableType | null;
}
```

**상태별 렌더링**:

| 조건 | 표시 |
|------|------|
| `selectedType === null` | "산출물을 선택하면 미리보기를 볼 수 있어요" |
| `loading === true` | Spinner + "로딩 중..." |
| `markdown !== null` | MarkdownContent 렌더링 (스크롤 가능) |

**스타일**: `max-h-[calc(100vh-280px)] overflow-y-auto` (스크롤 영역)

### 4.4 Deliverable 카드 데이터

```typescript
export const DELIVERABLE_ITEMS: Array<{
  type: DeliverableType;
  code: string;
  title: string;
  description: string;
  iconName: string;    // lucide-react 아이콘명
  filename: string;    // 다운로드 파일명 패턴
}> = [
  {
    type: "interface-spec",
    code: "D1",
    title: "인터페이스 설계서",
    description: "API/테이블 매칭 현황, 검증 완료·미문서화 목록",
    iconName: "FileText",
    filename: "D1-interface-spec",
  },
  {
    type: "business-rules",
    code: "D2",
    title: "업무규칙 정의서",
    description: "도메인별 정책 (조건-기준-결과 3-tuple), 신뢰도",
    iconName: "BookOpen",
    filename: "D2-business-rules",
  },
  {
    type: "glossary",
    code: "D3",
    title: "용어사전",
    description: "SKOS/JSON-LD 용어, 유형 분포, 계층 트리",
    iconName: "GraduationCap",
    filename: "D3-glossary",
  },
  {
    type: "gap-report",
    code: "D4",
    title: "Gap 분석 보고서",
    description: "4-perspective 커버리지, 도메인별 Gap 분포",
    iconName: "BarChart3",
    filename: "D4-gap-report",
  },
  {
    type: "comparison",
    code: "D5",
    title: "As-Is/To-Be 비교표",
    description: "소스 vs 문서 매트릭스, AI 추출 품질 비교",
    iconName: "GitCompare",
    filename: "D5-comparison",
  },
];
```

---

## 5. MarkdownContent 테이블 확장

### 5.1 현재 지원 범위

`markdown-content.tsx`가 파싱하는 타입:
- `h1`, `h2`, `h3`, `li`, `ol`, `hr`, `p`
- 인라인: `**bold**`, `` `code` ``, `[link](url)`

**미지원**: 테이블 (`| ... |` 구문)

### 5.2 테이블 파싱 설계

`parseLines()` 함수를 확장하여 연속된 `|`행을 테이블 블록으로 그룹핑:

```typescript
// 새 타입 추가
interface MarkdownTable {
  type: 'table';
  headers: string[];
  alignments: Array<'left' | 'center' | 'right'>;
  rows: string[][];
}

type MarkdownBlock = MarkdownLine | MarkdownTable;
```

**파싱 알고리즘**:
1. 행이 `|`로 시작하면 테이블 블록 수집 시작
2. 2번째 행이 `|---|` 패턴이면 헤더 구분선 (제거)
3. 정렬 감지: `:---:` → center, `---:` → right, `---` → left
4. `|`로 시작하지 않는 행을 만나면 테이블 블록 종료
5. 각 셀의 `\|` 이스케이프 → 원본 `|`로 복원

**렌더링**:
```tsx
case 'table':
  return (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {block.headers.map((h, j) => (
              <th key={j} className="border px-2 py-1 text-left font-medium"
                  style={{ backgroundColor: 'var(--surface)', textAlign: block.alignments[j] }}>
                {renderInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="border px-2 py-1"
                    style={{ textAlign: block.alignments[j] }}>
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
```

### 5.3 blockquote 지원 추가

SI 산출물 마크다운에 `> 생성일: ...` 형태의 blockquote가 포함되므로 추가:

```typescript
// parseLines에 추가
if (line.startsWith('> ')) return { type: 'blockquote', text: line.slice(2) };
```

```tsx
case 'blockquote':
  return (
    <blockquote key={i} className="border-l-2 pl-3 my-1 text-sm italic"
                style={{ borderColor: 'var(--primary)', color: 'var(--text-secondary)' }}>
      {inline}
    </blockquote>
  );
```

---

## 6. Infrastructure Changes

### 6.1 Pages Function 라우트 추가

**파일**: `functions/api/[[path]].ts`

```typescript
// ROUTE_TABLE에 추가
const ROUTE_TABLE: Record<string, string> = {
  // ... 기존 항목 ...
  deliverables: "svc-analytics",  // ← 추가
};
```

### 6.2 Vite Dev Proxy 추가

**파일**: `vite.config.ts`

```typescript
const SERVICE_MAP: Record<string, { service: string; port: number }> = {
  // ... 기존 항목 ...
  deliverables: { service: "svc-analytics", port: 8710 },  // ← 추가
};
```

---

## 7. export-center.tsx 수정 설계

기존 코드를 **Tabs로 래핑**하되, 기존 Spec Package 로직은 그대로 유지:

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DeliverableTab } from '@/components/export/DeliverableTab';

export default function ExportCenterPage() {
  // ... 기존 state/hooks 전부 유지 ...

  return (
    <div className="space-y-6">
      {/* 헤더 — 기존 유지 */}
      <div className="flex items-center justify-between">
        {/* ... 기존 제목 + subtitle 수정: "Spec 패키지 · SI 산출물" */}
      </div>

      <Tabs defaultValue="spec-package">
        <TabsList>
          <TabsTrigger value="spec-package">Spec Package</TabsTrigger>
          <TabsTrigger value="si-deliverables">SI 산출물</TabsTrigger>
        </TabsList>

        <TabsContent value="spec-package">
          {/* 기존 KPI + ExportForm + PackageList + ApprovalGate 코드 그대로 */}
        </TabsContent>

        <TabsContent value="si-deliverables">
          <DeliverableTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

---

## 8. File Change Matrix

| # | 파일 | 변경 | 신규줄(추정) | 설명 |
|---|------|------|------------:|------|
| 1 | `functions/api/[[path]].ts` | 수정 | +1 | ROUTE_TABLE에 `deliverables` 추가 |
| 2 | `vite.config.ts` | 수정 | +1 | SERVICE_MAP에 `deliverables` 추가 |
| 3 | `src/api/deliverables.ts` | **신규** | ~30 | API 클라이언트 (fetchDeliverableMarkdown) |
| 4 | `src/components/export/DeliverableTab.tsx` | **신규** | ~120 | 메인 탭 컴포넌트 (카드 목록 + 미리보기) |
| 5 | `src/components/export/DeliverablePreview.tsx` | **신규** | ~40 | 마크다운 미리보기 패널 |
| 6 | `src/components/markdown-content.tsx` | 수정 | +80 | 테이블 + blockquote 파싱·렌더링 |
| 7 | `src/pages/export-center.tsx` | 수정 | +15 | Tabs 래핑 + DeliverableTab import |
| | **합계** | | **~287** | |

---

## 9. Error Handling

| 시나리오 | 처리 |
|---------|------|
| API 호출 실패 (네트워크) | `toast.error("산출물 로딩 실패")` + 미리보기 패널에 에러 메시지 |
| 백엔드 graceful degradation | 마크다운 내 "데이터 수집 실패" 텍스트가 그대로 렌더링됨 (정상 동작) |
| 빈 마크다운 반환 | "산출물 데이터가 없어요. 먼저 파이프라인을 실행해 주세요" 표시 |
| 다운로드 중 에러 | `toast.error("다운로드 실패")` |

---

## 10. Implementation Order

```
Step 1: 인프라 라우트 (5분)
  ├─ functions/api/[[path]].ts — ROUTE_TABLE에 deliverables 추가
  └─ vite.config.ts — SERVICE_MAP에 deliverables 추가

Step 2: API 클라이언트 (10분)
  └─ src/api/deliverables.ts — fetchDeliverableMarkdown

Step 3: MarkdownContent 확장 (30분)
  └─ markdown-content.tsx — 테이블 + blockquote 파싱·렌더링

Step 4: DeliverablePreview (10분)
  └─ src/components/export/DeliverablePreview.tsx

Step 5: DeliverableTab (30분)
  └─ src/components/export/DeliverableTab.tsx — 카드 목록 + 핸들러

Step 6: 페이지 통합 (10분)
  └─ export-center.tsx — Tabs 래핑 + import

Step 7: 검증 (10분)
  └─ typecheck + lint
```
