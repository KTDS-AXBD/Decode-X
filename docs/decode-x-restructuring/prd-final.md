# Recon-X MSA 재조정 PRD

**버전:** final

**날짜:** 2026-04-07
**작성자:** AX BD팀
**상태:** ✅ 착수 준비 완료
**참조**: `docs/AX-BD-MSA-Restructuring-Plan.md` (FX-DSGN-MSA-001 v3)

---

## 1. 요약 (Executive Summary)

**한 줄 정의:**
현재 res-ai-foundry 리포를 Recon-X(역공학 전담 서비스)로 전환하여, 5-Stage RE 파이프라인에 집중하고 플랫폼 기능을 분리한다.

**배경:**
AI Foundry v0.6은 12개 Cloudflare Workers + 10개 D1 + Pages SPA로 구성된 모놀리식 구조. 역공학 엔진(5-Stage Pipeline)과 플랫폼 기능(인증, 대시보드, 거버넌스 등)이 단일 리포에 혼재. AX BD 서비스 그룹의 MSA 재조정(FX-DSGN-MSA-001)에 따라 7개 독립 서비스로 분리 예정이며, 이 PRD는 그 중 Recon-X(S2) 전환에 집중한다.

**목표:**
- res-ai-foundry → Recon-X로 역할 명확화
- 5-Stage RE 파이프라인을 핵심으로 유지하고 플랫폼 SVC 5개를 분리
- 다른 *-X 서비스와의 연동 인터페이스를 정의하여 MSA 확장 기반 마련

---

## 2. 문제 정의

### 2.1 현재 상태 (As-Is)

- **12개 Workers**가 단일 리포에 공존: RE 엔진(7) + 플랫폼(5)
- **10개 D1** 데이터베이스가 모두 동일 Cloudflare 계정에 바인딩
- **20개 페이지**의 프론트엔드에 RE 전용 UI와 포털 성격 UI가 혼재
- **서비스 경계 모호**: svc-llm-router는 RE 전용인지 공통 플랫폼인지 불분명
- **배포 단위 비대**: 12개 Worker를 개별 배포하지만 단일 리포에서 관리
- 기존 파일럿 데이터: policies 3,675건, skills 3,924건 (퇴직연금 + 온누리상품권)

- **운영상/기술적 Pain Point**:
  - 배포/롤백 어려움: 단일 리포 구조로 인해 전체 서비스에 장애 발생 시 부분 롤백이 어렵고, 장애 전파 범위가 넓음
  - 장애 전파 위험: 서비스 간 결합도가 높아 한 서비스 장애가 전체 서비스에 영향
  - 개발 속도 저하: 공통 코드와 의존성 관리가 복잡해, 신규 기능 개발 및 테스트 시 병목 발생
  - 데이터 바인딩 혼재: D1 DB 분리 미흡으로 데이터 오염, 스키마 불일치 및 데이터 무결성 문제 가능성
  - 테스트/운영 복잡성: 통합 테스트와 운영 모니터링 범위가 넓어, 장애 감지 및 대응 속도 저하

### 2.2 목표 상태 (To-Be)

```
Recon-X (이 리포)
├── 7 Workers (5-Stage Pipeline + Queue Router + MCP Server)
├── 5 D1 DBs (ingestion, structure, policy, ontology, skill)
├── R2 Buckets (documents, skill-packages)
├── Recon-X 전용 Pages SPA (~10 페이지)
└── 서비스 연동 인터페이스 (MCP, Event, REST)

분리 대상 → AI Foundry 포털 (별도 리포)
├── 5 Workers (llm-router, security, governance, notification, analytics)
├── 5 D1 DBs (llm, security, governance, notification, analytics)
└── 포털 성격 Pages (~10 페이지)
```

### 2.3 시급성

- **즉시 시작** — Foundry-X Phase 18과 병행 진행
- 2주 이내 완료 목표
- MSA 재조정의 첫 번째 서비스 분리로, 이후 다른 *-X 서비스 분리의 선례가 됨

---

## 3. 사용자 및 이해관계자

### 3.1 주 사용자 (Recon-X)

