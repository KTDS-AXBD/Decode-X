---
id: DESIGN-213
title: "Sprint 213 — ERWin SQL DDL 파서 설계"
req: AIF-REQ-035
sprint: 213
status: IN_PROGRESS
created: 2026-04-20
---

# Sprint 213 Design — ERWin SQL DDL 파서

## §1 출력 타입

```typescript
interface ErdColumn {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
  unique: boolean;
  defaultValue?: string;
  check?: string;
  comment?: string;        // -- 한글 주석 추출
}

interface ErdIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

interface ErdEntity {
  name: string;
  columns: ErdColumn[];
  indexes: ErdIndex[];
  compositePk?: string[];
}

interface ErdRelation {
  name: string;            // FK 이름 (파생) or "fk_{from}_{col}"
  from: string;            // 자식 테이블 (FK 보유)
  fromColumn: string;
  to: string;              // 부모 테이블
  toColumn: string;
  type: 'MANY_TO_ONE';
}

interface ErdParseResult {
  entities: ErdEntity[];
  relations: ErdRelation[];
  warnings: string[];      // 파싱 경고 (unknown 토큰 등)
}
```

## §2 파서 알고리즘

### 2.1 전처리

```
1. 줄 단위 분리
2. 빈 줄 / 주석 전용 줄 제거
3. 인라인 주석(-- ...)을 {comment} 메타로 추출
4. 세미콜론 기준으로 statement 분리
```

### 2.2 Statement 분류

```
CREATE TABLE <name> ( ... )  → parseCreateTable()
CREATE [UNIQUE] INDEX <name> ON <table>(<cols>)  → parseCreateIndex()
ALTER TABLE <name> ADD CONSTRAINT ...  → parseAlterConstraint()  [미래 확장]
그 외  → warnings 추가, skip
```

### 2.3 parseCreateTable 상태머신

```
상태: EXPECT_COLUMN | EXPECT_COMMA | IN_PAREN

각 토큰:
- "<name> <TYPE> [NOT NULL] [PRIMARY KEY] [DEFAULT x] [UNIQUE] [CHECK(...)]"
  → ErdColumn 생성
- "FOREIGN KEY (<col>) REFERENCES <table>(<col>)"
  → ErdRelation 생성
- "PRIMARY KEY (<cols>)"
  → ErdEntity.compositePk 설정
- "UNIQUE (<cols>)"
  → 복합 UNIQUE 처리
```

### 2.4 컬럼 파싱 정규식 (핵심)

```
/^(\w+)\s+([\w()]+)\s*(.*)/
→ name, type, rest

rest 파싱:
  NOT NULL   → notNull=true
  PRIMARY KEY → primaryKey=true
  UNIQUE      → unique=true
  DEFAULT (x) → defaultValue
  CHECK(...)  → check (괄호 중첩 추적)
  -- 주석     → comment
```

## §3 Worker 파일 매핑

| 파일 | 담당 | 핵심 로직 |
|------|------|----------|
| `packages/utils/src/erd-parser.ts` | 파서 라이브러리 | parseErd(), 상태머신 |
| `packages/utils/src/erd-parser.test.ts` | 테스트 | 실제 DDL + 엣지케이스 |
| `scripts/erwin-extract/index.ts` | CLI | stdin/file → JSON stdout |
| `scripts/erwin-extract/package.json` | CLI 메타 | type:module, bin |

## §4 테스트 계약 (TDD Red Target)

```typescript
// 테이블 수
expect(result.entities.length).toBeGreaterThanOrEqual(5)

// 관계 수
expect(result.relations.length).toBeGreaterThanOrEqual(10)

// 특정 엔티티 존재
const users = result.entities.find(e => e.name === 'users')
expect(users).toBeDefined()
expect(users!.columns.find(c => c.primaryKey)).toBeDefined()

// FK 관계 검증
const fk = result.relations.find(r => r.from === 'vouchers' && r.to === 'users')
expect(fk).toBeDefined()

// 한글 주석 추출
const idCol = users!.columns.find(c => c.name === 'id')
expect(idCol!.comment).toBe('UUID')
```

## §5 CLI 인터페이스

```bash
# 파일 입력
npx ts-node scripts/erwin-extract/index.ts 반제품-스펙/pilot-lpon-cancel/working-version/migrations/0001_init.sql

# stdin
cat schema.sql | npx ts-node scripts/erwin-extract/index.ts

# 출력 (JSON)
{
  "entities": [...],
  "relations": [...],
  "summary": { "entityCount": 17, "relationCount": 22 }
}
```

## §6 엣지케이스

| 케이스 | 처리 방식 |
|--------|----------|
| `CHECK(role IN ('A','B'))` | 괄호 중첩 카운터로 전체 캡처 |
| 멀티라인 컬럼 정의 | 괄호 깊이 추적으로 statement 합치기 |
| `CREATE INDEX` | ErdEntity.indexes에 추가 |
| 알 수 없는 statement | warnings[] 추가, 계속 파싱 |
| 한글 인라인 주석 | `-- .*` 캡처, 앞뒤 trim |
