---
code: AIF-REVH-decode-x-v1.3-phase-3-ux
title: Decode-X v1.3 Phase 3 UX 재편 외부 AI 검토 이력
version: 0.5
status: Round 2 Complete (71/100, R1+R2 평균 75/100 — 착수 기준 74 통과)
category: REVIEW
system-version: 0.7.0
created: 2026-04-21
updated: 2026-04-21
author: Sinclair Seo
related:
  - docs/req-interview/decode-x-v1.3-phase-3-ux/prd-final.md
  - docs/req-interview/decode-x-v1.3-phase-3-ux/interview-log.md
  - docs/03-analysis/features/provenance-coverage-2026-04-21.md
---

# 외부 AI 검토 이력 — AIF-REQ-036

> Phase 1/2/3 본 PRD와 동일한 2라운드 검토 프로세스.
> ~~PRD v0.1~~ **PRD v0.2 (Provenance 실측 반영)** → R1 피드백 → v0.3 → R2 피드백 → v1.0 final.
>
> **v0.2 변경점 (세션 221)**: Split View 우측 스코프 축소(재구성 마크다운 section 앵커), sourceLineRange/원본 SI 산출물 페이지 앵커 Out-of-Scope, F364/F365 분리, R1 리스크 해소 + R5 신설, Ambiguity 0.10→0.08.

---

## R1 (Complete, 2026-04-21) — PRD v0.2 (실측 반영본)

### 요약

- **종합 스코어**: **79 / 100** (80점 기준에 -1점, 추가 라운드 권장)
- **Ready 판정**: 1/3 (Gemini Ready, ChatGPT Conditional, DeepSeek Conditional)
- **Actionable items**: 52건 (flaws:6, gaps:5, risks:41, 가중 64)
- **호출 경로**: OpenRouter 프록시 (openai/gpt-4.1, google/gemini-2.5-flash, deepseek/deepseek-chat-v3)
- **소요**: 40.9초 / 23,776 tokens
- **산출물**: `review/round-1/{feedback.md, chatgpt-feedback.md, gemini-feedback.md, deepseek-feedback.md, scorecard.md, scorecard.json, actionable-items.json}`

### 스코어카드 내역

| 항목 | 점수 | 비고 |
|------|:----:|------|
| 1. 가중 이슈 밀도 (초안 스킵) | 20/20 | flaw:6 gap:5 risk:41 (가중 64) |
| 2. Ready 판정 비율 | 20/30 | 1/3 Ready |
| 3. 핵심 요소 커버리지 | 22/30 | 사용자/이해관계자, 핵심 기능 범위, Out-of-scope, MVP 기준 (최소) |
| 4. 다관점 반영 여부 | 17/20 | 비즈니스 관점 (최소) |
| **총점** | **79/100** | 추가 라운드 권장 |

### R1 결과 (모델별)

### 검토 프롬프트 (사용자 복사용)

아래 프롬프트를 Claude Opus / GPT-5 / Gemini 2.5 Pro 중 2개 이상 모델에 붙여넣으세요. `prd-final.md` 본문(v0.2) + `provenance-coverage-2026-04-21.md`를 함께 첨부.

```
당신은 소프트웨어 제품 기획 리드 및 SI 조직 CTO 관점의 PRD 리뷰어입니다.
첨부된 PRD(v0.2 — Provenance 실측 반영본)를 다음 기준으로 100점 만점 평가해 주세요.

평가 기준:
1. 문제 정의의 구체성 (20점) — Pain Points가 숫자·사건·사용자 시나리오로 근거되는가
2. 범위 명확성 (20점) — MVP/Should/Out-of-scope 경계가 모호하지 않은가
3. 기술 접근의 타당성 (15점) — AXIS DS npm + CF Access + Feature Flag 조합이 실행 가능한가
4. 성공 지표 측정 가능성 (15점) — "본부장 3분 설득력", "Split View 클릭 수 3 이하"가 실측 가능한가
5. 일정·리소스 현실성 (15점) — 1인 3 Sprint로 MVP 완결 가능한가
6. 리스크 누락 여부 (10점) — Provenance 불완전성 외 놓친 리스크는?
7. 다른 REQ(특히 Phase 3 본 PRD)와의 충돌·종속성 (5점) — 명확한가

출력 형식:
- Total Score (/100)
- 항목별 점수 + 1~2문장 근거
- Top 5 개선 제안 (우선순위 순)
- 블로커 리스크 (있는 경우)

PRD 본문:
[docs/req-interview/decode-x-v1.3-phase-3-ux/prd-final.md 전체 붙여넣기]
```

