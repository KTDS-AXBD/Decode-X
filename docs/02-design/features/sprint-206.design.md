---
title: "Sprint 206 Design — Technical 4축 스키마 + 프롬프트"
sprint: 206
requirement: AIF-REQ-034
created: 2026-04-16
---

# Sprint 206 Design

## §1 개요

Stage 2 ExtractionResult에 Technical 4축(apis, tables, dataFlows, errors)을 추가한다. 기존 Business 4축은 그대로 유지하며, Technical 4축은 optional로 설계하여 하위 호환성을 보장한다.

## §2 Zod 스키마 설계

### ExtractionResultSchema (packages/types/src/extraction.ts)

```typescript
// Business 4축 (기존)
processes: z.array(ProcessItemSchema)
entities: z.array(EntityItemSchema)
relationships: z.array(RelationshipItemSchema)
rules: z.array(RuleItemSchema)

// Technical 4축 (신규, optional)
apis: z.array(ApiItemSchema).optional()
tables: z.array(TableItemSchema).optional()
dataFlows: z.array(DataFlowItemSchema).optional()
errors: z.array(ErrorItemSchema).optional()
```

### Technical 4축 상세 스키마

| 스키마 | 필드 |
|--------|------|
| ApiItemSchema | endpoint, method, requestSchema?, responseSchema?, description? |
| TableItemSchema | name, columns[{name, type, nullable?, foreignKey?}], description? |
| DataFlowItemSchema | source, target, type("call"\|"import"\|"event"\|"query"), description? |
| ErrorItemSchema | code?, exception?, path?, handling?, severity?("critical"\|"warning"\|"info") |

## §3 프롬프트 설계

### 추출 프롬프트 변경 (structure.ts)

기존 JSON 스키마 출력에 Technical 4축을 additive하게 추가:

```
5. **APIs(apis)**: API 엔드포인트, HTTP 메서드, 요청/응답 스키마
6. **테이블(tables)**: DB 테이블명, 컬럼(이름, 타입, FK)
7. **데이터 흐름(dataFlows)**: 함수 호출, 모듈 의존, 이벤트 발행
8. **에러(errors)**: 에러 코드, 예외 경로, 처리 방식
```

### 문서 분류별 Technical 가이드

- `api_spec` → apis, dataFlows 강조
- `erd` → tables 강조 (기존 entities + 신규 tables 상세)
- `requirements` → errors 강조
- `general/source_code` → 4축 모두

## §4 소비자 코드 변경

| 파일 | 변경 |
|------|------|
| extract.ts | inline interface 삭제 → import ExtractionResult from @ai-foundry/types |
| handler.ts | inline interface 삭제 → import ExtractionResult from @ai-foundry/types |
| fallback 빈 객체 | apis:[], tables:[], dataFlows:[], errors:[] 추가 |

## §5 검증 기준

- [ ] `pnpm typecheck` PASS
- [ ] `pnpm lint` PASS
- [ ] `pnpm test` PASS (기존 테스트 회귀 없음)
- [ ] Technical 4축이 optional이므로 기존 LLM 응답 파싱 호환
