# Phase 2-A Design: Source Code Parsing

> **Summary**: Java Spring 소스코드를 업로드하여 API 엔드포인트, DTO/VO, DDL, 트랜잭션 서비스를 구조화된 JSON으로 추출한다. LLM 미사용, Regex 기반 정적 분석.
>
> **Project**: RES AI Foundry
> **Version**: v1.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-06
> **Status**: Draft
> **Plan Reference**: `docs/01-plan/features/v074-pivot.plan.md` Phase 2-A
> **PRD Reference**: `docs/AI_Foundry_PRD_TDS_v0.7.4.docx` SS7.2, SS7.3, SS7.4

---

## 0. Design Decisions (Plan 보정)

| # | Plan 원안 | 설계 보정 | 근거 |
|---|----------|----------|------|
| DD-1 | JPA `@Entity` 파서 우선 | **VO/DTO 패턴 파서 우선** | LPON 실소스 확인: JPA 미사용, MyBatis + VO/DTO 패턴. JPA 파서는 2순위로 |
| DD-2 | `.java` 개별 파일 업로드 | **`.zip` 프로젝트 단위 업로드** | 실소스가 zip 압축 상태 (2,612 .java files in 30+ zips). 개별 업로드는 비현실적 |
| DD-3 | 4개 파서 모듈 | **5개 파서 모듈** (+ zip extractor) | zip 내 Java 파일 자동 추출 → 개별 파싱 → 청크 저장 |
| DD-4 | classification에 source_* 추가 | **source_controller, source_vo, source_service, source_ddl, source_config** | VO/DTO가 Entity 대신 핵심 데이터 모델 역할 |

---

## 1. LPON 실소스 분석 결과

### 1.1 소스 현황
```
총 Java 파일:     2,612개 (30+ zip archives)
Controllers:      175개 — @RestController + @RequestMapping
Entity/DTO/VO:    304개 — MyBatis 기반 VO/DTO (JPA @Entity 아님)
ServiceImpl:       37개 — @Service + @Transactional
```

### 1.2 실제 코드 패턴 (LPON api-master.zip 기준)

**Controller 패턴**:
```java
@Api(tags = "공통")                              // Swagger 태그
@RequiredArgsConstructor                         // Lombok
@RequestMapping(value = "/api/v2/common")        // 베이스 경로
@RestController
public class CommonController {
    @ApiOperation(value = "DB시간조회")           // Swagger 설명
    @RequestMapping(value = "/utils/getNow",
                    method = {RequestMethod.GET, RequestMethod.POST})
    public ResponseEntity<BaseGenericRes<String>> getNow() { ... }
}
```

**VO/DTO 패턴** (JPA @Entity 없음):
```java
@Data                                            // Lombok
public class BalanceVO {
    private String accountNo;
    private Long balance;
    private String currency;
}
```

**Service 패턴**:
```java
@Service
public class CommonServiceImpl implements CommonService {
    @Transactional
    public ResponseEntity<BaseGenericRes<String>> processPayment(...) { ... }
}
```

### 1.3 기술 스택 요약
- **Framework**: Spring Boot + Spring MVC
- **ORM**: MyBatis (JPA 아님)
- **Data Model**: VO/DTO 클래스 (annotation 없는 POJO + Lombok)
- **API 문서**: Swagger `@Api` / `@ApiOperation` annotations
- **빌드**: Gradle (추정)
- **프론트**: React (app-front-master.zip) + React Native

---

## 2. Type Definitions (`packages/types/src/spec.ts`)

### 2.1 Source Code Element Types (Zod schemas)