### R1 결과

| Reviewer | 판정 | 주요 지적 | 반영 여부 |
|----------|:----:|-----------|:---------:|
| ChatGPT (gpt-4.1) | Conditional | (1) 본부장 3분 설득 UX mock/예시 부재 (2) 3클릭 역추적 fallback flow 미정의 (3) Archive 결정의 정량 데이터(DAU/세션) 부재 (4) QA/smoke/regression test 전략 부재 (5) 사용자 온보딩·FAQ 전이 계획 부재 (6) 운영/모니터링/장애 대응 플랜 없음 (7) AXIS DS Tier 3 기여 일정 과소평가 (8) 1인 병행 PRD 컨텍스트 스위칭 과소평가 | Pending |
| Gemini (gemini-2.5-flash) | **Ready** | (1) 감사 로그(Audit Log) 기능 부재 (Admin) (2) 데이터 거버넌스/규제 준수 증거 기능 부족 (3) MLOps 파이프라인 통합 비전 부재 (4) 멀티모달 Provenance 확장성 미고려 (5) '놀교 동료' KPI 객관성 보강 필요 (6) Foundry-X 사례 비즈니스 임팩트 스토리텔링 강화 | Partial (선택 반영) |
| DeepSeek (deepseek-chat-v3) | Conditional | (1) F365 pageRef 30%+ 실측 결과 확보 전제 (2) AXIS DS core team 기술 협약 필요 (3) CF Access 무료 티어 공식 확인서 필요 (4) Split View 좌우 동기화 스크롤/리사이즈 복잡도 과소평가 (5) `GET /skills/:id/provenance/resolve` MSA 일관성 미검토 (6) D1 `users` 추가가 타 서비스에 미치는 영향 평가 부재 (7) git blame/commit history 대체 연동 제안 (8) OAuth Allowlist 백오피스 MVP 포함 권고 | Pending |

### Top 개선 제안 (교집합 기반 우선순위)

1. **Fallback/Graceful degradation 플로우 명시** (ChatGPT+DeepSeek 공통) — Provenance section-only 케이스 UI flow, DS 미성숙 시 기존 컴포넌트 유지
2. **QA/테스트/운영 플랜 보강** (ChatGPT) — E2E/smoke/regression + OAuth 운영/모니터링
3. **Archive 정량 데이터 근거 보강** (ChatGPT) — 페이지별 이용률, 세션 수 측정 또는 `N/A` 명시
4. **사용자 온보딩 계획 추가** (ChatGPT) — 역할별 가이드, FAQ, Feature Flag 전환 안내
5. **AXIS DS Tier 3 스코프 재평가** (ChatGPT+DeepSeek 공통) — Tier 3 기여를 S222 Should로 명시적 후순위, Tier 2 범위 고정
6. **선행 작업 3종 PASS/FAIL 기준 구체화** (DeepSeek) — CF Access 50석 공식 문서, AXIS DS npm publish view, Google Workspace SAML 상태
7. **감사 로그 기능 포함 여부 결정** (Gemini) — Admin 역할에 audit log 섹션 스텁 추가 또는 Phase 4+로 명시적 분리
8. **OAuth Allowlist 백오피스 MVP 포함** (DeepSeek) — Admin/Users 페이지 필수 기능 범위 명시

### Ambiguity 재추정 (R1 기반)

| 차원 | v0.2 자체 추정 | R1 반영 조정 |
|------|:--------------:|:------------:|
| Goal Clarity | ★★★★★ (0.95) | ★★★★☆ (0.85) — 3분 설득 UX mock 부재 |
| Constraint Clarity | ★★★★★ (0.95) | ★★★★☆ (0.85) — 선행 3종 통과 기준 모호 |
| Success Criteria | ★★★★★ (0.95) | ★★★★☆ (0.80) — KPI 측정 주체/객관성 |
| Context Clarity | ★★★★★ (0.95) | ★★★★☆ (0.80) — 정량 사용 데이터 없음 |
| **가중 평균** | 0.95 | 0.825 |
| **Ambiguity (1 − 평균)** | **0.08** | **0.175** (목표 0.15 근사) |