| 역할 | 설명 | 주요 니즈 |
|------|------|-----------|
| Analyst | SI 산출물 업로드 + RE 파이프라인 실행 | 문서 업로드, 파이프라인 모니터링, 결과 조회 |
| Developer | 추출된 스킬/스펙을 통합 활용 | MCP 어댑터 연동, Skill 패키지 접근 |

### 3.2 이해관계자

| 구분 | 역할 | 영향도 |
|------|------|--------|
| Sinclair Seo | AX BD팀 개발자, 단독 구현 | 높음 |
| AX BD팀 리더 | 사업 방향 의사결정 | 높음 |
| Foundry-X 팀 | 주 소비자 — RE 결과를 발굴/형상화에 활용 | 중간 |
| 전체 *-X 서비스 | Recon-X 출력(스펙/도메인 지식) 소비 | 중간 |

### 3.3 사용 환경

- 기기: PC (사내 개발 환경)
- 네트워크: 인터넷 (Cloudflare Workers)
- 기술 수준: 개발자 + 비즈니스 분석가

---

## 4. 기능 범위

### 4.1 핵심 기능 (Must Have)

| # | 기능 | 설명 | 우선순위 |
|---|------|------|----------|
| M1 | 플랫폼 SVC 분리 | svc-llm-router, svc-security, svc-governance, svc-notification, svc-analytics 5개 Worker를 리포에서 제거 | P0 |
| M2 | D1 바인딩 정리 | 분리된 5개 SVC의 D1(db-llm, db-security, db-governance, db-notification, db-analytics) 참조 제거. 잔류 7 Workers의 wrangler.toml에서 불필요한 바인딩 정리 | P0 |
| M3 | LLM 라우팅 내재화 | svc-llm-router 분리 후, Recon-X 파이프라인이 직접 LLM API를 호출하도록 전환. 또는 외부 svc-llm-router를 service binding → HTTP 호출로 변경 | P0 |
| M4 | 프론트엔드 정리 | app-web에서 포털 성격 페이지(dashboard, settings, login, team, audit 등) 제거. Recon-X 전용 UI만 잔류 (~10 페이지) | P0 |
| M5 | 리포 리네임 준비 | GitHub repo명 `Recon-X`로 변경 가능한 상태. package.json, CLAUDE.md, SPEC.md 등 내부 참조 정리 | P0 |
| M6 | E2E 테스트 조정 | 분리된 기능 관련 E2E 제거/수정, 잔류 기능 E2E 전체 PASS 확인 | P0 |
| M7 | 서비스 연동 인터페이스 정의 | Foundry-X, AI Foundry 포털과의 MCP/Event/REST 연동 인터페이스 문서화 + 엔드포인트 구현 | P0 |


| M8 | 보안 및 접근제어 방안 마련 | svc-security 분리 이후 Recon-X 내에서 필요한 최소 인증/인가, 데이터 접근제어, 감사 로그 로직 유지 및 구체적 구현/문서화 | P0 |
| M9 | 데이터 무손실 보장 및 검증 | D1 DB 분리/정리 과정에서 데이터 누락/오염, 스키마 미스매치 방지. 마이그레이션 전/후 데이터 COUNT 및 스키마 검증, 스냅샷/백업 전략 수행 | P0 |
| M10 | 롤백/Failover 및 복구 전략 수립 | 코드/DB/인프라 변경 실패 혹은 장애 발생 시 즉시 원상 복구 가능한 롤백 절차(코드태그, DB Snapshot, IaC Rollback 등) 문서화 및 적용 | P0 |
| M11 | 운영/모니터링 체계 정비 | 서비스 분리 이후 각 서비스별 모니터링, 장애 감지, Alerting, SLO/SLA, 운영자 가이드(Runbook) 작성 | P0 |
| M12 | QA/검증 프로세스 명시 | 1인 담당 체계에서의 코드 리뷰, 외부 QA, UAT 등 검증 프로세스 정의 및 체크리스트화 | P0 |
| M13 | 의존성/공통 모듈 관리 가이드 | packages/types, packages/utils 등 공통 모듈의 중앙화/중복관리, 라이브러리 의존성 충돌 방지 가이드 마련 | P0 |

