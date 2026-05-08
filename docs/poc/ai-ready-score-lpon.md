---
code: AIF-POC-ai-ready-score-lpon
title: "AI-Ready 6기준 채점 리포트 — LPON 온누리상품권"
version: 1.0
status: active
category: poc
created: 2026-04-16
updated: 2026-04-16
author: Sinclair Seo
---

# AI-Ready 6기준 채점 리포트 — LPON 온누리상품권

**작성일**: 2026-04-16
**대상**: AIF-REQ-034 Decode-X Deep Dive PoC
**채점 대상**: LPON 온누리상품권 도메인 전체 **894건** skill package
**채점 방식**: 규칙 기반 deterministic 채점기 (LLM 없음)
**채점 위치**: `svc-skill-production` Worker, D1 + R2 binding 직접 사용
**총 소요 시간**: 83.5초 (894건 병렬 10개씩 배치)

---

## 1. 핵심 결과 (Executive Summary)

| 지표 | 값 |
|------|:----:|
| **전체 AI-Ready 통과율 (overall ≥ 0.8)** | **23.6%** (211 / 894) |
| 평균 overall 점수 | 0.726 |
| 중앙값 | 0.725 (p25: 0.658, p75: 0.794) |
| 최고 / 최저 | 0.861 / 0.466 |

### 한 줄 요약

> **"Business 관점은 강하지만(91.8%), Technical(4.3%)·Quality(27.0%) 관점이 약해 Foundry-X 반제품 자동 생산 기준에 대부분 미달한다"**

이것이 현재 Decode-X 산출물의 **AI-Ready 성숙도**이다. 문제는 구조적 품질이 아닌 **Spec 내용의 관점 다양성**이다.

---

## 2. 6기준별 통과율

| # | 기준 | 통과율 | 평균 점수 | 상태 |
|:-:|------|:-----:|:--------:|:----:|
| 1 | Machine-readable | **100.0%** | 1.000 | ✅ 완벽 |
| 2 | Semantic Consistency | 96.1% | 0.684 | ✅ 양호 |
| 3 | Testable | **38.5%** | 0.502 | ⚠️ 개선 필요 |
| 4 | Traceable | 96.1% | 0.961 | ✅ 양호 |
| 5 | **Completeness (B+T+Q)** | **3.1%** | 0.402 | ❌ 핵심 Gap |
| 6 | Human-reviewable | 100.0% | 0.808 | ✅ 완벽 |

**해석**:
- **구조적 품질은 모두 PASS** (1, 2, 4, 6) — Decode-X 파이프라인이 Spec 포맷·추적성·가독성은 이미 안정화됨
- **Testable 61.5% FAIL** — policy의 condition/criteria/outcome 중 20자 미만이거나 `source.excerpt` 없는 경우 다수
- **Completeness 96.9% FAIL** — B/T/Q 3종 중 한 차원 이상이 기준 미달

---

## 3. B/T/Q 3차원 분석 (Completeness 세부)

| 차원 | 평균 | Pass 비율 (≥ 0.67) | 의미 |
|------|:----:|:-----------------:|------|
| **Business** (업무 규칙) | 0.755 | **91.8%** | if-then 규칙 + 도메인 키워드 + 수치 — 대체로 충족 |
| **Technical** (시스템·구현) | **0.105** | **4.3%** | API/필드/스키마 언급 거의 없음 — **핵심 미달 차원** |
| **Quality** (비기능) | 0.347 | **27.0%** | 성능/보안/SLA 키워드 부족, 테스트 excerpt 존재율 낮음 |

### 해석

Decode-X의 extraction 파이프라인은 **"업무 규칙을 잘 뽑는다"**는 것이 데이터로 증명됐다. Business 차원은 91.8%가 충족한다.

반면 **Technical 차원은 4.3%만 통과**한다. 이는 추출 시점에 원본 문서·소스코드의 technical 관점이 보존되지 않거나, LLM 프롬프트가 업무 규칙에만 집중하여 technical 요소를 의도적으로 생략하기 때문으로 추정된다.

**Quality 차원(27.0%)**은 중간 — trust.score 메트릭은 있지만 비기능 키워드 언급이 policy 본문에 드물고, `source.excerpt` 확보 비율이 낮다.

---

## 4. 상위/하위 표본

### 상위 5건 (overall=0.861, tied)

| skillId | MR | SC | T | TR | C | HR | Overall |
|---------|:--:|:--:|:-:|:--:|:-:|:--:|:-------:|
| edd28564... | 1.00 | 0.70 | 0.867 | 1.00 | 0.60 | 1.00 | 0.861 |
| 57745d46... | 1.00 | 0.70 | 0.867 | 1.00 | 0.60 | 1.00 | 0.861 |
| c4f67106... | 1.00 | 0.70 | 0.867 | 1.00 | 0.60 | 1.00 | 0.861 |
| fc148de0... | 1.00 | 0.70 | 0.867 | 1.00 | 0.60 | 1.00 | 0.861 |
| 757580b2... | 1.00 | 0.70 | 0.867 | 1.00 | 0.60 | 1.00 | 0.861 |

