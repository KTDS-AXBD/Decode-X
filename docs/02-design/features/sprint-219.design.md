# Sprint 219 Design — F355b + F362: Foundry-X 통합 완결

**Sprint**: 219
**REQ**: AIF-REQ-035 Phase 3 M-2b/M-2c
**작성일**: 2026-04-21
**상태**: IN_PROGRESS

---

## 1. 개요

Sprint 218 갭 분석에서 확인된 6중 갭 중 **갭 #5 (인증 미스매치)** + **갭 #6 (packaging pipeline 부재)** 해소.

### F355b: Foundry-X internal endpoint 신설

Foundry-X의 `POST /api/prototype-jobs`는 JWT authMiddleware 하에 있어
`X-Internal-Secret` 헤더만으로는 접근 불가. 해결책: **별도 internal 경로 신설**.

```
Decode-X svc-skill                   Foundry-X API
handoff.ts:239                        app.ts
   │                                     │
   │  POST /api/internal/prototype-jobs  │ ← 신규 (X-Internal-Secret auth)
   │  X-Internal-Secret: {secret}        │
   │  Body: { orgId, prdContent, ... }   │
   └────────────────────────────────────▶│
                                         │ internal-prototype-jobs.ts (신규)
                                         │   verifyInternalSecret()
                                         │   PrototypeJobService.create(orgId, ...)
                                         │◀────────────────────────────────────────
                                    201 { jobId, status }
```

### F362: spec-container → skills D1 packaging pipeline

```
.decode-x/spec-containers/lpon-*/    scripts/package-spec-containers.ts
  provenance.yaml                         │ (Node.js CLI, reads FS)
  rules/*.md                              │ parse YAML + MD
  tests/*.yaml                            │ → SpecContainerInput JSON
  runbooks/                               │
                                          │ POST /skills/from-spec-container
                                          ▼
                          svc-skill (Cloudflare Worker)
                          src/spec-container/converter.ts
                          → SkillPackage (Zod validated)
                          → R2: skill-packages/{id}.skill.json
                          → D1 skills INSERT
                          → Response: { skillId, domain, policyCount }
```

---

## 2. F355b 상세 설계

### 2.1 Foundry-X 변경 (Cross-repo PR)

**파일**: `packages/api/src/core/harness/routes/internal-prototype-jobs.ts` (신규)

```typescript
// X-Internal-Secret 전용 internal endpoint
// JWT authMiddleware 우회 — orgId는 body에서 명시적으로 받음

export const internalPrototypeJobsRoute = new Hono<{ Bindings: Env }>();

internalPrototypeJobsRoute.post("/internal/prototype-jobs", async (c) => {
  // X-Internal-Secret 검증
  const secret = c.req.header("X-Internal-Secret");
  if (!secret || secret !== c.env.INTERNAL_API_SECRET) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { orgId, prdContent, prdTitle } = await c.req.json();
  const svc = new PrototypeJobService(c.env.DB);
  const job = await svc.create(orgId, prdContent, prdTitle);
  return c.json(job, 201);
});
```

**파일**: `packages/api/src/app.ts` 마운트 위치

```typescript
// authMiddleware 이전 (line 222 app.use("/api/*", authMiddleware) 앞)에 배치
app.route("/api", internalPrototypeJobsRoute);   // ← 신규, 222번 라인 전에 삽입
app.use("/api/*", authMiddleware);               // 기존
```

**환경 변수**: `DECODE_X_HANDOFF_SECRET` — Foundry-X secrets에 추가 (구현에서 명확성을 위해 rename)
- dev: `wrangler secret put DECODE_X_HANDOFF_SECRET` (Decode-X `FOUNDRY_X_SECRET`과 동일한 값)
- production: Foundry-X Workers secrets

### 2.2 Decode-X 변경

**파일**: `services/svc-skill/src/routes/handoff.ts:239`

```diff
- const foundryRes = await fetch(`${env.FOUNDRY_X_URL}/api/prototype-jobs`, {
+ const foundryRes = await fetch(`${env.FOUNDRY_X_URL}/api/internal/prototype-jobs`, {
```

F355b 주석 업데이트 (TD-31 해소 표시).

---

## 3. F362 상세 설계

### 3.1 SpecContainerInput Zod Schema

**파일**: `services/svc-skill/src/spec-container/types.ts`