### 4.2 부가 기능 (Should Have)

| # | 기능 | 설명 | 우선순위 |
|---|------|------|----------|
| S1 | CI/CD 파이프라인 조정 | deploy.yml에서 분리된 SVC 배포 제거, Recon-X 전용으로 경량화 | P1 |
| S2 | 모니터링 독립화 | health-check.sh에서 분리 SVC 제거, Recon-X Workers만 모니터링 | P1 |
| S3 | Turborepo 워크스페이스 정리 | 분리된 SVC 패키지 제거, turbo.json 정리 | P1 |
| S4 | 문서 갱신 | CLAUDE.md, SPEC.md, CHANGELOG.md를 Recon-X 관점으로 갱신 | P1 |

### 4.3 제외 범위 (Out of Scope)

| 항목 | 이유 |
|------|------|
| AI Foundry 포털(S0) 구축 | 별도 프로젝트. 분리된 SVC는 포털 리포로 이관 |
| GIVC PoC (F255, F256) | Recon-X 전환과 별개의 기능 개발. 전환 완료 후 진행 |
| 새 파일럿 도메인 추가 | 퇴직연금 + 온누리상품권 외 신규 도메인은 전환 후 |
| 분리된 SVC의 독립 리포 생성 | AI Foundry 포털 팀에서 처리. 이 PRD는 Recon-X에서 제거하는 것까지만 |
| Neo4j Aura 마이그레이션 | 현재 구조 유지. Recon-X가 계속 사용 |


| 보안 감사 및 외부 PenTest | Recon-X 분리 프로젝트 범위 외, 별도 보안팀 주관 |
| 신규 SLO/SLA 협상 | SLO/SLA는 운영팀 및 사업팀과 별도 협상, 본 PRD 범위 외 |
| 외부 서비스(Foundry-X, 포털) 연동 개발 | 타 서비스팀 책임, 본 PRD는 인터페이스 정의 + 자체 테스트까지만 담당 |

### 4.4 외부 연동

| 시스템 | 연동 방식 | 필수 여부 |
|--------|-----------|-----------|
| Foundry-X | MCP (Streamable HTTP) + Event (item.collected) | 필수 |
| AI Foundry 포털 | REST (인증 토큰 검증) + Event (eval.scored) | 필수 |
| Discovery-X | Event (item.collected → ingestion 트리거) | 선택 (Phase 2) |
| svc-llm-router (외부화 후) | HTTP REST (tier routing) | 필수 (M3 방식에 따라) |
| Neo4j Aura | HTTPS Query API final | 필수 (기존 유지) |
| Cloudflare AI Gateway | 기존 유지 | 필수 |

---

## 5. 성공 기준

### 5.1 정량 지표 (KPI)

| 지표 | 현재값 | 목표값 | 측정 방법 |
|------|--------|--------|-----------|
| Recon-X Workers 수 | 12 | 7 | `wrangler.toml` 파일 수 |
| D1 바인딩 수 (per Worker) | ~10 | 필요한 것만 | wrangler.toml 분석 |
| E2E 테스트 PASS | 46/46 | Recon-X 관련 전체 PASS | `bun run test` + Playwright |
| 파일럿 데이터 무손실 | 3,675 policies + 3,924 skills | 동일 | D1 쿼리 COUNT 비교 |
| 프론트엔드 페이지 수 | 20 | ~10 (Recon-X 전용) | 라우트 수 |
| 서비스 연동 인터페이스 | 미정의 | 문서화 + 테스트 완료 | 인터페이스 문서 + E2E |

| 데이터 무손실 검증 | - | 분리 전/후 D1 Snapshot, COUNT, 스키마 비교 | DB Snapshot, diff 쿼리 |
| 연동 실패 대응 | - | 연동 실패 발생 시 롤백/Failover 적용 여부 | 장애 시나리오 테스트 |
| 운영/모니터링 체계 | - | SLO/SLA, Alert, Runbook 문서화 및 실제 장애 대응 훈련 | 운영팀 피드백, 장애 모의훈련 결과 |

### 5.2 MVP 최소 기준

