# Recon-X MSA 재조정 — 인터뷰 로그

**날짜**: 2026-04-07
**참석자**: Sinclair Seo (AX BD팀)
**진행자**: Claude Code (AI 협업)
**입력 문서**: `docs/AX-BD-MSA-Restructuring-Plan.md` (FX-DSGN-MSA-001 v3)

---

## 진입 컨텍스트

기존 PRD가 아닌 MSA 재조정 설계서(FX-DSGN-MSA-001 v3)를 기반으로 인터뷰 진행.
설계서에는 7개 서비스 + AXIS DS 구조, Phase 19 로드맵, 107건 F-item 배정이 포함.
이 인터뷰는 **현재 리포(res-ai-foundry)의 Recon-X 전환**에 집중.

---

## Part 1: 왜 (목적/문제)

**Q: PRD 범위를 어떻게 잡을까요?**
> A: 현재 Repository인 AI Foundry만 진행.

**Q: MSA 재조정의 핵심 동기는?**
> A: (1) Recon-X 역할 집중 — RE 엔진에 집중하기 위해 포털/인증/대시보드 분리
> (2) 다른 서비스 연동 준비 — Foundry-X, Discovery-X 등과의 인터페이스 명확화

**Q: 시급성은?**
> A: 지금 바로 시작. Foundry-X Phase 18과 병행.

---

## Part 2: 누구를 위해 (사용자/이해관계자)

**Q: Recon-X의 주 사용자는?**
> A: RE 전담 역할로 축소 — Analyst(업로드/실행) + Developer(스킬 통합) 중심.
> Reviewer/Client/Executive는 AI Foundry 포털로 이동.

**Q: Recon-X 출력의 주 소비자는?**
> A: 전체 서비스 — Discovery-X, Foundry-X, Gate-X, Launch-X, Eval-X 모두 참조.
> Recon-X는 역공학 결과를 모든 *-X 서비스에 공급하는 "지식 추출 허브".

---

## Part 3: 무엇을 (범위/기능)

**Q: 12개 Worker 중 잔류 범위는?**
> A: 5-Stage 파이프라인 전체 잔류 (7 Workers: ingestion, extraction, policy, ontology, skill, queue-router, mcp-server).

**Q: 나머지 5개 플랫폼 Worker는?**
> A: 즉시 분리 대상 — llm-router, security, governance, notification, analytics.
> 설계서에서 AI Foundry 포털로 이관 계획.

**Q: 프론트엔드(app-web)는?**
> A: Recon-X UI만 잔류 — upload, pipeline, factcheck, skill, ontology 등.
> 대시보드/설정/로그인은 포털로.

**Q: Out-of-scope는?**
> A: (1) AI Foundry 포털(S0) 구축
> (2) GIVC PoC (F255, F256)
> (3) 새 파일럿 도메인 추가
> ※ D1/R2 데이터 마이그레이션은 In-scope

---

## Part 4: 어떻게 판단할 것인가 (성공 기준)

**Q: 성공 기준은?**
> A: 3가지 전부 필수 (MVP = 전부):
> (1) 독립 배포 + 테스트 통과 — Recon-X Workers 독립 배포, E2E 46건 전체 PASS
> (2) 파일럿 데이터 유지 — 3,675 policies + 3,924 skills 무손실 이전
> (3) 서비스 연동 인터페이스 — Foundry-X MCP/Event 연동 정의 + 테스트

---

## Part 5: 제약과 리소스

**Q: 제약 조건은?**
> A: (1) Cloudflare 스택 유지 (Workers/D1/R2/Queues/Pages)
> (2) 인력 1명 + AI 협업 (Claude Code)
> (3) 목표 완료: 2주 이내

---

## 요약 확인

사용자 확인: "맞아요, PRD 작성 시작" (수정사항 없음)
