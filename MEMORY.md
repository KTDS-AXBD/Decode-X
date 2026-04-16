# MEMORY.md — Decode-X Auto Memory

> 세션 시작 시 자동 로딩되는 컨텍스트 캐시. 수치/실측값은 **SPEC.md SSOT** 참조(§2 "마지막 실측", §5 Current Status). 여기는 맥락·활성 작업·결정만 유지한다.

## 현재 포지션

- **프로젝트**: Decode-X — AI Foundry 플랫폼 1단계 수집 서비스(역공학 엔진). 기존 SI 산출물/소스코드에서 기능 스펙 역추출 → Foundry-X 핸드오프
- **버전**: v0.7.0 (Pilot Core 완료, 2026-04-07 태깅)
- **현재 단계**: Pilot Core 종료 선언 이후 — 다음 마일스톤 정의 전 유예 구간
- **파일럿 도메인**: 퇴직연금(Miraeasset) + 온누리상품권(LPON) 2-org
- **GitHub**: KTDS-AXBD/Decode-X (main 단일 브랜치)
- **Production URL**: rx.minu.best (Cloudflare Pages + 7 Workers + API Gateway)

## 활성 작업 (IN_PROGRESS)

| REQ | 우선순위 | 요지 |
|-----|:--------:|------|
| AIF-REQ-034 | P0 | **Decode-X Deep Dive** — Sprint 205-207 완료. Adapter 복구(passRate 23.6%→36.5%), Technical 4축 스키마+프롬프트, Drill-down 페이지, Before/After 비교. **다음**: B/T/Q Spec 문서 생성기(generator) 구현 — 현재 signal scorer만 있고 문서 조립 레이어 부재 |
| AIF-REQ-026 | P1 | Foundry-X 통합 — AI Foundry↔Foundry-X 양방향 제품군 통합. Phase 1-3 MCP 완료, Phase 2 Sprint 1(반제품 생성) 완료. 후속 Sprint 미확정 |
| AIF-REQ-018 | P1 | 진행 현황 리포트 UX 개선 — 3단계 구조 + accordion + 시각화 |
| AIF-REQ-002 | P3 | Anthropic vs OpenAI extraction 품질 비교 (크레딧 충전 대기) |

## 다음 후보 (OPEN, 아직 PLANNED 미진입)

- **AIF-REQ-024** (P1): Generative UI Framework — Sandboxed Widget + AG-UI Protocol + HITL Components
- **AIF-REQ-021** (P2): Adaptive LLM Router 고도화 — PAL Router 패턴
- **AIF-REQ-023** (P2): Pipeline Event Sourcing & Observability

## 활성 리스크 · 기술부채

- **TD-01**: `svc-governance/src/routes/cost.ts` cost 집계 미구현 (TODO 주석만) — 비용 대시보드 부정확
- **C-04** (잔존 제약): Anthropic API 크레딧 기반 과금 — multi-provider fallback으로 완화됨

## 최근 세션 흐름 (v0.7 마일스톤 기준)

- 세션 196~198: API Gateway(Hono+JWT) + 11 Service Bindings + 하이브리드 라우팅 완성
- 세션 199: 도메인 `ai-foundry.minu.best` → `rx.minu.best` 리브랜딩 (AIF-REQ-032)
- 세션 200: Pilot Core 종료 선언 (REQ 24/32 DONE, E2E 43/43, 0 flaky), AIF-REQ-028 소급 DONE, v0.7.0 태그 + 회고
- 세션 202 (2026-04-16): AIF-REQ-034 Deep Dive 실구현. Sprint 205(adapter 복구+backfill+drill-down API) + Sprint 206(Technical 4축 스키마+프롬프트) + Sprint 207(drill-down 페이지+assembler 주입+Before/After). R2 893건 backfill → passRate 23.6%→36.5%(+12.9%p). B/T/Q Spec 문서 생성기 Gap 확인 → 다음 세션 과제. ccw-auto 버그 수정(하이픈→콜론) + bashrc 복원 + settings.json deny 규칙 추가.
- 세션 201 (2026-04-16): AIF-REQ-034 Decode-X Deep Dive PRD(82/100) + PoC 채점기 구현/배포 + LPON 894건 실측 → "B 91.8%, T 4.3%, Q 27% — Technical 강화가 핵심 Gap" 정량 확인.

## 인프라 상태 (v0.7.0 기준 스냅샷)

- **Workers**: svc-ingestion / svc-extraction / svc-policy / svc-ontology / svc-skill / svc-queue-router / svc-mcp-server (도메인 5 + 인프라 2)
- **분리된 SVC**: ~~svc-llm-router~~, ~~svc-security~~, ~~svc-governance~~, ~~svc-notification~~, ~~svc-analytics~~ → AI Foundry 포털 이관. `services/` 디렉토리에 소스 잔존(별도 리포 이전 또는 삭제 대기, v0.7 회고 개선점)
- **D1**: 5 DBs (ingestion/structure/policy/ontology/skill). 분리된 5 DB 마이그레이션 삭제 완료
- **LLM 호출**: `packages/utils/src/llm-client.ts` `callLlm()` HTTP REST (외부 llm-router)
- **RBAC**: `packages/utils/src/rbac.ts` `checkPermission()` inline

## 작업 원칙 메모 (이 프로젝트 오버라이드)

- 수치 하드코딩은 SPEC.md §2 "마지막 실측" **1곳만**. CLAUDE.md/MEMORY.md는 맥락만 (세션 189 리팩토링)
- `/ax:session-end`가 수치 동기화 + 커밋 + push + 배포까지 수행
- E2E는 로컬 retry 통과로 CI 실패를 놓친 사례(v0.7 회고) → CI 결과 먼저 확인
- 신규 REQ는 등록 지연 없이 즉시 SPEC §7에 올리고 Sprint 배치 (v0.7 개선점)
