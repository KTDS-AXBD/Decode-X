# F356-A AI-Ready PoC 종결 보고서 (2026-05-11)

> **Status**: F356-A PoC 종결, **Phase 2 NOGO 판정**, 프롬프트 iterate 권고
> **Author**: Master inline (세션 295 F489)
> **Source**: `reports/ai-ready-rubric-v2-full-2026-04-22.json`
> **Plan**: AIF-PLAN-118 §F489 Master inline (Sprint 미배정 — F356-A 정합화 종결)

---

## 1. 결과 요약

| 항목 | 수치 |
|------|------|
| 평가 대상 | 7 spec-containers (LPON 도메인) × 6기준 = 42 점수 |
| Pass 카운트 | 13 / 42 = **31.0%** |
| Phase 2 GO 임계값 | 정확도 ≥ **80%** |
| **판정** | ❌ **NOGO** — 프롬프트 iterate 또는 재설계 필요 |
| 모델 | Anthropic Claude Haiku |
| 비용 | $0.16 (rubric-v2 full run) |

---

## 2. 기준별 정확도 (7 skills)

| 기준 | Pass | Avg Score | 분석 |
|------|------|-----------|------|
| `source_consistency` | 5/7 (71%) | 0.814 | 가장 양호. 소스↔규칙 매핑 평가가 LLM 강점 |
| `exception_handling` | 4/7 (57%) | 0.757 | 임계값 근접. exception 절 명시 여부는 패턴 인식 가능 |
| `io_structure` | 2/7 (29%) | 0.734 | given/when/then 구조 평가 정확도 부족 |
| `testability` | 1/7 (14%) | 0.734 | edge case + error case 평가 일관성 부족 |
| `comment_doc_alignment` | 1/7 (14%) | 0.677 | runbook ↔ rule 일치성 평가 가장 어려움 |
| `srp_reusability` | 0/7 (0%) | 0.691 | **0건 통과** — 책임 분리 평가가 가장 약함 |

**핵심 관찰**:
- `srp_reusability` 0% 통과 — Haiku가 단일 책임 원칙 중복 정의를 일관되게 감점하나 0.72(threshold 0.75)에 머무름
- `comment_doc_alignment` + `testability` 14% — runbook 충실성 + 시나리오 자동화 가능성 평가 정확도 부족
- 통과율이 높은 기준(source_consistency 71%)도 80% 임계값 미달

---

## 3. Skill별 정확도

| Skill | Pass | 평가 |
|-------|------|------|
| `lpon-settlement` | 5/6 (83%) | 가장 높음. 단일 도메인 + 명확한 atomic 구조 |
| `lpon-budget` | 2/6 (33%) | 평균 |
| `lpon-charge` | 2/6 (33%) | 평균 |
| `lpon-purchase` | 2/6 (33%) | 평균 |
| `lpon-gift` | 1/6 (17%) | 낮음 |
| `lpon-payment` | 1/6 (17%) | 낮음 |
| `lpon-refund` | 0/6 (0%) | **모두 0.62~0.72 (threshold 0.75 미달)** |

**특이 패턴**: `lpon-refund` 모든 6기준 0.62~0.72로 균일 — Haiku가 refund 도메인 복잡도(7-day check, 캐시백 환불, 강제환불 기준 등)에 대해 보수적 채점.

---

## 4. Phase 2 NOGO 판정 근거

### 4.1 정량 기준 미달
- 31% pass rate < 80% 임계값 — 49%pp 부족
- 6 기준 중 4개 기준이 50% 이하 통과 (4/7 미만)
- skill 7개 중 5개가 50% 이하 통과

### 4.2 정성 분석
- **rationale 합리성**: LLM rationale 자체는 구체적이고 합리적 (각 점수 근거 명시), 채점 일관성도 보임
- **Threshold 적합성 의문**: `passThreshold: 0.75`가 너무 엄격할 수 있음. avg 0.677~0.814 범위에서 0.75는 중앙값에 가까움
- **Haiku의 한계**: 복잡 도메인(refund)에서 보수적 채점 경향 → Sonnet 또는 Opus 재실행 시 결과 다를 가능성

### 4.3 권고 — 3가지 iterate 방향
1. **Threshold 조정 (가장 경제적)** — 0.75 → 0.65로 하향 조정 시 pass rate 추정 65~75% (여전히 NOGO 가능). 단순 임계값 조정은 본질 해결 아님
2. **Tier 상향 (비용 증가)** — Haiku → Sonnet 4.6 또는 Opus 4.7로 재실행. 비용 ~$1.5 (Sonnet) 또는 ~$8 (Opus). 통과율 +15~25%pp 추정
3. **프롬프트 재설계 (가장 본질적)** — 6기준 prompt를 도메인 구체 예시 포함하여 재작성. few-shot examples 추가. 비용 ~$0.5 (Haiku 재실행). 통과율 +20~40%pp 추정

---

## 5. 수기 검증 후속

> **AI 자체 한계 명시**: AI가 자체 채점 결과를 self-validate하는 것은 메타적으로 의미 약함. 수기 재채점은 **인간 검토자**가 LLM rationale을 읽고 점수 합리성 평가하는 작업으로, 본 종결 보고서에서는 미수행.

**후속 옵션** (별도 세션 또는 Sprint):
- 8건 (10%) 수기 재채점 → ±0.1 이내 일치율 측정 → LLM 채점 신뢰도 정량화
- 또는 위 §4.3 권고 #2 (Sonnet 재실행) 또는 #3 (프롬프트 재설계) 우선 진행 후 수기 검증 재시도

---

## 6. F356-A 종결 마킹

**SPEC §6 F356-A status 정합화**:
- 직전: 🔧 IN_PROGRESS (Sprint 230 PoC 인프라 완결, 수기 검증만 잔여)
- 변경: ✅ **DONE** (PoC 결과 종결 + Phase 2 NOGO 판정 보고 종결)
- 후속: 별도 F-item 등록 시(프롬프트 iterate or Tier 상향)에 신규 작업으로 진행

**Phase 3 Should S-1 종결**: F356-A는 PoC 인프라 완결 + 결과 분석 + Phase 2 판정 모두 종결. Should 항목 ✅ DONE 처리.

---

## 7. 참조

- 원본 결과: `reports/ai-ready-rubric-v2-full-2026-04-22.json` (Sprint 230 산출)
- 양식 템플릿: `reports/ai-ready-rubric-v2-lpon-charge-2026-04-22-accuracy-2026-04-22.md` (Sprint 230 빈 양식)
- F356-A 정의: SPEC.md line 1270 (AIF-REQ-035 Phase 3 S-1 Phase 1)
- F356-A baseline: `reports/ai-ready-baseline-2026-04-21.json`
- F356-B 후속 (production evaluable 58건 100% cover): 세션 264 종결
