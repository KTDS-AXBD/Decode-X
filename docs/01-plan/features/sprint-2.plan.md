---
sprint: 2
title: Sprint 2 Plan — R2 LLM 예산 + T2 Shadow Mode + Empty Slot Fill 첫 3건
req: AIF-REQ-035
created: 2026-04-19
status: confirmed
timebox: ~60분
---

# Sprint 2 Plan — R2 LLM 예산 + T2 Shadow Mode + Empty Slot Fill 첫 3건

**상위 REQ**: `AIF-REQ-035` (Decode-X v1.3 본 개발, IN_PROGRESS)
**선행 Sprint**: Sprint 1 ✅ PASS (`T1 green 1건 + short-list 6건 + Fill 시드 1건`)
**작성일**: 2026-04-19
**시간 예산**: ~60분

---

## 1. Sprint 2 목표 (SMART)

| ID | 목표 | Measurable | Timebox |
|:--:|------|-----------|---------|
| S2-R2 | R2 LLM 예산 관측 체계 | `llm-budget-log.jsonl` R2 저장 경로 확정 + 첫 엔트리 기록 | ~15분 |
| S2-T2 | T2 Prototype Shadow Mode 1 라인 | `decisions.jsonl`에 `"mode":"shadow"` 필드 추가 1건 | ~10분 |
| S2-F | Empty Slot Fill 첫 3건 | ES-CHARGE-001/002/003 rules+tests+runbooks 3자 바인딩 완성 | ~35분 |

**시간 예산**: 약 **60분** 연속.

---

## 2. 스코프

### 2.1 In Scope
- LLM 호출 메타데이터(tier/tokens/latency/cost) R2 기록 스키마 확정 + 초기 엔트리
- decisions.jsonl에 shadow mode 마커 1행 추가
- ES-CHARGE-001 Fill 완성 (Sprint 1 시드 → 3자 바인딩)
- ES-CHARGE-002 Fill 완성 (에스컬레이션 기준)
- ES-CHARGE-003 Fill 완성 (분할 충전 가이드)

### 2.2 Out of Scope (Sprint 3+)
- T2 Shadow Mode 실제 인프라 (Worker/DO 연동)
- ES-CHARGE-004~008 Fill (Sprint 3 이관)
- Plumb 재실행 자동화
- Tier-A 나머지 서비스

---

## 3. 과업 분해

### 3.1 R2 LLM 예산 관측 (S2-R2)

| 작업 | 산출물 | 분 |
|------|--------|:--:|
| R2 스키마 설계 | `docs/poc/sprint-2-llm-budget-schema.md` | 5 |
| 첫 엔트리 기록 | `docs/poc/sprint-2-llm-budget-log.jsonl` + R2 키 경로 확정 | 10 |

### 3.2 T2 Shadow Mode (S2-T2)

| 작업 | 산출물 | 분 |
|------|--------|:--:|
| decisions.jsonl shadow 엔트리 추가 | `.foundry-x/decisions.jsonl` 업데이트 | 5 |
| Shadow Mode 1라인 설계 기록 | `docs/poc/sprint-2-shadow-mode.md` | 5 |

### 3.3 Empty Slot Fill (S2-F)

Sprint 1 시드(ES-CHARGE-001)부터 ES-CHARGE-003까지 3건.

| 작업 | 산출물 | 분 |
|------|--------|:--:|
| ES-CHARGE-001 Fill (멱등성) | `rules/ES-CHARGE-001.md` + `tests/ES-CHARGE-001.yaml` + `runbooks/ES-CHARGE-001.md` | 15 |
| ES-CHARGE-002 Fill (에스컬레이션) | `rules/ES-CHARGE-002.md` + `tests/ES-CHARGE-002.yaml` + `runbooks/ES-CHARGE-002.md` | 10 |
| ES-CHARGE-003 Fill (분할 충전) | `rules/ES-CHARGE-003.md` + `tests/ES-CHARGE-003.yaml` + `runbooks/ES-CHARGE-003.md` | 10 |

---

## 4. 성공 기준

| 항목 | 기준 |
|------|------|
| R2 LLM 예산 | jsonl 1건 이상 + 스키마 문서 |
| Shadow Mode | decisions.jsonl에 mode=shadow 엔트리 1건 |
| Fill 완성도 | 3건 × 3자(rules+tests+runbooks) = 9파일 생성 |

---

## 5. Sprint 3 이관

- ES-CHARGE-004~008 Fill (잔여 3건)
- T3 결정적 생성 PoC 2종
- 재평가 Gate 판정 (T1 green 누적 + T3 동작 확인)
