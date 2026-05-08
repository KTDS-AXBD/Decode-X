---
code: AIF-POC-ai-ready-criteria-design
title: "AI-Ready 6기준 채점기 설계"
version: 1.0
status: active
category: poc
created: 2026-04-16
updated: 2026-04-16
author: Sinclair Seo
---

# AI-Ready 6기준 채점기 설계

> **관련**: AIF-REQ-034 Decode-X Deep Dive PoC (2026-04-17 보고용)
> **목적**: LPON 859개 skill 패키지를 규칙 기반(deterministic, LLM-free)으로 6기준 채점하여 "Foundry-X 입력 준비도"를 수치화.

---

## 0. 채점 원칙

- **규칙 기반(Rule-based) 우선** — LLM 호출 없음. 859건 일괄 처리 속도/비용 고려
- **결정적(Deterministic)** — 동일 입력 → 동일 점수 (재현성)
- **기준별 0.0 ~ 1.0** — 여러 sub-signal의 가중 합
- **Overall score = 6기준 평균** (0.0 ~ 1.0)
- **통과 기준**: overall ≥ 0.8 → "AI-Ready"

### 입력 필드 (SkillPackageSchema, packages/types/src/skill.ts)

```
$schema, skillId, metadata{domain, subdomain, version, createdAt, updatedAt, author, tags[]},
policies[{code, title, description, condition, criteria, outcome, source{documentId, pageRef, excerpt}, trust{level, score, ...}, tags[]}],
trust{level, score, reviewedBy, reviewedAt, validatedAt},
ontologyRef{graphId, termUris[], skosConceptScheme},
provenance{sourceDocumentIds[], organizationId, extractedAt, pipeline{stages[], models{}}},
adapters{mcp?, openapi?}
```

---

## 1. 기계 판독 가능 (Machine-readable)

"AI가 구조화된 포맷으로 바로 해석할 수 있는가"

| Signal | 가중치 | 검증 방법 |
|--------|:-----:|-----------|
| `$schema` URL 존재 & 비어있지 않음 | 0.3 | `pkg.$schema?.startsWith("https://")` |
| `SkillPackageSchema.safeParse()` 성공 | 0.5 | Zod 검증 |
| 전 policies[].code 가 regex `^POL-[A-Z]+-[A-Z-]+-\d{3}$` PASS | 0.2 | regex match rate (부분 점수 허용) |

**Score = Σ(signal × weight)**
**Pass**: ≥ 0.9

**예상 실패 사례**: `$schema` 누락(초기 패키지), code 형식 drift (세션별 컨벤션 차이)

---

## 2. 의미 일관성 (Semantic Consistency)

"같은 용어는 같은 뜻 — KG 용어사전에 연결되어 있는가"

| Signal | 가중치 | 검증 방법 |
|--------|:-----:|-----------|
| `ontologyRef.termUris.length ≥ 1` | 0.4 | 빈 배열이면 0 |
| `skosConceptScheme` 값 존재 | 0.3 | non-empty string |
| 전 policies[].code의 `{DOMAIN}` 파트와 `metadata.domain` 일치 | 0.3 | 단일 domain인지 검증 |

**Pass**: ≥ 0.7

**예상 실패 사례**: `termUris` 빈 배열 (Ontology stage 실패 패키지), domain 혼재 (LPON+PENSION 섞인 edge case)

---

## 3. 테스트 가능 (Testable)

"Spec에서 바로 테스트 케이스가 도출될 수 있는가"

| Signal | 가중치 | 검증 방법 |
|--------|:-----:|-----------|
| 전 policies[] 의 condition/criteria/outcome 모두 ≥ 20자 | 0.5 | 너무 짧으면 테스트 불가 |
| 전 policies[] 에 `source.excerpt` 존재 | 0.3 | 테스트 근거(문서 발췌) 유무 |
| policies 개수 ≥ 3 (최소 테스트 포인트 확보) | 0.2 | `policies.length >= 3 ? 1 : length/3` |

