# Sprint 219 Plan — F355b + F362: Foundry-X 통합 완결

**Sprint**: 219
**REQ**: AIF-REQ-035 Phase 3 M-2b/M-2c
**작성일**: 2026-04-21
**상태**: IN_PROGRESS

---

## 1. 목표

Sprint 218에서 확인된 6중 갭 중 인증 미스매치(갭 #5)와 packaging pipeline 부재(갭 #6)를 해소하여
**Foundry-X Production E2E 실 호출 6/6** 달성. 핵심 KPI:
- F355b: Production 실 호출 200 응답 1회 이상 확보 (TD-31 해소)
- F362: skills D1 lpon-* domain count 0 → 7+ (TD-32 해소)

## 2. F-Items

### F355b — Foundry-X internal endpoint 신설 + Cross-repo PR (M-2b, P0)
**예상 2~3h**

**배경**: F355a(세션 218)에서 URL/path/secret/migration 4건을 해소했으나, 인증 모델 미스매치(갭 #5)가 남아있다.
- Decode-X: `X-Internal-Secret` 헤더 방식으로 호출
- Foundry-X: JWT + tenant 미들웨어가 `/api/prototype-jobs`에 걸려있어 401 반환

**해결 전략**:
1. Foundry-X에 `POST /api/internal/prototype-jobs` 신설 — `X-Internal-Secret` 전용 미들웨어 적용
2. Decode-X `handoff.ts`의 `callerSecret` 전달 로직 정렬
3. `FOUNDRY_X_SECRET` production secret 실값 확정 (F355a placeholder 교체)

### F362 — spec-container → skills D1 packaging pipeline (M-2c, P0)
**예상 1~2 Sprint**

**배경**: `.decode-x/spec-containers/lpon-*/` 7개 디렉토리가 존재하지만 skills D1에 들어가는 경로가 없다 (갭 #6).
현재 skills는 Stage 5 LLM 생성 결과만 포함, spec-container provenance가 누락.

**해결 전략**:
1. `POST /skills/from-spec-container` 신규 endpoint (svc-skill)
2. spec-container → SkillPackage Zod schema 변환기
3. R2 .skill.json 업로드 + skills D1 INSERT
4. 7서비스 일괄 packaging 스크립트 (`scripts/package-spec-containers.ts`)

## 3. 범위

### In Scope (Decode-X repo)
- `services/svc-skill/src/routes/handoff.ts` — callerSecret 정렬 (F355b)
- `services/svc-skill/src/routes/skill.ts` — `from-spec-container` endpoint (F362)
- `services/svc-skill/src/spec-container/` (신규)
  - `converter.ts` — provenance.yaml + rules/runbooks/tests/contracts → SkillPackage
  - `types.ts` — SpecContainer 타입 정의
- `scripts/package-spec-containers.ts` — 7서비스 일괄 packaging CLI (F362)
- `infra/migrations/db-skill/0008_spec_container_ref.sql` — provenance 컬럼 추가 (F362)
- 테스트: `services/svc-skill/src/spec-container/*.test.ts`

### In Scope (Foundry-X repo, Cross-repo PR)
- `services/svc-*/routes/internal-prototype-jobs.ts` 또는 기존 라우터 확장
- `X-Internal-Secret` 전용 미들웨어 적용
- `orgId` 명시적 파라미터 처리

### Out of Scope
- F359 (TD-22 comparator): 체력 여유 시
- F356-A (AI-Ready 채점기): Sprint 220
- Foundry-X 상세 구현 내부 로직 (Cross-repo는 endpoint 레벨만)

## 4. 성공 기준

| 항목 | 기준 |
|------|------|
| F355b | Production `POST /api/internal/prototype-jobs` 200 응답 1회 확보 |
| F355b | TD-31 인증 미스매치 해소 표시 |
| F362 | `POST /skills/from-spec-container` → 200 + skill ID 반환 |
| F362 | lpon-* 7서비스 packaging 완료, skills D1 count +7 이상 |
| F362 | TD-32 packaging pipeline 부재 해소 표시 |
| 공통 | typecheck PASS, lint PASS |

## 5. 리스크

| 리스크 | 대응 |
|--------|------|
| Foundry-X repo 접근권 없음 | Cross-repo PR 대신 mock endpoint로 F355b 검증 후 real PR 가이드 작성 |
| spec-container YAML 스키마 불일치 | 실제 파일 구조 먼저 파싱하여 Zod schema 역방향 도출 |
| D1 migration production 적용 타이밍 | staging 먼저 검증 → production 순차 적용 |

## 6. 실행 순서

1. F355b — Foundry-X endpoint 설계 + Decode-X handoff.ts 정렬
2. F355b — Cross-repo PR 가이드 or 실 PR
3. F362 — spec-container 구조 분석
4. F362 — converter + endpoint 구현
5. F362 — packaging script + migration
6. 통합 검증 (typecheck + test)