```typescript
import { z } from "zod";

// === Source Code Element Types ===

/** HTTP method enum for API endpoints */
export const HttpMethodSchema = z.enum([
  "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS",
]);

/** Parameter extracted from method signature or annotation */
export const CodeParamSchema = z.object({
  name: z.string(),
  type: z.string(),                    // "String", "Long", "BalanceVO"
  required: z.boolean().default(true),
  annotation: z.string().optional(),   // "@RequestBody", "@PathVariable", "@RequestParam"
  defaultValue: z.string().optional(),
});

/** API endpoint extracted from Controller */
export const CodeEndpointSchema = z.object({
  httpMethod: z.array(HttpMethodSchema),  // 복수 가능: [GET, POST]
  path: z.string(),                       // "/api/v2/common/utils/getNow"
  methodName: z.string(),                 // "getNow"
  parameters: z.array(CodeParamSchema),
  returnType: z.string(),                 // "ResponseEntity<BaseGenericRes<String>>"
  swaggerSummary: z.string().optional(),  // @ApiOperation value
  lineNumber: z.number().int().optional(),
});

/** Controller class metadata */
export const CodeControllerSchema = z.object({
  className: z.string(),                  // "CommonController"
  packageName: z.string(),                // "com.kt.onnuripay.externalapi.common.controller"
  basePath: z.string(),                   // "/api/v2/common"
  swaggerTag: z.string().optional(),      // @Api tags
  endpoints: z.array(CodeEndpointSchema),
  sourceFile: z.string(),                 // "CommonController.java"
});

/** VO/DTO field */
export const CodeFieldSchema = z.object({
  name: z.string(),                       // "accountNo"
  type: z.string(),                       // "String"
  nullable: z.boolean().default(true),
  annotation: z.string().optional(),      // "@Column", "@Id" (if JPA)
  comment: z.string().optional(),
});

/** VO/DTO/Entity class */
export const CodeDataModelSchema = z.object({
  className: z.string(),                  // "BalanceVO"
  packageName: z.string(),
  modelType: z.enum(["vo", "dto", "entity", "request", "response"]),
  fields: z.array(CodeFieldSchema),
  tableName: z.string().optional(),       // @Table name (JPA only)
  sourceFile: z.string(),
});

/** Service method with @Transactional */
export const CodeTransactionSchema = z.object({
  className: z.string(),
  methodName: z.string(),
  parameters: z.array(CodeParamSchema),
  returnType: z.string(),
  isTransactional: z.boolean(),
  readOnly: z.boolean().default(false),
  sourceFile: z.string(),
  lineNumber: z.number().int().optional(),
});

/** DDL column definition */
export const DdlColumnSchema = z.object({
  name: z.string(),
  type: z.string(),                       // "VARCHAR(100)", "BIGINT"
  nullable: z.boolean().default(true),
  isPrimaryKey: z.boolean().default(false),
  defaultValue: z.string().optional(),
  comment: z.string().optional(),
});

/** DDL table definition */
export const CodeDdlSchema = z.object({
  tableName: z.string(),
  columns: z.array(DdlColumnSchema),
  primaryKey: z.array(z.string()),
  foreignKeys: z.array(z.object({
    column: z.string(),
    refTable: z.string(),
    refColumn: z.string(),
  })),
  sourceFile: z.string(),
});

/** Aggregated source analysis result for a project/zip */
export const SourceAnalysisResultSchema = z.object({
  projectName: z.string(),                // zip filename without extension
  controllers: z.array(CodeControllerSchema),
  dataModels: z.array(CodeDataModelSchema),
  transactions: z.array(CodeTransactionSchema),
  ddlTables: z.array(CodeDdlSchema),
  stats: z.object({
    totalFiles: z.number().int(),
    javaFiles: z.number().int(),
    sqlFiles: z.number().int(),
    controllerCount: z.number().int(),
    endpointCount: z.number().int(),
    dataModelCount: z.number().int(),
    transactionCount: z.number().int(),
    ddlTableCount: z.number().int(),
  }),
});

// Type exports
export type HttpMethod = z.infer<typeof HttpMethodSchema>;
export type CodeParam = z.infer<typeof CodeParamSchema>;
export type CodeEndpoint = z.infer<typeof CodeEndpointSchema>;
export type CodeController = z.infer<typeof CodeControllerSchema>;
export type CodeField = z.infer<typeof CodeFieldSchema>;
export type CodeDataModel = z.infer<typeof CodeDataModelSchema>;
export type CodeTransaction = z.infer<typeof CodeTransactionSchema>;
export type DdlColumn = z.infer<typeof DdlColumnSchema>;
export type CodeDdl = z.infer<typeof CodeDdlSchema>;
export type SourceAnalysisResult = z.infer<typeof SourceAnalysisResultSchema>;
```