**Pass**: ≥ 0.7

**예상 실패 사례**: condition에 "해당" 같은 placeholder만 있는 경우, excerpt 누락

---

## 4. 추적 가능 (Traceable)

"Spec ↔ Code ↔ Test 3자 매핑이 되어 있는가"

| Signal | 가중치 | 검증 방법 |
|--------|:-----:|-----------|
| `provenance.sourceDocumentIds.length ≥ 1` | 0.3 | 원천 문서 추적 가능 |
| 전 policies[].source.documentId 가 provenance.sourceDocumentIds에 포함 | 0.5 | set inclusion 비율 |
| `pipeline.stages.length ≥ 3` | 0.2 | 최소 3단계(ingestion/extraction/policy) 통과 기록 |

**Pass**: ≥ 0.8

**예상 실패 사례**: 수동 입력/보정된 패키지의 stage 기록 부실, documentId mismatch

---

## 5. 완결성 (Completeness) — **Spec 3종 B/T/Q 커버리지** (재설계 v2)

"Business + Technical + Quality 3종이 모두 존재하는가" — 본 PoC의 핵심 지표

> **재설계 사유**: 기존 설계는 `adapters.mcp/openapi` 필드 유무로 Technical을 판정했으나, 해당 필드가 미사용 관행이라 **구조적 미달**이 나올 뿐 "Spec 텍스트 자체의 T 차원 풍부도"는 측정 불가. 정책 텍스트(condition/criteria/outcome/excerpt) 내부의 **경험치 기반 키워드 signal**로 전환하여 실제 Spec 내용물의 완결성을 측정한다.

### 5-B. Business 차원 (사업·업무 관점)

"무엇을 왜 — 업무 규칙·정책·목적"

| Signal | 가중치 | 검증 방법 |
|--------|:-----:|-----------|
| policies.length ≥ 1 AND 전 policies[]에 condition/criteria/outcome 채워짐 | 0.5 | if-then 규칙 완성도 |
| 전 policies[].tags/title/description 에 SKILL_CATEGORIES 키워드 1개 이상 매칭 | 0.25 | `services/svc-skill/src/bundler/categories.ts` 16 카테고리·94 키워드 재활용 (charging, payment, member, account, gift, notification, security, operation, settlement, integration, withdrawal, tax, product, education, reserve, annuity + other) |
| criteria에 수치(숫자/비율/금액/기간) 1건 이상 | 0.25 | regex: `\d+(%|원|만원|일|년|개월|건|회)` 매칭 비율 |

**Business score = Σ(signal × weight)**

### 5-T. Technical 차원 (시스템·구현 관점)

"어떻게 — 시스템 인터페이스·데이터 구조·구현 포인트"

| Signal | 가중치 | 검증 방법 |
|--------|:-----:|-----------|
| API/엔드포인트 언급 | 0.35 | condition/criteria/outcome 중 `/api`, `POST`, `GET`, `PUT`, `DELETE`, `endpoint`, `API` 패턴 (대소문자 무시) 최소 1건 |
| 데이터 필드/스키마 언급 | 0.35 | "테이블", "컬럼", "스키마", "ERD", "필드" 또는 camelCase/snake_case 식별자(≥2회, 공백 없음) 패턴 |
| adapters.mcp OR adapters.openapi 존재 (bonus) | 0.30 | 있으면 만점, 없어도 텍스트 signal로 보완 가능 |

**Technical score = Σ(signal × weight)** — 경험치 기반이라 2개 signal만으로도 0.7 달성 가능

### 5-Q. Quality 차원 (비기능 관점)

"얼마나 잘 — 성능·보안·SLA·테스트"

| Signal | 가중치 | 검증 방법 |
|--------|:-----:|-----------|
| 비기능 키워드 언급 | 0.4 | "이내", "이상", "이하", "TPS", "RPS", "암호화", "마스킹", "감사", "SLA", "성능", "보안", "테스트" 중 1건 이상 |
| trust.score > 0 AND 전 policies[].trust.score > 0 | 0.3 | 신뢰도 메트릭 자체가 품질 지표 |
| source.excerpt 존재 비율 ≥ 0.5 | 0.3 | 테스트·검증 근거 보유 |

