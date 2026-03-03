# xlsx 파서 강화 — Design Document

## Overview
퇴직연금 코퍼스 92% (961/1,056건)가 xlsx 파일. Unstructured.io 외부 API 대신 SheetJS 기반 커스텀 xlsx 파서를 svc-ingestion에 추가하여 시트/행/열 구조를 보존한다.

## Requirements

### R-1: SheetJS 의존성
- `xlsx ^0.18.5` (Apache 2.0) 패키지 추가
- Wrangler esbuild 번들링 호환

### R-2: SI 문서 서브타입 감지
- 파일명 패턴 매칭으로 11종 SI 문서 서브타입 감지
- 화면설계, 프로그램설계, 테이블정의, 배치설계, 인터페이스설계, 단위테스트, 통합테스트, 요구사항, 업무규칙, 코드정의, 공통
- 매칭 실패 시 "unknown" 반환

### R-3: 시트별 청킹 (Markdown 테이블 포맷)
- 40행 단위 청크 분할
- Markdown 테이블 포맷 (`| col1 | col2 |`)
- 빈 시트/행 스킵
- 파이프 문자 이스케이프
- 셀 내 개행 → 공백 치환
- 2000자 초과 셀 트렁케이션

### R-4: 워크북 요약 청크
- 멀티시트 문서의 구조 개요
- 시트명, 행수, 컬럼 헤더 포함
- element_type: `XlWorkbook`

### R-5: element_type 체계
- 워크북 요약: `XlWorkbook`
- 시트 내용: `XlSheet:<siSubtype>` (예: `XlSheet:화면설계`)

### R-6: xlsx 전용 청크 상한
- `MAX_ELEMENTS_XLSX = 500` (기존 200 → xlsx만 500)

### R-7: 파서 디스패치 분기
- `fileType === "xlsx" || fileType === "xls"` → `parseXlsx()`
- 기타 → 기존 `parseDocument()` (Unstructured.io)

### R-8: 분류기 패스트패스
- `classifyXlsxElements()`: `XlSheet:<siSubtype>` → `DocumentCategory` 매핑
- 화면설계/프로그램설계 → screen_design
- 테이블정의/코드정의 → erd
- 요구사항/업무규칙 → requirements
- 인터페이스설계 → api_spec
- 배치설계/단위테스트/통합테스트 → process
- unknown → general (confidence 0.5)
- 매핑된 서브타입: confidence 0.9

### R-9: XLS (BIFF) 호환
- SheetJS가 `.xls` (OLE2/BIFF) 포맷도 지원하므로 동일 경로 처리

### R-10: 테스트 커버리지
- xlsx 파서 단위 테스트 30+
- 분류기 통합 테스트 6+
- 큐 디스패치 테스트 3+

## File Structure

| File | Type | Description |
|------|------|-------------|
| `services/svc-ingestion/package.json` | Modify | xlsx ^0.18.5 추가 |
| `services/svc-ingestion/src/parsing/xlsx.ts` | New | 핵심 파서 |
| `services/svc-ingestion/src/queue.ts` | Modify | 파서 디스패치 분기 |
| `services/svc-ingestion/src/parsing/classifier.ts` | Modify | classifyXlsxElements() |
| `services/svc-ingestion/src/__tests__/xlsx.test.ts` | New | 파서 테스트 |
| `services/svc-ingestion/src/__tests__/parsing.test.ts` | Modify | 분류기 테스트 추가 |
| `services/svc-ingestion/src/__tests__/queue.test.ts` | Modify | 디스패치 테스트 추가 |

## Key Interfaces

```typescript
// parsing/xlsx.ts
export type SiSubtype = "화면설계" | "프로그램설계" | "테이블정의" | ... | "unknown";
export function parseXlsx(fileBytes: ArrayBuffer, fileName: string): UnstructuredElement[];
export function detectSiSubtype(fileName: string): SiSubtype;
export function buildWorkbookSummary(workbook, siSubtype, fileName): UnstructuredElement | null;
export function sheetToMarkdownChunks(sheet, sheetName, siSubtype, maxRows?): UnstructuredElement[];

// parsing/classifier.ts
export function classifyXlsxElements(elements: UnstructuredElement[]): DocumentClassification;
```

## Metadata Schema

```typescript
// XlWorkbook metadata
{ siSubtype: string, sheetCount: number }

// XlSheet metadata
{ sheetName: string, siSubtype: string, chunkIndex: number, totalChunks: number, rowStart?: number, rowEnd?: number }
```