### 2.2 Event Types 확장 (`events.ts`)

```typescript
// DocumentUploadedEventSchema.payload.fileType 확장:
// 기존: "pdf" | "ppt" | "pptx" | "docx" | "xlsx" | "xls" | "png" | "jpg" | "jpeg" | "txt"
// 추가: "java" | "sql" | "zip"

// IngestionCompletedEventSchema.payload.classification 확장:
// 기존: "erd" | "screen_design" | "api_spec" | "requirements" | "process" | "general"
// 추가: "source_controller" | "source_vo" | "source_service" | "source_ddl" | "source_config" | "source_project"
```

### 2.3 DocumentCategory 확장 (`classifier.ts`)

```typescript
// 기존 6종 + 신규 6종
export type DocumentCategory =
  | "erd" | "screen_design" | "api_spec" | "requirements" | "process" | "general"
  // v0.7.4 source code categories
  | "source_controller" | "source_vo" | "source_service"
  | "source_ddl" | "source_config" | "source_project";
```

---

## 3. Parser Module Design

### 3.1 파일 구조

```
services/svc-ingestion/src/parsing/
├── java-controller.ts      # @RestController + @RequestMapping 추출
├── java-datamodel.ts       # VO/DTO/Entity 클래스 필드 추출
├── java-service.ts         # @Service + @Transactional 메서드 추출
├── ddl.ts                  # CREATE TABLE SQL 파싱
├── zip-extractor.ts        # zip 내 .java/.sql 파일 추출 + 라우팅
└── code-classifier.ts      # 소스 파일 → DocumentCategory 분류
```

### 3.2 `zip-extractor.ts` — 프로젝트 zip 처리

**역할**: zip 파일에서 .java/.sql 파일을 추출하고, 각 파일을 적절한 파서로 라우팅.

**설계**:
```typescript
import { inflate } from "fflate";  // 기존 docx.ts에서 사용 중인 라이브러리

interface ExtractedFile {
  path: string;       // "src/main/java/com/.../CommonController.java"
  filename: string;   // "CommonController.java"
  content: string;    // UTF-8 decoded
  type: "java" | "sql" | "xml" | "properties";
}

/**
 * Extract .java and .sql files from a zip archive.
 * Skips: .class, .jar, .svn, node_modules, target/, build/
 * Max: 5,000 files (LPON has 2,612)
 */
export function extractSourceFiles(zipBytes: ArrayBuffer): ExtractedFile[]

/**
 * Route extracted files to appropriate parsers.
 * Returns UnstructuredElement[] compatible with existing chunk pipeline.
 */
export function parseSourceProject(
  files: ExtractedFile[],
  projectName: string,
): UnstructuredElement[]
```

**처리 흐름**:
1. `fflate`로 zip 해제 (기존 docx.ts 패턴 재사용)
2. `.java`/`.sql` 파일만 필터 (binary/image/config 제외)
3. 각 `.java` 파일 → `classifyJavaFile()` → 적절한 파서로 라우팅
4. 각 `.sql` 파일 → `parseDdl()`
5. 파서 결과를 `UnstructuredElement[]` 형태로 변환 (기존 chunk 파이프라인 호환)

**제외 패턴**:
```
- target/, build/, .gradle/, .mvn/
- *.class, *.jar, *.war
- .svn/, .git/, node_modules/
- *Test.java, *Tests.java (테스트 코드 — Pilot Core 제외)
- 이미지/바이너리
```

### 3.3 `java-controller.ts` — Controller + Endpoint 추출

**Regex 패턴**:

