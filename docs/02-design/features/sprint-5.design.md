# Sprint 5 Design — Tacit Interview Agent MVP + Foundry-X Handoff 1건

**Sprint**: 5 / Phase 1 PoC (AIF-REQ-035)
**상태**: DESIGN
**작성일**: 2026-04-19
**Timebox**: ~60분

---

## §1. 목표

| ID | 목표 | 성공 기준 |
|:--:|------|-----------|
| S5-T1 | Tacit Interview Agent MVP | `POST /tacit-interview/sessions` + fragment 추출 API 동작, 테스트 PASS |
| S5-H1 | Foundry-X Handoff 1건 | `POST /handoff/generate` → JSON manifest 반환, 1건 완료 확인 |

---

## §2. 아키텍처 결정

### Tacit Interview Agent 위치
- **svc-skill**에 통합 (별도 Worker 불필요 — PoC 범위)
- D1: `DB_SKILL` 내 새 테이블 2개 (`tacit_interview_sessions`, `tacit_spec_fragments`)
- LLM: `callLlmRouterWithMeta()` via `OPENROUTER_API_KEY` (haiku tier)

### Handoff Package
- **svc-skill**에 `POST /handoff/generate` 추가
- 기존 데이터 조합: B/T/Q spec (spec-gen) + AI-Ready score (scoring/ai-ready) + source manifest (D1 query)
- 출력: JSON manifest (ZIP 번들은 Phase 2 이관)

---

## §3. D1 Schema (Migration 0006)

```sql
CREATE TABLE IF NOT EXISTS tacit_interview_sessions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  sme_id TEXT NOT NULL,          -- masked
  department TEXT,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',  -- IN_PROGRESS | COMPLETED | ABANDONED
  fragment_count INTEGER NOT NULL DEFAULT 0,
  avg_confidence REAL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS tacit_spec_fragments (
  id TEXT PRIMARY KEY,           -- TIF-{DOMAIN}-{SEQ}
  session_id TEXT NOT NULL REFERENCES tacit_interview_sessions(id),
  category TEXT NOT NULL,        -- domain | process | exception | constraint
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  spec_content TEXT NOT NULL,
  spec_type TEXT NOT NULL,       -- business | technical | quality
  confidence REAL NOT NULL,
  policy_code TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tif_session ON tacit_spec_fragments(session_id);
CREATE INDEX IF NOT EXISTS idx_tif_confidence ON tacit_spec_fragments(confidence);
```

---

## §4. API 설계

### Tacit Interview

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/tacit-interview/sessions` | 세션 생성 |
| `POST` | `/tacit-interview/sessions/:id/fragments` | Q&A 쌍 제출 → Spec Fragment 추출 |
| `GET`  | `/tacit-interview/sessions/:id` | 세션 + fragments 조회 |
| `POST` | `/tacit-interview/sessions/:id/complete` | 세션 완료 |

### Handoff

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/handoff/generate` | Handoff manifest 생성 |

---

## §5. Worker 파일 매핑

| 파일 | 작업 |
|------|------|
| `infra/migrations/db-skill/0006_tacit_interview.sql` | D1 migration 추가 |
| `services/svc-skill/src/routes/tacit-interview.ts` | 인터뷰 API 핸들러 |
| `services/svc-skill/src/routes/tacit-interview.test.ts` | 테스트 |
| `services/svc-skill/src/routes/handoff.ts` | Handoff 생성기 |
| `services/svc-skill/src/routes/handoff.test.ts` | 테스트 |
| `services/svc-skill/src/index.ts` | 라우트 등록 |

---

## §6. 데이터 흐름

```
SME 인터뷰 입력 (Q&A)
  │
  ├─ PII 마스킹 (정규식 — phone/email/ssn)
  │
  ├─ LLM 추출 (haiku): specFragment.content + confidence + spec_type
  │
  ├─ D1 저장 (tacit_spec_fragments)
  │
  └─ 반환: SpecFragment JSON (TIF-{DOMAIN}-{SEQ})

Handoff Generate 입력 (orgId + skillId)
  │
  ├─ D1 조회: skills + AI-Ready score
  ├─ D1 조회: tacit_spec_fragments (해당 skill)
  ├─ R2 조회: .skill.json (B/T/Q spec)
  │
  └─ 반환: HandoffManifest JSON
```

---

## §7. 테스트 계약 (TDD Red Target)

```typescript
// tacit-interview.test.ts
describe("POST /tacit-interview/sessions", () => {
  it("creates a session and returns 201 with session id")
})

describe("POST /tacit-interview/sessions/:id/fragments", () => {
  it("extracts spec fragment and returns 201")
  it("returns 400 if question or answer is empty")
  it("returns 404 if session not found")
})

describe("GET /tacit-interview/sessions/:id", () => {
  it("returns session with fragments list")
})

// handoff.test.ts
describe("POST /handoff/generate", () => {
  it("generates handoff manifest for existing skill")
  it("returns 404 if skill not found")
})
```

---

## §8. Handoff 1건 — LPON pension-wd-001

Handoff 대상: LPON org 퇴직연금 도메인 첫 번째 Skill.
생성되는 manifest 필드:
- `reportId`, `orgId`, `skillId`, `generatedAt`
- `aiReadyScore` (existing scoring)
- `specSummary` (B/T/Q references)
- `tacitFragments` (interview fragments if any)
- `verdict`: APPROVED / DENIED / DRAFT