- [x] 플랫폼 5 Workers가 리포에서 제거됨
- [x] Recon-X 7 Workers가 독립 배포되어 정상 동작
- [x] 파일럿 데이터(policies, skills) 무손실 확인
- [x] Foundry-X MCP 연동 인터페이스 정의 + 테스트
- [x] Recon-X 전용 E2E 전체 PASS

- [x] 데이터 무손실 검증(스냅샷, COUNT, 스키마 diff 등) 완료
- [x] 롤백/복구 시나리오 문서화 및 1회 이상 검증
- [x] Recon-X 보안/접근제어/감사 로그 정책 준수
- [x] 운영/모니터링/Alert/Runbook 문서화 및 테스트

### 5.3 실패/중단 조건

- 파일럿 데이터 손실 발생 시 → 즉시 롤백
- LLM 라우팅 내재화가 기존 파이프라인 안정성을 해칠 경우 → M3을 HTTP 호출 방식으로 전환
- 2주 초과 시 → 잔여 작업(S1~S4)을 별도 Sprint로 분리

- 서비스 연동 실패 및 복구 불가 시 → 장애 원인 분석 후 전체 롤백 및 재작업
- DB 분리 후 데이터/스키마 오염 발생 시 → Snapshot 복원 후 원상 복구
- 보안/접근제어 결함(감사 로그 미수집 등) 발생 시 → 즉시 장애 신고 및 운영팀 협의

---

## 6. 제약 조건

### 6.1 일정

- 목표 완료일: 2026-04-21 (2주)
- 마일스톤:
  - W1: M1~M4 (분리 + 정리)
  - W2: M5~M7 (리네임 + 테스트 + 연동)

- 단, 1인 담당 + Foundry-X Phase 18 병행에 따른 일정 리스크가 높으므로, 병가/예외 발생 시 즉시 일정 재조정 및 사업팀/운영팀 공유 필수

### 6.2 기술 스택

- 프론트엔드: React + Vite + Tailwind CSS v4 + shadcn/ui (현행 유지)
- 백엔드: Cloudflare Workers + Hono (현행 유지)
- 인프라: D1, R2, Queues, KV, Durable Objects (현행 유지)
- 기존 시스템 의존: Neo4j Aura (Query API final), Cloudflare AI Gateway

### 6.3 인력/예산

- 투입 가능 인원: 1명 (Sinclair Seo) + AI 협업 (Claude Code)

- 단일 인력 체계로 병목/품질 저하/업무 불가(병가 등) 발생 시 즉시 사업팀/운영팀에 리스크 공유 및 대체 인력/일정 재조정 논의
- 예산 규모: Cloudflare 기존 플랜 내 (추가 비용 없음)

### 6.4 컴플라이언스

- KT DS 내부 정책: 기존 보안 정책 유지 (PII 마스킹, 감사 로그)
- 데이터 분류: Confidential → Internal → Public 3-tier 유지
- 감사 로그 5년 보존 정책은 분리된 SVC(svc-security)가 담당

- Recon-X 내에서 최소한의 감사로그(접근, 주요 데이터 변경) 및 보안 정책(PII 마스킹 등) 유지

---

## 7. 오픈 이슈

| # | 이슈 | 담당 | 마감 |
|---|------|------|------|
| 1 | svc-llm-router 분리 시 Recon-X 파이프라인의 LLM 호출 방식 결정 (내재화 vs HTTP 외부 호출) | Sinclair | W1 |
| 2 | svc-security의 RBAC/마스킹 로직 중 Recon-X에 필요한 부분을 inline으로 복사할지, 외부 호출로 유지할지 | Sinclair | W1 |
| 3 | 분리된 5개 D1 DB의 Cloudflare 계정 내 관리 방식 (같은 계정에 잔류? 별도 계정?) | Sinclair | W1 |
| 4 | app-web의 인증 플로우 — Recon-X 독립 인증 vs AI Foundry 포털 SSO 의존 | Sinclair | W1 |
| 5 | GitHub repo 리네임 시 기존 CI/CD, 이슈, PR 링크 깨짐 대응 | Sinclair | W2 |

