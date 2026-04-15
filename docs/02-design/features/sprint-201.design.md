---
code: AIF-DESIGN-201
title: "Sprint 201 Design — README 갱신 + Handoff Format 검증"
version: "1.0"
status: Active
category: DESIGN
created: 2026-04-16
updated: 2026-04-16
author: Sinclair Seo
feature: sprint-201
refs: "[[AIF-PLAN-201]] [[AIF-REQ-026]]"
---

# Sprint 201 Design — README 갱신 + Handoff Format 검증

## 1. 변경 파일 목록

| 파일 | 변경 유형 | 내용 |
|------|----------|------|
| `services/svc-skill/src/prototype/orchestrator.ts` | Modify | `generateReadme()` 파일 구조 섹션 갱신 |
| `services/svc-skill/src/prototype/__tests__/handoff-format.test.ts` | Create | Foundry-X 핸드오프 포맷 검증 테스트 |

## 2. G1: generateReadme() 변경 상세

### 현재 (문제)
```
.foundry/origin.json          # 원천 추적 메타데이터
.foundry/manifest.json        # 패키지 매니페스트
specs/01-business-logic.md    # 비즈니스 로직 명세
schemas/                      # (후속 Sprint)
rules/business-rules.json    # 정책 트리플 (JSON)
ontology/terms.jsonld         # 도메인 용어 (SKOS)
```

### 변경 후 (정확한 9-file 구조)
```
.foundry/origin.json          # 원천 추적 메타데이터
.foundry/manifest.json        # 패키지 매니페스트 (Foundry-X 핸드오프)
specs/01-business-logic.md   # 비즈니스 로직 명세 (G1)
specs/02-data-model.md       # 데이터 모델 명세 (G2)
specs/03-functions.md        # 기능 정의서 (G3)
specs/04-architecture.md     # 아키텍처 정의서 (G4)
specs/05-api.md              # API 명세 (G5)
specs/06-screens.md          # 화면 정의서 (G9, includeScreenSpec=true 시)
rules/business-rules.json   # 정책 트리플 JSON (기계적 변환)
ontology/terms.jsonld        # 도메인 용어 SKOS (기계적 변환)
CLAUDE.md                    # AI 에이전트 가이드 (G8)
README.md                    # 반제품 패키지 설명서
```

### 사용법 섹션 갱신
- 기존: 4개 파일 언급 → 변경 후: specs/ 디렉토리 전체 참조 안내

## 3. G2: handoff-format.test.ts 설계

### 테스트 계약 (TDD Red Target)

```typescript
// __tests__/handoff-format.test.ts

describe("Foundry-X 핸드오프 포맷 검증", () => {
  // T1: createManifest() → PrototypeManifestSchema Zod 파싱 성공
  it("manifest가 PrototypeManifestSchema를 만족한다")
  
  // T2: origin.json → PrototypeOriginSchema Zod 파싱 성공
  it("origin.json이 PrototypeOriginSchema를 만족한다")
  
  // T3: includeScreenSpec=true 시 specs/06-screens.md 경로 포함
  it("includeScreenSpec=true 시 manifest.files에 06-screens.md 포함")
  
  // T4: includeScreenSpec=false 시 specs/06-screens.md 경로 미포함
  it("includeScreenSpec=false 시 manifest.files에 06-screens.md 미포함")
})
```

### 의존성
- `createManifest` from `../packager.js`
- `PrototypeManifestSchema`, `PrototypeOriginSchema` from `@ai-foundry/types`
- Mock GeneratedFile 객체 (path, type, generatedBy, sourceCount)

## 4. Worker 파일 매핑

| Worker | 파일 | 작업 내용 |
|--------|------|----------|
| W1 | `orchestrator.ts` | `generateReadme()` 내 파일 구조 + 사용법 문자열 수정 |
| W2 | `__tests__/handoff-format.test.ts` | 신규 생성 (4개 테스트) |

## 5. 테스트 계획

| 대상 | 방식 | 기준 |
|------|------|------|
| G1 | `pnpm test` — 기존 테스트 영향 없음 확인 | 310+ tests PASS |
| G2 | 신규 테스트 4개 PASS | Zod schema 파싱 성공, 파일 경로 포함/미포함 |
| 전체 | `pnpm typecheck && pnpm lint` | 에러 없음 |

## 6. 갭 분석 매트릭스

| 요구사항 | 구현 | Match |
|---------|------|:-----:|
| api-spec generator | api-spec.ts 기구현 | ✅ |
| screen-def generator | screen-spec.ts 기구현 | ✅ |
| 테스트 하네스 완성 | G2 handoff-format.test.ts | → 구현 필요 |
| Foundry-X 핸드오프 포맷 검증 | G1 README + G2 테스트 | → 구현 필요 |
| 기존 310 tests PASS | 현재 310 tests PASS | ✅ |