**Quality score = Σ(signal × weight)**

### 종합

**Completeness score = (Business + Technical + Quality) / 3**

**Pass**: ≥ 0.67

**현 LPON skills의 예상 Gap (재설계 후)**:
- Business: 대부분 통과 예상 (condition/criteria/outcome Zod 제약으로 보장)
- Technical: **정책 텍스트에 API/필드 언급이 얼마나 있는가가 관건** — SI 문서 파싱 품질 척도
- Quality: 비기능 키워드는 LPON 정책서 성격상 일부만 — 중간 점수 예상

**PoC 핵심 발견 예상**: "B는 높고 T/Q는 낮다" 패턴이면 → Decode-X 추출 파이프라인이 **업무 규칙은 잘 뽑지만 기술/비기능 관점이 약함** → Deep Dive 정식 구현 시 extraction 프롬프트에 T/Q 관점 강화 필요

---

## 6. 사람 리뷰 가능 (Human-reviewable)

"도메인 전문가가 10분 내 검토 가능한 가독성"

| Signal | 가중치 | 검증 방법 |
|--------|:-----:|-----------|
| `trust.level` ∈ {reviewed, validated} | 0.4 | HITL 검토 완료 여부 |
| 전 policies[].title 존재 & ≥ 5자 | 0.2 | 제목 있음 |
| 평균 policy 길이(title+description+cond+crit+outcome) 200~2000자 | 0.2 | 너무 짧음(<200: 정보 부족) / 너무 김(>2000: 가독성 저하) 둘 다 감점 |
| `metadata.author` 존재 (≥ 1자) | 0.2 | 작성자 추적 가능 |

**Pass**: ≥ 0.6

**예상 실패 사례**: trust.level="unreviewed" 대량(아직 HITL 미처리), description 공백

---

## 출력 스키마

각 패키지별:
```json
{
  "skillId": "uuid",
  "domain": "온누리상품권",
  "criteria": {
    "machineReadable": { "score": 0.95, "pass": true, "signals": {...} },
    "semanticConsistency": { "score": 0.7, "pass": true, "signals": {...} },
    "testable": { "score": 0.82, "pass": true, "signals": {...} },
    "traceable": { "score": 0.9, "pass": true, "signals": {...} },
    "completeness": { "score": 0.67, "pass": true, "signals": {"business": 1.0, "technical": 0.0, "quality": 1.0} },
    "humanReviewable": { "score": 0.6, "pass": true, "signals": {...} }
  },
  "overall": 0.77,
  "passAiReady": false,
  "failedCriteria": ["overall <0.8"]
}
```

집계 리포트:
- 전체 859건 중 AI-Ready(≥0.8) 비율
- 기준별 pass 비율
- 기준별 score 분포 (median, p25, p75)
- Top 10 failed 패키지 (낮은 순)
- Top 10 passed 패키지 (높은 순)
- 미달 원인 분류 (어떤 기준이 주로 깎이는지)

---

## 실행 계획 (18h 윈도우)

| 단계 | 예상 소요 | 산출물 |
|------|:---------:|--------|
| 6기준 세부 설계 (본 문서) | 1h | ✅ `docs/poc/ai-ready-criteria-design.md` |
| 채점기 스크립트 작성 | 3h | `scripts/score-ai-ready.mjs` |
| R2 fetch + 일괄 실행 | 1h | 859건 채점 결과 JSON |
| 리포트 작성 | 2h | `docs/poc/ai-ready-score-lpon.md` + 차트 |
| B/T/Q 샘플 20건 매핑 | 2h | `docs/poc/spec-btq-sample.md` |
| 시연 자료 정리 (deck 아닌 md) | 2h | `docs/poc/report-2026-04-17.md` |
| **예비 시간** | 7h | 이슈 대응 / 품질 개선 |