| 6 | 주요 오픈 이슈(1,2,4) 아키텍처/보안 영향 분석 및 최종 결정, 근거/옵션/구현방식 별도 설계문서화 | Sinclair | W1 |
| 7 | 외부 연동 서비스(Foundry-X, 포털 등) 준비상태 사전 점검 및 연동 실패 시 Fallback/Rollback 대응 | Sinclair | W2 |

---

## 8. 기술 결정 사항

### 8.1 M3: LLM 라우팅 전략

**Option A: HTTP 외부 호출 (Recommended)**
- svc-llm-router를 독립 서비스로 유지하되, service binding → HTTP REST로 전환
- 장점: LLM 라우팅 로직 중복 없음, 중앙 관리 유지
- 단점: 네트워크 홉 추가, 외부 서비스 의존

**Option B: LLM 호출 내재화**
- 각 파이프라인 Worker가 직접 Anthropic/OpenAI/Google API 호출
- packages/utils에 경량 tier router 유틸리티 추가
- 장점: 독립성 극대화, 네트워크 홉 제거
- 단점: LLM 라우팅 로직 중복, 모델 변경 시 여러 곳 수정

- **실행 시 주의**: Option A 선택 시 장애 발생(연동 실패, 성능 저하 등) 즉시 기존 service binding 방식으로 롤백 시나리오를 사전 정의/테스트해야 함

### 8.2 M4: 프론트엔드 분리 전략

**Recon-X 잔류 페이지 (예상)**:
1. `/upload` — 문서 업로드
2. `/documents` — 문서 목록/상태
3. `/pipeline` — 파이프라인 모니터링
4. `/policies` — 정책 목록/HITL
5. `/ontology` — 온톨로지 그래프
6. `/skills` — 스킬 마켓플레이스
7. `/skill/:id` — 스킬 상세
8. `/factcheck` — Fact Check 결과
9. `/spec-catalog` — 스펙 카탈로그
10. `/export` — Export Center

**분리 대상 (포털로 이관)**:
- `/` — 대시보드
- `/login` — 인증
- `/settings` — 설정
- `/team` — 팀 관리
- `/audit` — 감사 보고서
- `/chat` — AI Chat Widget (포털 공통)
- 기타 관리/모니터링 페이지


- **공통 컴포넌트/레이아웃 분리 시 회귀테스트 필수**: shadcn/ui 기반이나, 레이아웃/사이드바/공통 스타일 영향 검증 필요
- **분리/제거 후 UI/UX 회귀/Smoke Test 체크리스트 적용**

---

## 9. 마일스톤

### W1 (2026-04-07 ~ 04-13): 분리 + 정리

| # | 작업 | 산출물 |
|---|------|--------|
| 1.1 | svc-llm-router, svc-security, svc-governance, svc-notification, svc-analytics 제거 | services/ 하위 5개 디렉토리 삭제 |
| 1.2 | D1 바인딩 정리 — 잔류 Workers의 wrangler.toml에서 불필요 바인딩 제거 | wrangler.toml 수정 × 7 |
| 1.3 | LLM 라우팅 전환 (Option A or B) | packages/utils 또는 외부 호출 코드 |
| 1.4 | 프론트엔드 포털 페이지 제거 | app-web 라우트/컴포넌트 정리 |
| 1.5 | packages/types, packages/utils에서 분리 SVC 전용 타입/유틸 정리 | 패키지 경량화 |

| 1.6 | 분리 전 D1 데이터 Snapshot, 스키마/COUNT diff, 마이그레이션 후 검증 | D1 Snapshot, diff 쿼리, 검증리포트 |
| 1.7 | 보안/접근제어/감사 로그 Recon-X 내 구현 및 운영 가이드 | 보안정책 문서, 감사로그 |
| 1.8 | 운영/모니터링/Alert/Runbook 문서화 | 운영가이드, Runbook |
| 1.9 | 주요 오픈이슈(LLM, RBAC 등) 설계문서화 및 의사결정 근거 기록 | 설계/결정 문서 |

### W2 (2026-04-14 ~ 04-21): 리네임 + 테스트 + 연동