```typescript
// 1. 클래스 레벨 annotation 추출
const CLASS_ANNOTATIONS = {
  restController: /@RestController\b/,
  controller: /@Controller\b/,
  requestMapping: /@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/,
  apiTag: /@Api\s*\(\s*tags\s*=\s*["']([^"']+)["']/,
};

// 2. 메서드 레벨 annotation 추출
const METHOD_ANNOTATIONS = {
  // @RequestMapping(value = "/path", method = {RequestMethod.GET, RequestMethod.POST})
  requestMapping: /@RequestMapping\s*\(([^)]+)\)/,
  getMapping: /@GetMapping\s*\(?\s*(?:value\s*=\s*)?["']?([^"')]*)/,
  postMapping: /@PostMapping\s*\(?\s*(?:value\s*=\s*)?["']?([^"')]*)/,
  putMapping: /@PutMapping\s*\(?\s*(?:value\s*=\s*)?["']?([^"')]*)/,
  deleteMapping: /@DeleteMapping\s*\(?\s*(?:value\s*=\s*)?["']?([^"')]*)/,
  apiOperation: /@ApiOperation\s*\(\s*value\s*=\s*["']([^"']+)["']/,
};

// 3. 메서드 시그니처 파싱
//    public ResponseEntity<BaseGenericRes<String>> getNow(@RequestParam String id) {
const METHOD_SIGNATURE = /(?:public|protected|private)\s+(\S+(?:<[^>]+>)*)\s+(\w+)\s*\(([^)]*)\)/;

// 4. 파라미터 annotation
//    @RequestBody BalanceVO body, @PathVariable("id") String id, @RequestParam(required=false) String name
const PARAM_ANNOTATION = /@(RequestBody|PathVariable|RequestParam|ModelAttribute)(?:\s*\([^)]*\))?\s+(\S+)\s+(\w+)/g;
```

**출력 element type**: `CodeController` — JSON 직렬화된 CodeControllerSchema

### 3.4 `java-datamodel.ts` — VO/DTO/Entity 필드 추출

**분류 규칙**:
```typescript
function classifyDataModel(filename: string, content: string): "vo" | "dto" | "entity" | "request" | "response" {
  if (filename.endsWith("VO.java")) return "vo";
  if (filename.endsWith("Dto.java") || filename.endsWith("DTO.java")) return "dto";
  if (content.includes("@Entity")) return "entity";
  if (filename.endsWith("Req.java") || filename.includes("Request")) return "request";
  if (filename.endsWith("Res.java") || filename.includes("Response")) return "response";
  return "vo"; // default
}
```

**Regex 패턴**:
```typescript
// Lombok @Data / @Getter / @Setter → 모든 필드가 접근 가능
const HAS_LOMBOK = /@(Data|Getter|Setter|Value)\b/;

// 필드 추출: private String accountNo;
const FIELD_PATTERN = /(?:private|protected|public)\s+(\S+(?:<[^>]+>)?)\s+(\w+)\s*[;=]/g;

// JPA 용 (LPON에는 없지만 범용성)
const JPA_TABLE = /@Table\s*\(\s*name\s*=\s*["'](\w+)["']/;
const JPA_COLUMN = /@Column\s*\(([^)]*)\)/;
const JPA_ID = /@Id\b/;
```

**출력 element type**: `CodeDataModel` — JSON 직렬화된 CodeDataModelSchema

### 3.5 `java-service.ts` — Service + Transaction 추출

```typescript
const SERVICE_CLASS = /@Service\b/;
const TRANSACTIONAL = /@Transactional(?:\s*\(([^)]*)\))?/;

// @Transactional(readOnly = true)
const READ_ONLY = /readOnly\s*=\s*true/;
```

**출력 element type**: `CodeTransaction`

### 3.6 `ddl.ts` — SQL DDL 파싱