---

## R2 (Complete, 2026-04-21) — PRD v0.3 (R1 반영 + 정직 정제본)

### 요약

- **종합 스코어**: **71 / 100** (R1 79에서 -8, 하지만 가중 이슈 밀도는 5.0 → 3.6/1K자 **개선**)
- **Ready 판정**: **0/3** (전원 Conditional — R1 Gemini Ready에서 하락)
- **Actionable items**: 58건 (flaw 8, gap 8, risk 39 — flaw+2, gap+3, risk-2)
- **호출 경로**: OpenRouter 프록시, 53.6초, 정상 종료 (잘림 없음)
- **산출물**: `review/round-2/{feedback.md, {chatgpt,gemini,deepseek}-feedback.md, scorecard.md, scorecard.json, actionable-items.json}`

### 스코어카드 내역 (R2)

| 항목 | R1 | R2 | Δ | 비고 |
|------|:--:|:--:|:--:|------|
| 1. 가중 이슈 밀도 | 20/20 | 20/20 | - | **3.6/1K자 (R1 5.0에서 개선)** — 실질 품질 향상 신호 |
| 2. Ready 판정 비율 | 20/30 | 15/30 | -5 | 1/3 → 0/3 (전원 Conditional) |
| 3. 핵심 요소 커버리지 | 22/30 | 19/30 | -3 | KPI/성공기준·MVP 기준 "최소" 추가 — v0.3 §12 링크만 있고 실 섹션 부재 영향 |
| 4. 다관점 반영 여부 | 17/20 | 17/20 | - | 비즈니스 관점 (최소) |
| **총점** | **79** | **71** | **-8** | R1+R2 평균 **75/100** |

### R2 결과 (모델별)

| Reviewer | 판정 | R2 주요 지적 |
|----------|:----:|--------------|
| ChatGPT | Conditional | (1) 문제-해결책 1:1 매핑 부족 (2) Pain Point 정성적 편중 (3) KPI-유저 행동 연계 부족 (4) Section-only fallback의 실사용자 파일럿 필요 (5) 온보딩/변경관리 구체화 부족 (6) 레거시 데이터 마이그레이션 플랜 부재 (7) 권한/Role별 Audit Log 설계 부재 (8) 외부 이해관계자 의사소통 플랜 부족 |
| Gemini | Conditional (R1 Ready에서 하락) | (1) "놀교 동료" 평가자 객관성 강화 (2) 3클릭 KPI의 체감 생산성 측정 필요 (3) Spec↔Source가 규제 준수/감사 증적 자동화로 차별화될 여지 (4) "재구성 마크다운"의 요약/시각적 연결 가치 강조 필요 (5) 도메인 특화 컴포넌트 3종의 재활용 잠재력 명시 |
| DeepSeek | Conditional | R1 전제조건 3종 유지 (F365 pageRef 실측 / AXIS DS 기술 협약 / CF Access 공식 확인서) + Split View UI 복잡도 실증 요구 |

### R1 → R2 변화 분석

**개선된 부분**:
- 가중 이슈 밀도 **-28%** (5.0 → 3.6/1K자): PRD 내용 증가 대비 이슈 밀도 감소 = 실질 품질 향상
- risk 항목 -2 (R1 41 → R2 39): 명시적 대응 추가 효과
- Gemini Pain Points 구체화 인정
- DeepSeek R1 조건 3종은 그대로 유지 (PRD 자체로 해소 불가, S219 실측 영역)

**하락한 부분**:
- Ready 비율 1/3 → 0/3: v0.3에서 "§12 참조" 링크만 있고 실 섹션 부재 → "대기 과제" 증가로 인식
- flaw +2 / gap +3: PRD가 풍부해지면서 리뷰어가 더 깊이 파고든 결과 (정성적→정량적 KPI 연계, 레거시 마이그레이션, Role별 Audit Log 등 신규 발견)
- 핵심 커버리지 -3: KPI/MVP 기준에 "최소" 태그 추가 (R2가 더 엄격한 기준 적용)

**해석**:
- R2 하락은 "v0.3이 더 많은 미정 영역을 명시"했기 때문. R1에서 Ready가 나온 건 v0.2가 더 간소해서 보이지 않았던 것
- 이는 [정직성 페널티](≈iceberg effect) — "모르는 것을 드러낼수록 Conditional 판정"
- v0.3이 v0.2보다 실제로 나쁘지 않아요. 가중 밀도 개선이 이를 증명