| # | 작업 | 산출물 |
|---|------|--------|
| 2.1 | 내부 참조 정리 (package.json, CLAUDE.md, SPEC.md, turbo.json) | Recon-X 네이밍 반영 |
| 2.2 | E2E 테스트 조정 — 분리 기능 테스트 제거, 잔류 기능 PASS 확인 | Playwright 테스트 갱신 |
| 2.3 | 서비스 연동 인터페이스 문서화 | `docs/interfaces/` 디렉토리 |
| 2.4 | CI/CD + 모니터링 조정 | deploy.yml, health-check.sh 갱신 |
| 2.5 | GitHub repo 리네임 실행 + 후속 조치 | `KTDS-AXBD/Recon-X` |

| 2.6 | QA/검증 프로세스(코드리뷰, 외부 QA, UAT, 체크리스트) 적용 및 결과 리포트 | QA 체크리스트, 리뷰 로그 |
| 2.7 | 롤백/Failover 복구 시나리오 실제 테스트 및 보고 | 롤백 테스트 로그 |
| 2.8 | 장애대응 모의훈련 및 운영팀 피드백 반영 | 장애훈련 리포트, 운영팀 의견 |

---

## 10. 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| LLM 라우팅 분리로 파이프라인 불안정 | 높음 | Option A(HTTP 외부호출)로 시작, 문제 시 기존 service binding 복원. 연동 실패 대비 즉시 롤백 시나리오 사전 정의, 테스트 |
| 프론트엔드 분리 시 공유 컴포넌트 깨짐 | 중간 | shadcn/ui 기반이라 독립적. 공통 레이아웃/사이드바만 주의. 회귀/Smoke Test 적용 |
| D1 바인딩 제거 시 런타임 에러 | 높음 | typecheck로 참조 누락 감지 + 스테이징 테스트. 분리 전/후 Snapshot, 스키마 diff 및 복구 전략 적용 |
| GitHub 리네임 후 CI/CD 링크 깨짐 | 낮음 | GitHub이 자동 리다이렉트 제공. Actions secrets 재확인, 배포/모니터링 스크립트 수동 점검 |
| 2주 내 완료 불가 | 중간 | Should Have(S1~S4)를 별도 Sprint로 분리. 일정 초과/인력 이슈 발생 시 즉시 사업팀 공유 및 재조정 |
| 단일 인력 병목/결근 | 높음 | 병가/결근 시 즉시 일정 재조정/대체 인력 요청. 주요 결정/운영 문서화로 인수인계 최소화 |
| 데이터 무손실 미검증 | 높음 | 분리 전/후 DB Snapshot, COUNT, 스키마 diff 필수. 검증 실패 시 전체 롤백 |
| 외부 연동 서비스 미준비/연동실패 | 높음 | 사전 준비상태 점검, 연동 실패 시 Fallback/Failover, 장애 시나리오 문서화 및 대응 |
| QA/검증 프로세스 부재 | 중간 | 1인 개발에서도 최소 2인(외부 QA 등) 검증 프로세스 적용, 체크리스트/리포트 남김 |
| 운영/모니터링/Alert 미비 | 중간 | SLO/SLA, Alert, Runbook, 장애 대응 프로세스 문서화 및 운영팀 공유 |
| 의존성/공통 모듈 충돌 | 중간 | packages/types, packages/utils 등 공통 관리 기준 문서화, 중복/충돌 발생 시 우선순위 기준 관리 |
| 보안/접근제어 결함 | 높음 | 최소 인증/인가/감사 로그 로직 Recon-X 내 구현, 결함 발생 시 즉시 운영팀/보안팀 보고 및 Rollback |

---

## 11. 검토 이력

| 라운드 | 날짜 | 주요 변경사항 | 스코어 |
|--------|------|--------------|--------|
| 초안 | 2026-04-07 | 최초 작성 (인터뷰 기반) | - |

| 2차 | 2026-04-08 | AI(챗봇/LLM) 리뷰 기반 Pain Point, 롤백/운영/보안/QA/검증/공통모듈관리 등 보완 | Conditional(진행가능) |

---

*이 문서는 requirements-interview 스킬에 의해 자동 생성 및 관리됩니다.*