---

## Open Questions

1. R2 bucket/prefix는? — `skill-packages/` 예상, 확인 필요
2. 859개 R2 fetch 병렬도 제한? — Cloudflare R2 rate limit 고려하여 배치 처리 (동시 10건)
3. 차트 라이브러리 — 기존 Recharts 사용 또는 ASCII 차트로 충분?

---

## 부록: 도메인 키워드 레지스트리

**출처**: `services/svc-skill/src/bundler/categories.ts` (기존 구현, 16 카테고리 × 5~10 키워드 = 총 94 키워드)

| 카테고리 | 레이블 | 키워드 |
|---------|--------|--------|
| charging | 충전 관리 | 충전, 자동충전, 납입, 금액 설정, 충전한도, 충전수단 |
| payment | 결제 처리 | 결제, PG, 카드, 가맹점, 수납, 승인, 취소 |
| member | 회원 관리 | 회원가입, 로그인, 인증, 본인확인, 탈퇴, 회원정보 |
| account | 계좌/지갑 | 계좌, 잔액, 이체, 송금, 지갑, 개설 |
| gift | 상품권 관리 | 발행, 교환, 환불, 유효기간, 상품권, 권종 |
| notification | 알림/메시지 | SMS, 푸시, 이메일, 알림, 메시지, 발송 |
| security | 보안/감사 | 접근제어, 암호화, 감사, 로그, 권한, 보안 |
| operation | 운영 관리 | 배치, 모니터링, 시스템, 설정, 관리자, 운영, 운용지시, 만기도래, 송수신 |
| settlement | 정산/수수료 | 정산, 수수료, 매출, 대사, 입금, 출금 |
| integration | API/연동 | 외부, API, 연동, 오류, 응답, 인터페이스 |
| withdrawal | 인출/지급 | 중도인출, 지급, 환급, 인출, 해지, 이전, 청구, 수급 |
| tax | 세금/공제 | 세금, 세액공제, 과세, 원천징수, 퇴직소득, 연말정산, 비과세, 과세소득, 분개 |
| product | 상품 관리 | 상품, 원리금보장, 수익증권, 펀드, 상품코드, 운용, 수익률, 상품그룹, 상품등록, 리스크정보 |
| education | 가입자 교육 | 교육, 가입자교육, 교육대상, 교육년도, 교육이메일, 교육통보 |
| reserve | 적립금 관리 | 적립금, 부담금, 납입내역, 미납, 입금, 예수금, 가상계좌 |
| annuity | 연금 수령 | 분할연금, 연금수령, 생존조사, 연금생존, 연금납입, IRP |

> **LPON** (온누리상품권) 도메인은 charging/payment/member/account/gift/settlement/integration 카테고리가 주력
> **Pension** (퇴직연금) 도메인은 withdrawal/tax/product/education/reserve/annuity 카테고리가 주력

---

## 부록: Technical 차원 키워드 레지스트리

**API/엔드포인트 패턴** (regex, 대소문자 무시):
```
/\b(api|endpoint|POST|GET|PUT|DELETE|PATCH)\b|\/api\/|REST\b/i
```

**데이터 필드/스키마 키워드**:
```
["테이블", "컬럼", "스키마", "ERD", "DDL", "필드", "인덱스", "제약조건", "PK", "FK"]
```

**식별자 패턴** (camelCase/snake_case, 명사형 코드 식별자):
```
/\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]+\b/   # camelCase
/\b[a-z][a-z0-9]+_[a-z0-9_]+\b/              # snake_case
```

---

## 부록: Quality 차원 키워드 레지스트리

**비기능 키워드**:
```
["이내", "이상", "이하", "초과", "미만",
 "TPS", "RPS", "QPS", "latency", "응답시간",
 "암호화", "마스킹", "감사", "로그", "SLA",
 "가용성", "무중단", "성능", "보안", "테스트", "검증"]
```
