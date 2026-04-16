---
title: "Sprint 206 Report — Technical 4축 스키마 + 프롬프트 강화"
sprint: 206
requirement: AIF-REQ-034
track: B
completed: 2026-04-16
match_rate: 100
---

# Sprint 206 완료 보고서

## 결과 요약

| 항목 | 결과 |
|------|------|
| Match Rate | 100% |
| typecheck | ✅ 14/14 |
| lint | ✅ 9/9 |
| test | ✅ 12/12 (회귀 없음) |

## 변경 파일

| 파일 | 변경 유형 |
|------|----------|
| `packages/types/src/extraction.ts` | **신규** — ExtractionResult Zod 스키마 (Business 4축 + Technical 4축) |
| `packages/types/src/index.ts` | 수정 — re-export 추가 |
| `services/svc-extraction/src/prompts/structure.ts` | 수정 — Technical 4축 프롬프트 섹션 추가 |
| `services/svc-extraction/src/routes/extract.ts` | 수정 — inline interface → shared type |
| `services/svc-extraction/src/queue/handler.ts` | 수정 — inline interface → shared type |
| `docs/01-plan/features/sprint-206.plan.md` | **신규** |
| `docs/02-design/features/sprint-206.design.md` | **신규** |

## Technical 4축 스키마

- **ApiItemSchema**: endpoint, method, requestSchema?, responseSchema?, description?
- **TableItemSchema**: name, columns[{name, type, nullable?, foreignKey?}], description?
- **DataFlowItemSchema**: source, target, type(call|import|event|query), description?
- **ErrorItemSchema**: code?, exception?, path?, handling?, severity?(critical|warning|info)

## 설계 결정

- Technical 4축은 **optional** — 기존 LLM 응답과 하위 호환
- 프롬프트는 **additive** — Business 추출 지시 변경 없음
- inline interface 2개를 shared Zod 스키마로 **통합** — 중복 제거