```typescript
// CREATE TABLE table_name (
//   column_name TYPE [NOT NULL] [PRIMARY KEY] [DEFAULT value] [COMMENT 'text'],
//   ...
//   PRIMARY KEY (col1, col2),
//   FOREIGN KEY (col) REFERENCES ref_table(ref_col)
// );
const CREATE_TABLE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s*\(([\s\S]*?)\)\s*;/gi;
const COLUMN_DEF = /[`"]?(\w+)[`"]?\s+(\w+(?:\(\d+(?:,\d+)?\))?)\s*((?:NOT\s+NULL|NULL|PRIMARY\s+KEY|DEFAULT\s+\S+|COMMENT\s+'[^']*')*)/gi;
const FK_CONSTRAINT = /FOREIGN\s+KEY\s*\([`"]?(\w+)[`"]?\)\s*REFERENCES\s+[`"]?(\w+)[`"]?\s*\([`"]?(\w+)[`"]?\)/gi;
const PK_CONSTRAINT = /PRIMARY\s+KEY\s*\(([^)]+)\)/gi;
```

**출력 element type**: `CodeDDL`

### 3.7 `code-classifier.ts` — 소스 파일 분류

```typescript
export function classifyJavaFile(filename: string, content: string): DocumentCategory {
  // 1순위: annotation 기반
  if (/@RestController\b|@Controller\b/.test(content)) return "source_controller";
  if (/@Service\b/.test(content)) return "source_service";
  if (/@Entity\b/.test(content)) return "source_vo"; // JPA Entity → source_vo로 통합
  if (/@Configuration\b|@Component\b/.test(content)) return "source_config";

  // 2순위: 파일명 기반
  if (/Controller\.java$/.test(filename)) return "source_controller";
  if (/(?:VO|Dto|DTO|Entity|Req|Res|Request|Response)\.java$/.test(filename)) return "source_vo";
  if (/(?:Service|ServiceImpl)\.java$/.test(filename)) return "source_service";

  // 3순위: SQL
  if (filename.endsWith(".sql")) return "source_ddl";

  return "source_config"; // 기타 (Repository, Util, Config 등)
}
```

---

## 4. svc-ingestion Integration Changes

### 4.1 `routes/upload.ts` 변경

```diff
 const ALLOWED_TYPES = new Set([
   // ... existing types ...
+  "application/zip",                    // .zip project archive
+  "application/x-zip-compressed",       // .zip (alternative MIME)
+  "text/x-java-source",                // .java source
+  "text/x-java",                       // .java (alternative)
+  "application/sql",                   // .sql DDL
+  "text/sql",                          // .sql (alternative)
 ]);

 const MIME_TO_EXT: Record<string, string> = {
   // ... existing mappings ...
+  "application/zip": "zip",
+  "application/x-zip-compressed": "zip",
+  "text/x-java-source": "java",
+  "text/x-java": "java",
+  "application/sql": "sql",
+  "text/sql": "sql",
 };
```

### 4.2 `events.ts` 변경 (packages/types)

```diff
 payload: z.object({
   // ...
-  fileType: z.enum(["pdf", "ppt", "pptx", "docx", "xlsx", "xls", "png", "jpg", "jpeg", "txt"]),
+  fileType: z.enum(["pdf", "ppt", "pptx", "docx", "xlsx", "xls", "png", "jpg", "jpeg", "txt", "java", "sql", "zip"]),
 }),
```

### 4.3 `queue.ts` 변경 — 파싱 라우팅

```diff
 // 3. Parse: custom xlsx parser or Unstructured.io
 const isXlsx = fileType === "xlsx" || fileType === "xls";
+const isSourceCode = fileType === "java" || fileType === "sql" || fileType === "zip";
 let elements;