**관찰**: 상위 표본도 Completeness가 0.60으로 **간신히 pass** 기준(0.67) 미만 — top performer조차 B/T/Q 완결성에서 감점.

### 하위 5건 (overall ≤ 0.497)

| skillId | MR | SC | T | TR | C | HR | Overall |
|---------|:--:|:--:|:-:|:--:|:-:|:--:|:-------:|
| 2254ade2... | 1.00 | 0.30 | 0.229 | 0.00 | 0.467 | 0.80 | 0.466 |
| d7e35396... | 1.00 | 0.30 | 0.229 | 0.00 | 0.467 | 0.80 | 0.466 |
| 87bc5b32... | 1.00 | 0.30 | 0.229 | 0.00 | 0.467 | 0.80 | 0.466 |
| de4f9d4d... | 1.00 | 0.30 | 0.383 | 0.00 | 0.500 | 0.80 | 0.497 |
| 800a9623... | 1.00 | 0.30 | 0.383 | 0.00 | 0.500 | 0.80 | 0.497 |

**관찰**: 하위 표본의 공통 특성 — Traceable=0 (provenance 결손), Testable 0.229~0.383 (policy 본문 짧음), Semantic 0.30 (ontology 용어 매핑 누락).

---

## 5. 실패 원인 랭킹 (Top Failures)

| 순위 | 기준 | 미달 건수 | 미달 비율 |
|:----:|------|:--------:|:--------:|
| 1 | Completeness | 866 | 96.9% |
| 2 | Overall (< 0.8) | 683 | 76.4% |
| 3 | Testable | 550 | 61.5% |
| 4 | Semantic Consistency | 35 | 3.9% |
| 5 | Traceable | 35 | 3.9% |

**해석**: 전체 문제의 핵심은 **Completeness(=B/T/Q 완결성)**. 이 1개 기준이 해결되면 overall도 대부분 통과할 것.

---

## 6. Foundry-X 입력 준비도 진단

Deep Dive v0.3 문서의 **AI-Ready 6기준은 Foundry-X의 반제품 자동 생산 필요충분조건**으로 정의된다.

| 판정 | 건수 | 비율 |
|------|:----:|:----:|
| ✅ **AI-Ready (overall ≥ 0.8)** — Foundry-X 직접 입력 가능 | 211 | **23.6%** |
| ⚠️ Conditional (0.6 ≤ overall < 0.8) — Spec 보강 후 투입 | ~500 (추정) | ~56% |
| ❌ Not Ready (overall < 0.6) — 재추출 필요 | ~183 (추정) | ~20% |

> 즉, **현재 894건 중 211건만 Foundry-X가 즉시 처리 가능**. 나머지 683건은 Deep Dive 정식 구현을 통해 Technical·Quality 관점 보강 필요.

---

## 7. 개선 방향 (Deep Dive 정식 구현 착수 근거)

### 7-1. 최우선: Technical 관점 추출 강화 (현 4.3% → 목표 60%+)

- svc-extraction 프롬프트에 **"관련 API/엔드포인트·데이터 필드·스키마를 policy에 명시하라"** 지시 추가
- 원본 소스코드·API 명세서 파싱 결과를 policy의 `source.excerpt`에 보존
- 기존 FactCheck 파이프라인(AST-Priority source-aggregator)의 출력을 policy.excerpt로 머지

### 7-2. 차순위: Quality 관점 + Testable 강화

- 비기능 요구사항(성능·보안·SLA) 전용 extraction 프롬프트 분기
- policy 본문이 20자 미만인 경우 재추출 트리거
- `source.excerpt` 필수화 (현재 optional)

### 7-3. 단기 완화: 임계값 조정 (선택)

- 현 Completeness threshold 0.67을 **실측 분포 반영 0.55로 인하** 검토 — B+T+Q 3차원 중 1.5개 이상 통과로 완화
- 단, 이는 KPI 목표(통과율 ≥ 90%)의 산정 기준 약화 — Deep Dive 정식 구현에서 Technical 강화 후 원래 임계값 복원이 바람직

---

## 8. 참조

- 채점기 설계: `docs/poc/ai-ready-criteria-design.md`
- 채점 로직: `services/svc-skill/src/scoring/ai-ready.ts`
- 채점 엔드포인트: `POST /admin/score-ai-ready` (`services/svc-skill/src/routes/score-ai-ready.ts`)
- 원본 JSON: `docs/poc/ai-ready-score-lpon-raw.json` (894건 × 6기준 × 세부 signal)
- PRD: `docs/req-interview/decode-x-deep-dive/prd-final.md` (R2 82/100)
- SPEC: `SPEC.md` AIF-REQ-034