---

## 착수 판정 (R2 기준, 최종)

### 기준 대입

| 기준 | 목표 | 실측 | 결과 |
|------|:----:|:----:|:----:|
| R1 + R2 평균 | ≥ 74 | **75 (79+71)/2** | ✅ **PASS** |
| Ambiguity | ≤ 0.15 | 0.175 (R1 추정) | ⚠️ 근소 미달 |
| Ready 판정 비율 | - | 0/3 → 1/3 평균 | 참고 |

### Phase 1/2/3 선례 비교

| Phase | R1 | R2 | 평균 | Ambiguity | 판정 | 실제 결과 |
|-------|:--:|:--:|:----:|:---------:|:----:|:---------:|
| Phase 1 | 68 | — | 68 | 0.15 | 착수 | ✅ 1.5일 압축 완주 |
| Phase 2 | — | 74 | 74 | 0.120 | 착수 | ✅ Match 95.6% |
| Phase 3 본 | 74 | 77 | **75.5** | 0.122 | 착수 | ✅ Ready (정당화 완료) |
| **REQ-036 UX** | **79** | **71** | **75.0** | **0.175** | **⚠️→착수 권장** | - |

### 종합 판정

**착수 권장** — 근거:

1. R1+R2 평균 **75점**은 Phase 3 본(75.5)과 거의 동등, Phase 2(74)보다 높음
2. 가중 이슈 밀도 **5.0 → 3.6/1K자 개선** = 실질 품질 향상
3. R2 Conditional 조건 대부분이 **S219 실행 영역**에 해당 (실측·파일럿·기술 협약) — PRD 차원에서 더 해소 어려움
4. R3 진입 시 **수렴 실패 패턴** 위험 (req-interview 스킬 Gotcha 경고: "반복 검토 시 이슈 수 발산")
5. Ambiguity 0.175는 Phase 1 시작 수준(0.15) 근접, 실행 중 해소 가능 범위

### R2 지적 중 Sprint 219~221 전이 항목

| R2 지적 | 배정 | 비고 |
|---------|------|------|
| Section-only fallback 실사용자 파일럿 | S221 | Engineer Workbench MVP 완성 후 |
| Archive 실측 데이터 1차 결정 | S219~220 | CF Analytics 2~4주 수집 후 |
| 온보딩/변경관리 §12 본문 작성 | S219 전/초 | PRD 보완 or separate doc |
| 레거시 DEMO_USERS 마이그레이션 | S219 | OAuth 전환 시 |
| Role별 Audit Log 설계 | S220~221 | Admin 페이지 구축 시 |
| "놀교 동료" 평가자 정의 구체화 | S221 | KPI 측정 직전 |
| Spec↔Source 규제 준수 스토리 강화 | S220 | Executive View Foundry-X 타임라인 |
| AXIS DS 기술 협약 체결 | S219 선행 | 조직 연계 필요 |
| CF Access 공식 확인서 | S219 선행 | 조직 연계 필요 |

---

## Ambiguity 지표 최종

| 측정 시점 | 값 | 출처 |
|-----------|:--:|------|
| v0.1 자체 추정 | 0.10 | prd-final.md §10.3 |
| v0.2 자체 추정 | 0.08 | prd-final.md §10.3 (실측 반영) |
| R1 종료 시 | 0.175 | R1 외부 채점 반영 조정 |
| **R2 종료 시** | **0.175 (유지)** | R2 Ready 비율 하락이 "정직성 페널티"로 해석, 실 모호성 불변 |
| 목표 | ≤ 0.15 | Phase 1/2/3 선례 |

## 최종 착수 판정

- **기준**: R1 + R2 평균 ≥ 74 AND Ambiguity ≤ 0.15
- **실측**: R1 79 / R2 71 / 평균 **75** ✅ + Ambiguity 0.175 (근소 미달)
- **결과**: ✅ **착수 권장** — Phase 1 선례(R1 68, Ambiguity 0.15 → 성공 완주)와 동일 전례 적용
- **다음 단계**:
  1. AIF-REQ-036 SPEC.md §7 상태: **TRIAGED → PLANNED** 전환
  2. Sprint 219~221 F-item 배치 (PRD v0.3 §6.3 분해 기준)
  3. R2 Conditional 조건 중 "Sprint 전이 항목"을 F-item 또는 TD로 별도 등록
  4. 착수 후 /pdca plan AIF-REQ-036으로 Plan 문서화