-if (isXlsx) {
+if (isSourceCode) {
+  elements = parseSourceCode(fileBytes, originalName, fileType);
+} else if (isXlsx) {
   // ... existing xlsx logic ...
 } else {
   elements = await parseDocument(fileBytes, originalName, mimeType, env);
 }
```

### 4.4 `validator.ts` 변경 — 소스 파일 검증

Java/SQL/ZIP 파일 검증 추가:
- ZIP: 기존 `0x50 0x4B 0x03 0x04` (PK 헤더) — xlsx/docx와 동일하므로 재사용
- Java/SQL: 텍스트 파일이므로 magic byte 검증 불필요 (txt와 동일 취급)

### 4.5 `classifier.ts` 변경

기존 `classifyDocument()` + `classifyXlsxElements()` 에 `classifySourceElements()` 추가:
```typescript
export function classifySourceElements(
  elements: UnstructuredElement[],
): DocumentClassification {
  // element.type으로 판별: "CodeController" | "CodeDataModel" | ...
  // 프로젝트 zip인 경우 "source_project" (복합)
}
```

---

## 5. Element Format (기존 파이프라인 호환)

기존 `UnstructuredElement` 인터페이스:
```typescript
interface UnstructuredElement {
  type: string;   // element_type column
  text: string;   // masked_text column (JSON string for code elements)
}
```

소스 코드 파서 출력은 동일 인터페이스를 따르되, `text`에 JSON 직렬화된 구조를 저장:

```typescript
// Controller element
{
  type: "CodeController",
  text: JSON.stringify({
    className: "CommonController",
    basePath: "/api/v2/common",
    swaggerTag: "공통",
    endpoints: [{
      httpMethod: ["GET", "POST"],
      path: "/utils/getNow",
      methodName: "getNow",
      parameters: [],
      returnType: "ResponseEntity<BaseGenericRes<String>>",
      swaggerSummary: "DB시간조회",
    }],
    sourceFile: "CommonController.java",
  })
}

// DataModel element
{
  type: "CodeDataModel",
  text: JSON.stringify({
    className: "BalanceVO",
    modelType: "vo",
    fields: [
      { name: "accountNo", type: "String" },
      { name: "balance", type: "Long" },
      { name: "currency", type: "String" },
    ],
    sourceFile: "BalanceVO.java",
  })
}
```

이 방식은:
- 기존 D1 `document_chunks` 테이블 스키마 변경 없음
- 기존 masking 파이프라인 호환 (JSON 텍스트도 PII 마스킹 가능)
- svc-extraction에서 `JSON.parse(chunk.masked_text)`로 구조화 데이터 접근

---

## 6. 처리 한도 & 성능

| 항목 | 한도 | 근거 |
|------|------|------|
| zip 내 최대 파일 수 | 5,000 | LPON 2,612개 + 여유 |
| 단일 .java 파일 최대 크기 | 500KB | 일반적 Java 파일 10~50KB |
| zip 최대 크기 | 200MB | MAX_FILE_SIZE_MB=50이지만 소스 zip은 조정 필요 |
| 추출 element 최대 수 | 1,000 (zip당) | MAX_ELEMENTS_XLSX=500의 2배 |
| 단일 element text 최대 크기 | 10KB | JSON 직렬화 후 기준 |
| Worker CPU 시간 | 30초 (기존) | Regex 파싱은 빠름 — 2,612 파일도 ~5초 예상 |

---

## 7. Test Strategy

### 7.1 단위 테스트 — 실제 LPON 코드 기반

```typescript
// java-controller.test.ts
describe("parseJavaController", () => {
  test("LPON CommonController — @RestController + @RequestMapping + @ApiOperation", () => {
    const source = `
      @Api(tags = "공통")
      @RequiredArgsConstructor
      @RequestMapping(value = "/api/v2/common")
      @RestController
      public class CommonController {
          @ApiOperation(value = "DB시간조회")
          @RequestMapping(value = "/utils/getNow", method = {RequestMethod.GET, RequestMethod.POST})
          public ResponseEntity<BaseGenericRes<String>> getNow() { ... }
      }
    `;
    const result = parseJavaController(source, "CommonController.java");
    expect(result.className).toBe("CommonController");
    expect(result.basePath).toBe("/api/v2/common");
    expect(result.swaggerTag).toBe("공통");
    expect(result.endpoints).toHaveLength(1);
    expect(result.endpoints[0].httpMethod).toEqual(["GET", "POST"]);
    expect(result.endpoints[0].path).toBe("/utils/getNow");
    expect(result.endpoints[0].swaggerSummary).toBe("DB시간조회");
  });
});
```

### 7.2 통합 테스트 — zip 업로드 E2E

```typescript
describe("Source code upload E2E", () => {
  test("zip upload → parse → chunks stored", () => {
    // 1. Upload test zip (miniature of api-master.zip)
    // 2. Verify ingestion.completed event emitted
    // 3. Verify chunks in D1 with CodeController/CodeDataModel types
    // 4. Verify classification = "source_project"
  });
});
```

### 7.3 테스트 데이터
- `services/svc-ingestion/src/parsing/__fixtures__/` 디렉토리에 LPON 샘플 코드 복사
- 실 파일 기반 테스트 (`describe.skipIf(!HAS_REAL_FILES)` 패턴 사용)

---

## 8. Implementation Order

```
Step 1: Type definitions (packages/types)
  ├── spec.ts — CodeController, CodeDataModel, CodeDdl 등 Zod schemas
  └── events.ts — fileType enum 확장 ("java", "sql", "zip")

Step 2: Core parsers (svc-ingestion/src/parsing/)
  ├── java-controller.ts — Regex 파서 + 단위 테스트
  ├── java-datamodel.ts — Regex 파서 + 단위 테스트
  ├── java-service.ts — Regex 파서 + 단위 테스트
  └── ddl.ts — SQL 파서 + 단위 테스트

Step 3: Integration (svc-ingestion)
  ├── zip-extractor.ts — zip 해제 + 파일 라우팅
  ├── code-classifier.ts — 소스 파일 분류
  ├── upload.ts — ALLOWED_TYPES 확장
  ├── queue.ts — 파싱 라우팅 분기
  └── validator.ts — zip/java/sql 검증

Step 4: Validation
  ├── typecheck + lint
  ├── 단위 테스트 실행
  └── LPON api-master.zip 실파일 테스트 (로컬)

Step 5: Deploy + E2E
  ├── svc-ingestion + svc-queue-router 배포
  └── curl 테스트: zip 업로드 → chunks 확인
```

---

## 9. Risk & Mitigation

| 리스크 | 대응 |
|--------|------|
| fflate가 대형 zip (200MB) 처리 시 메모리 초과 | streaming 해제 또는 zip 분할 업로드 |
| Regex가 복잡한 제네릭 (`Map<String, List<VO>>`) 파싱 실패 | 간단한 fallback: 전체 타입 문자열을 raw로 저장 |
| LPON VO에 Lombok 없는 파일 | `private` 필드 패턴은 Lombok 유무와 무관하게 동작 |
| curl -F로 zip MIME 타입 감지 실패 | `;type=application/zip` 명시 필수 (기존 교훈) |
| svc-queue-router 재배포 필요 (events.ts 변경) | fileType enum 변경 시 safeParse→재직렬화에 영향 |

---

## 10. Files Changed Summary

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `packages/types/src/spec.ts` | **신규** | Source code element Zod schemas |
| `packages/types/src/events.ts` | 수정 | fileType enum 확장 |
| `packages/types/src/index.ts` | 수정 | spec.ts export 추가 |
| `services/svc-ingestion/src/parsing/java-controller.ts` | **신규** | Controller+Endpoint Regex 파서 |
| `services/svc-ingestion/src/parsing/java-datamodel.ts` | **신규** | VO/DTO/Entity 필드 추출 |
| `services/svc-ingestion/src/parsing/java-service.ts` | **신규** | Service+Transaction 추출 |
| `services/svc-ingestion/src/parsing/ddl.ts` | **신규** | SQL DDL 파서 |
| `services/svc-ingestion/src/parsing/zip-extractor.ts` | **신규** | zip 해제 + 라우팅 |
| `services/svc-ingestion/src/parsing/code-classifier.ts` | **신규** | 소스 파일 분류 |
| `services/svc-ingestion/src/routes/upload.ts` | 수정 | ALLOWED_TYPES 확장 |
| `services/svc-ingestion/src/queue.ts` | 수정 | 소스 코드 파싱 라우팅 추가 |
| `services/svc-ingestion/src/parsing/validator.ts` | 수정 | zip/java/sql 검증 |
| `services/svc-ingestion/src/parsing/classifier.ts` | 수정 | source_* 카테고리 추가 |

**신규 7 파일 + 수정 6 파일 = 총 13 파일**
