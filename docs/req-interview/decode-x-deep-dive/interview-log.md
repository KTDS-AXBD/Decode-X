---
code: AIF-REQI-interview-log
title: "Decode-X Deep Dive — 인터뷰 원문 기록"
version: 1.0
status: active
category: req-interview
created: 2026-04-16
updated: 2026-04-16
author: Sinclair Seo
---

# Decode-X Deep Dive — 인터뷰 원문 기록

- **일자**: 2026-04-16
- **진행**: /ax:req-interview (AskUserQuestion 기반 표준 5파트)
- **참조 자료**: `docs/AI_Foundry_OS_DeepDive_v0.3.html` (2026-04-15 대표 보고용)

---

## 진입

- **프로젝트명**: Decode-X Deep Dive
- **인터뷰 강도**: 표준 5파트

## Part 1: 왜 (목적/문제)

**Q**: 핵심 문제/기회는?
**A (다중 선택)**:
1. Spec 완결성 부족 — 현 Decode-X는 Policy/Ontology/Skill/API/Table 추출까지만. Business+Technical+Quality 3종 Spec 완결성 미확보 → Foundry-X 반제품 자동 생산 불가
2. 암묵지 수집 미지원 — 코드+문서만 처리, 담당자 인터뷰 등 Tacit Knowledge 파이프라인 부재. HITL Interview Agent 신규 필요
3. AI-Ready Spec 6기준 미적용 — 기계판독/의미일관/테스트가능/추적가능/완결성/인간검토 6기준 자동 검증 미구현
4. KG/Ontology 약체 — Spec·Code·Test 삼자 연결이 Neo4j에 일부만 저장. XAI/감사/Gap 측정에 필요한 관계 Registry 부족

**Q (시급성)**: 어느 정도인가요?
**A**: 경영진 보고 일정 기준

## Part 2: 누구를 위해 (사용자)

**Q**: 주 사용자·이해관계자는?
**A**:
- **수행팀 PM/TA** (주 사용자) — AX사업1팀·AX사업2팀, Spec을 받아 반제품 생산
- **AX컨설팅팀** — Harness 체크리스트/PRD·Prototype 템플릿 표준 정의자
- **도메인 전문가** (HITL 리뷰어) — 퇴직연금/공공/통신 SME, 암묵지 인터뷰 응답·Policy 승인·용어사전 확정
- *(경영진은 주 사용자에서 제외)*

**참고**: 오타 주의 — "퇴직연금" 표기 통일 (퀴직연금 등 오기 금지)

## Part 3: 무엇을 (범위)

**Q**: Must Have?
**A**:
1. 3종 Spec Schema + AI-Ready 6기준 자동 검증
2. Tacit Interview Agent (HITL 암묵지 수집)
3. Handoff 패키지 검증 (수행팀 수령 포맷 표준화)

**Q (Out-of-scope)**:
**A**:
- KG Relationship Registry (AIF-REQ-023 Pipeline Observability와 병합 예정)
- Ontology MCP (Palantir 참조, '27 검토)
- Foundry-X Orchestrator 구현 (Foundry-X 레포 책임)
- 외부 고객사 파일럿 (이번 마일스톤은 검증까지)

## Part 4: 성공 기준

**Q**: 성공 KPI?
**A**:
1. Spec 완결성 분포 ≥ 80% — 파일럿 2-org 산출물의 B+T+Q 3종 근거 가진 비율
2. AI-Ready 6기준 통과율 ≥ 90% — Skill 패키지 자동 검증 기준

**Q**: 비기능/실패 조건?
**A**:
- Spec 생성 성능: 문서 1건당 ≤ 5분 (현 extraction 타임 기준)
- 실패 조건: 6기준 70% 미달 시 재설계 검토

## Part 5: 제약

**Q**: 기술/일정?
**A**: 기존 Cloudflare 스택 유지 (svc-skill·svc-extraction 확장 형태, 신규 Worker 최소화)

**Q**: 보안/규제?
**A**: 기존 PII 마스킹 준수 (Tacit 응답 내 PII 5종 마스킹 후 D1 저장, E-01 미들웨어 재사용)