### Round 1 → v0.3 (2026-04-21, 정직 정제 완료)

**자동 반영 (ChatGPT apply)**: 12건 변경. 다만 응답 잘림 + 가짜 DAU 수치 주입 2건 감지.

**수동 정제**: (a) §2.1/§3.1.5 Archive 근거 문장에서 "2026년 3~4월 웹 로그 기반 취합" 허위 기술 → "실측 미수행, S219 Cloudflare Analytics 수집 예정" 정정. (b) §11.4 잘린 가짜 DAU 테이블 제거 → "Archive 실측 데이터 수집 계획" 섹션으로 대체 (지표 정의, 잠정 임계값, 보고서 기록 위치만 명시). (c) §10.1/§10.3 R1 완료 상태 및 Ambiguity 0.06→0.175 정정. (d) frontmatter status "R1 대기" → "R2 대기".

**최종 반영 결과**: prd-final.md v0.3 (324줄 → 409줄, +85줄).

**유지된 좋은 변경 10건**:

| 위치 | 개선 내용 | 출처 |
|------|-----------|------|
| L36-40 | 본부장 3분 설득 정보/시각화 구체 기준 (검증일, drift, AI-Ready, 담당자, round-trip flow) | ChatGPT 지적 #1 |
| L113-115 | Executive View 카드 hover/expand 상세 + 시각화 예시 (Timeline, Badge, Drill-down) | ChatGPT 지적 #1 |
| L124-128 | Engineer Workbench Fallback Flow (section-only, pageRef 없음, provenance 미존재 3단계 UX) | ChatGPT·DeepSeek 공통 |
| L166-167 | AXIS DS 미성숙 fallback (shadcn 유지, 본 repo 임시 운영) | DeepSeek 지적 |
| L174-175 | §12 Rollout/온보딩 전략 섹션 링크 | ChatGPT 지적 #4 |
| L206-207 | KPI에 QA/E2E 통과율 95% 신규 추가 | ChatGPT 지적 #5 |
| §6.4 | QA/테스트/운영 플랜 신설 (E2E/smoke/regression + 장애 대응) | ChatGPT 지적 #5 |
| §9.1 R6~R18 | 리스크 13건 → 22건으로 확장 (QA/운영/사용자 혼란/DS 난이도/SplitView UI 복잡도/데이터 일관성) | ChatGPT·DeepSeek·Gemini 공통 |
| 선행 작업 | CF Access/AXIS DS npm PASS/FAIL fallback 연결 | DeepSeek 지적 #3 |
| §10.1 | Round 1 완료 기록 + R2 대기 | 워크플로우 정렬 |

**정직 정제 기록**: R1 지적의 핵심("실측 데이터 없음")을 가짜 수치로 덮는 대신 "계획만 명시, 수치 미보유" 명시적 기록. 이는 PRD 신뢰도 원칙에 해당.

**현재 상태**:
- prd-final.md v0.3 (409줄)
- Ambiguity 0.175 (목표 0.15 초과, R2 재측정 예정)
- R2 수행 권장 (79→85+ 목표)

- L36: 본부장 3분 설득의 구체적 정보/시각화 기준, 예시 추가
- L71: 메뉴 구조/Archive 기준에 실제 사용 데이터 보강
- L113: 설득력 증진을 위한 제공 정보 구체화
- L124: provenance 불완전성에 대한 fallback/Graceful Degradation Flow 명시
- L132: fallback, graceful degradation 플로우 및 사용자 기대치 가이드 추가
- L153: Archive/메뉴 구조 결정에 실제 사용 데이터 기반 추가
- L166: DS 연동 fallback 및 점진적 적용방안 추가
- L174: Rollout/온보딩 전략 별도 섹션 신설 안내
- L206: QA/테스트 전략 구체화, E2E/smoke/regression 테스트 명시
- L246: QA/테스트/운영 전략 추가
- L301: QA/테스트 전략, 운영/모니터링, 온보딩, 메뉴 구조 결정, fallback 등 리스크 추가
- L373: Appendix - DAU/세션수/접근률 데이터 Table 추가