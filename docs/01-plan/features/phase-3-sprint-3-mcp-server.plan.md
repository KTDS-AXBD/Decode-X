# Phase 3 Sprint 3 — MCP Server Worker

> **Summary**: Cloudflare Worker 기반 Streamable HTTP MCP Server 구현. Claude Desktop에서 퇴직연금 Skill을 tool로 직접 사용 가능하게 함.
>
> **Project**: RES AI Foundry
> **Version**: v0.8 (Phase 3 Sprint 3)
> **Author**: Sinclair Seo
> **Date**: 2026-03-04
> **Status**: Draft
> **Parent Plan**: [phase-3-mcp-openapi.plan.md](phase-3-mcp-openapi.plan.md)
> **Design Doc**: [phase-3-mcp-openapi.design.md](../02-design/features/phase-3-mcp-openapi.design.md) §2.2, §4.5

---

## 0. Key Decisions

| 항목 | 결정 | 근거 |
|------|------|------|
| **구현 방식** | `createMcpHandler()` stateless | DO 불필요 — MCP Server는 svc-skill proxy, 세션 상태 없음 |
| **SDK** | `@modelcontextprotocol/sdk` (official TS SDK) | `WebStandardStreamableHTTPServerTransport` + `McpServer` 클래스 활용 |
| **프로토콜** | `2025-03-26` Streamable HTTP | MCP 최신 표준, 단일 POST /mcp 엔드포인트 |
| **Skill 모드** | Multi-skill 동적 로딩 | URL path 파라미터로 skill 선택: `POST /mcp/:skillId` |
| **인증** | Bearer token (INTERNAL_API_SECRET) | Claude Desktop의 `headers` 설정으로 전달 |
| **배포 대상** | 12번째 독립 Worker (`svc-mcp-server`) | 기존 svc-skill 내부 구현 대비 관심사 분리 |

---

## 1. Architecture

```
Claude Desktop / Claude Code / MCP Client
     │  POST (JSON-RPC 2.0)
     ▼
svc-mcp-server (Cloudflare Worker)
  POST /mcp/:skillId
     │
     ├─ initialize → protocolVersion + capabilities + serverInfo
     │
     ├─ tools/list
     │   └─ svc-skill (Service Binding) GET /skills/:id/mcp
     │       → .skill.json → policies → MCP tools[]
     │
     ├─ tools/call
     │   └─ svc-skill (Service Binding) POST /skills/:id/evaluate
     │       → LLM 평가 → { result, confidence, reasoning }
     │       → MCP content[] 포맷 변환
     │
     └─ Auth: Bearer token (X-Internal-Secret 헤더로 변환)
```

### 1.1 Service Bindings

| Binding | Target | Purpose |
|---------|--------|---------|
| `SVC_SKILL` | svc-skill | tools/list (MCP adapter) + tools/call (evaluate) |

### 1.2 Transport

- **Streamable HTTP**: 요청마다 새 `WebStandardStreamableHTTPServerTransport` + `McpServer` 인스턴스 생성 (stateless, SDK 1.26.0+ 보안 패치 준수)
- **세션 관리**: stateless이므로 `sessionIdGenerator: undefined` (세션 없음)
- `Mcp-Session-Id` 헤더는 선택적으로 수용하되 상태를 보관하지 않음

---

## 2. Tasks

### T1. Worker 스캐폴드 (`svc-mcp-server/`)

**파일:**
- `services/svc-mcp-server/package.json`
- `services/svc-mcp-server/tsconfig.json`
- `services/svc-mcp-server/wrangler.toml`
- `services/svc-mcp-server/src/env.ts`
- `services/svc-mcp-server/src/index.ts`

**내용:**
- 모노레포 workspace에 등록 (`package.json` workspaces)
- `wrangler.toml`: service binding (SVC_SKILL), `nodejs_compat` flag
- `env.ts`: `Env` 인터페이스 (SVC_SKILL: Fetcher, INTERNAL_API_SECRET: string)
- `index.ts`: `/health` + `/mcp/:skillId` 라우팅 (POST/GET/DELETE)

### T2. MCP Server 핵심 구현

**파일:**
- `services/svc-mcp-server/src/mcp-server.ts`

**내용:**
- `createSkillMcpServer(skillId: string, env: Env)` 팩토리 함수
- `McpServer` 인스턴스 생성 + tool 동적 등록
- `tools/list`: svc-skill `GET /skills/:id/mcp` 호출 → policy 목록 → `server.tool()` 등록
- `tools/call`: svc-skill `POST /skills/:id/evaluate` 위임 → MCP content[] 포맷 반환

### T3. Streamable HTTP Transport 연결

**파일:**
- `services/svc-mcp-server/src/index.ts` (T1의 라우팅에 통합)

**내용:**
- `POST /mcp/:skillId` → `WebStandardStreamableHTTPServerTransport` 생성 → `server.connect(transport)` → `transport.handleRequest(request)`
- CORS 헤더 설정 (Claude Desktop은 로컬 실행이므로 불필요할 수 있지만, 범용성 위해)
- Bearer token 검증 미들웨어

### T4. 테스트

**파일:**
- `services/svc-mcp-server/src/__tests__/mcp-server.test.ts`
- `services/svc-mcp-server/src/__tests__/handler.test.ts`

**내용:**
- Unit: tool 등록 로직, MCP 응답 포맷 변환
- Handler: initialize → tools/list → tools/call JSON-RPC 시나리오
- Edge case: 존재하지 않는 skill, 빈 policy, LLM 실패

### T5. 배포 + Claude Desktop 연동 테스트

**내용:**
- `wrangler deploy` (staging → production)
- Secrets 설정: `INTERNAL_API_SECRET`
- Claude Desktop `claude_desktop_config.json` 설정
- E2E: initialize → tools/list → tools/call 전체 플로우 검증
- 문서: README에 Claude Desktop 연동 가이드

---

## 3. Dependencies

```
T1 (scaffold)
 └─ T2 (MCP server core) ─┐
                            ├─ T4 (tests)
 T3 (transport integration)─┘
                            └─ T5 (deploy + E2E)
```

- T1 → T2, T3 (병렬 가능)
- T2 + T3 → T4
- T4 → T5

---

## 4. Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| `@modelcontextprotocol/sdk` Cloudflare Workers 호환성 | 빌드 실패 | Raw 구현 fallback (JSON-RPC 직접 파싱) |
| Claude Desktop Streamable HTTP 미지원 (구버전) | 연결 불가 | `mcp-remote` npm 브릿지 사용 |
| Service binding 지연 | tools/call 타임아웃 | svc-skill은 내부 네트워크, 지연 최소 |
| 대량 policy Skill (100+) | tools/list 응답 크기 | 페이지네이션 또는 상위 N개 제한 |

---

## 5. Success Criteria

- [ ] `POST /mcp/:skillId` — MCP JSON-RPC 2.0 프로토콜 정상 응답
- [ ] `initialize` → `tools/list` → `tools/call` 전체 플로우 E2E 통과
- [ ] Claude Desktop에서 퇴직연금 Skill tool 목록 표시 + 정책 평가 실행
- [ ] typecheck + lint + 테스트 전체 통과
- [ ] Staging + Production 배포 완료

---

## 6. Estimated Effort

| Task | 예상 |
|------|------|
| T1 Worker 스캐폴드 | 작음 |
| T2 MCP Server 핵심 | 중간 |
| T3 Transport 연결 | 작음 |
| T4 테스트 | 중간 |
| T5 배포 + E2E | 작음 |