```typescript
// spec-container HTTP 요청 바디 스키마
export const SpecContainerInputSchema = z.object({
  specContainerId: z.string(),     // e.g. "lpon-purchase"
  orgId: z.string().min(1),
  provenance: z.object({
    skillId: z.string(),           // e.g. "POL-LPON-PURCHASE-001"
    extractedAt: z.string(),
    extractedBy: z.string(),
    sources: z.array(z.object({
      type: z.enum(["reverse-engineering", "inference"]),
      path: z.string().optional(),
      confidence: z.number(),
    })),
  }),
  policies: z.array(z.object({
    code: z.string(),              // BP-001 등 (스크립트가 POL-* 형식으로 변환)
    title: z.string(),
    condition: z.string(),
    criteria: z.string(),
    outcome: z.string(),
  })),
  testScenarios: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })).default([]),
  domain: z.string(),              // e.g. "LPON"
  subdomain: z.string().optional(),
  version: z.string().default("1.0.0"),
});
```

### 3.2 converter.ts

**파일**: `services/svc-skill/src/spec-container/converter.ts`

SpecContainerInput → SkillPackage 변환:
- `provenance.skillId` → policy code 기반 UUID v5 생성 (없으면 crypto.randomUUID())
- BP-* 코드 → POL-{DOMAIN}-{CODE}-001 형식으로 정규화
- source documentId = specContainerId + "-" + source.path hash
- trust: `{ level: "reviewed", score: 0.8 }` (spec-container는 인간 검토 거침)
- ontologyRef: stub (ontology 연동은 F363 이후)
- provenance.pipeline: `{ stages: ["spec-container-import"], models: {} }`

### 3.3 endpoint

**파일**: `services/svc-skill/src/routes/skills.ts`에 추가

```
POST /skills/from-spec-container
  Body: SpecContainerInput JSON
  Auth: X-Internal-Secret (스크립트가 INTERNAL_API_SECRET 헤더로 호출)
  Response: { skillId, domain, policyCount, r2Key }
```

처리 순서:
1. X-Internal-Secret 검증
2. SpecContainerInputSchema.parse(body)
3. converter.convert(input) → SkillPackage
4. R2 PUT: `skill-packages/{skillId}.skill.json`
5. D1 INSERT (기존 skills.ts INSERT 패턴 재사용)
6. return ok({ skillId, domain, policyCount, r2Key })

### 3.4 D1 Migration

**파일**: `infra/migrations/db-skill/0008_spec_container_ref.sql`

```sql
ALTER TABLE skills ADD COLUMN spec_container_id TEXT;
CREATE INDEX IF NOT EXISTS idx_skills_spec_container ON skills(spec_container_id)
  WHERE spec_container_id IS NOT NULL;
```

### 3.5 Packaging Script

**파일**: `scripts/package-spec-containers.ts`

Node.js CLI (tsx 실행):
```
Usage: tsx scripts/package-spec-containers.ts [--org lpon] [--dry-run]
```

처리:
1. `.decode-x/spec-containers/` glob → 7개 디렉토리
2. 각 디렉토리에서 파일 읽기:
   - `provenance.yaml` → YAML 파싱 (simple line-based parser)
   - `rules/*.md` → BP-* 테이블 행 파싱 (regex)
   - `tests/*.yaml` → 시나리오 ID/name 파싱
3. SpecContainerInput JSON 조립
4. `POST /skills/from-spec-container` 호출 (local: `http://localhost:8787`, remote: `FOUNDRY_X_URL`)
5. 결과 요약 출력

---

## 4. 테스트 계약 (TDD Red Target)

### F355b
- `handoff.ts` 단위: `fetch` mock → `/api/internal/prototype-jobs` URL 확인
- Integration: Production health endpoint 200 → submit → 200 응답

### F362
- `converter.test.ts`: SpecContainerInput fixture → SkillPackage Zod validation
- `skills.ts` from-spec-container endpoint: mock R2 + D1 → 201 + skillId
- `package-spec-containers.ts`: dry-run 모드 JSON 출력 확인

---

## 5. Worker 파일 매핑

| 파일 | 작업 | 분류 |
|------|------|------|
| `services/svc-skill/src/routes/handoff.ts` | line 239 path 변경 + 주석 갱신 | F355b Decode-X |
| `packages/api/src/core/harness/routes/internal-prototype-jobs.ts` | 신규 (Foundry-X) | F355b FX |
| `packages/api/src/app.ts` | internalPrototypeJobsRoute 마운트 | F355b FX |
| `services/svc-skill/src/spec-container/types.ts` | 신규 | F362 |
| `services/svc-skill/src/spec-container/converter.ts` | 신규 | F362 |
| `services/svc-skill/src/spec-container/converter.test.ts` | 신규 (TDD) | F362 |
| `services/svc-skill/src/routes/skills.ts` | from-spec-container endpoint 추가 | F362 |
| `infra/migrations/db-skill/0008_spec_container_ref.sql` | 신규 | F362 |
| `scripts/package-spec-containers.ts` | 신규 | F362 |
