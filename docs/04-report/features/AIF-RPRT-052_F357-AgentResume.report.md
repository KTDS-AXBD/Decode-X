---
id: AIF-RPRT-052
type: report
feature: F357
sprint: 252
status: done
created: "2026-05-04"
match_rate: 98
test_result: pass
cost_usd: 0
duration_min: 40
author: autopilot
---

# F357 AgentResume 실구현 — Sprint 252 완료 보고서

## 요약

Sprint 202부터 stub으로 남아있던 `handleAgentResume`을 완전히 실구현했다.
KV 기반 세션 상태 저장 + one-shot resume + `nextStep` 응답 구조를 완성하여
Foundry-X Orchestrator HITL 루프의 기술적 기반을 마련했다.

| 지표 | 결과 |
|------|------|
| Match Rate | **98%** ✅ |
| typecheck | 14/14 PASS |
| lint | Exit 0 |
| test | 64/64 PASS (신규 7케이스 포함) |
| 비용 | $0 (LLM 미사용) |
| 소요 | ~40분 |

## DoD 달성

- ✅ `agent.ts:164-181` stub 코드 0줄 → 실구현 교체
- ✅ KV mock round-trip 테스트 PASS (`handleAgentResume` 200 + `nextStep`)
- ✅ 토큰 미존재 → 404 테스트 PASS
- ✅ `/agent/resume` HTTP 200 with `nextStep` 필드
- ✅ typecheck + lint + test PASS
- ✅ PDCA 4종 완료 (AIF-PLAN-052 + AIF-DSGN-052 + AIF-ANLS-052 + 본 보고서)
- ✅ Match Rate 98% ≥ 90%

## 핵심 구현 결정

### 1. KV vs DO — KV 채택

HITL 세션은 one-shot(요청 1회 → resume 1회 → 폐기) 패턴이므로 DO의 강한 일관성이 불필요하다.
KV `expirationTtl: 86400`으로 24h 자동 만료 + `delete()` 즉시 폐기로 메모리 최소화.

### 2. 점진적 HITL 흐름 (handleAgentRun 업데이트)

기존: `RUN_STARTED → TOOL_CALL_START → TOOL_CALL_END → STATE_SYNC → RUN_FINISHED`
변경: `RUN_STARTED → TOOL_CALL_START → TOOL_CALL_END → STATE_SYNC → CUSTOM/HITL_REQUEST`

`RUN_FINISHED`를 `HITL_REQUEST`로 대체하여 실제 HITL 워크플로우를 데모 수준에서 구현.
resume 후 `nextStep`이 워크플로우 종료 또는 다음 tool-call을 표현.

### 3. Degraded Mode

`env.AGENT_SESSIONS?` optional 처리로 KV namespace 미바인딩 환경에서도 Worker 정상 동작.
이 덕분에 실 KV namespace ID 없이도 CI deploy가 통과한다.

## PDCA 산출물

| 문서 | ID | 경로 |
|------|-----|------|
| Plan | AIF-PLAN-052 | `docs/01-plan/features/F357.plan.md` |
| Design | AIF-DSGN-052 | `docs/02-design/features/F357.design.md` |
| Analysis | AIF-ANLS-052 | `docs/03-analysis/features/AIF-ANLS-052_F357-AgentResume.analysis.md` |
| Report | AIF-RPRT-052 | `docs/04-report/features/AIF-RPRT-052_F357-AgentResume.report.md` |

## 변경 파일

| 파일 | 유형 | 주요 변경 |
|------|------|---------|
| `services/svc-mcp-server/src/env.ts` | 수정 | `AGENT_SESSIONS?: KVNamespace` 추가 |
| `services/svc-mcp-server/src/routes/agent.ts` | 수정 | handleAgentRun(env) + HITL 흐름 + handleAgentResume 실구현 |
| `services/svc-mcp-server/src/routes/agent.test.ts` | 신규 | KV mock 7케이스 |
| `services/svc-mcp-server/src/index.ts` | 수정 | env 전달 |
| `services/svc-mcp-server/wrangler.toml` | 수정 | KV binding 주석 블록 |

## 잔여 후속 과제

| 항목 | 우선순위 | 비고 |
|------|---------|------|
| KV namespace 실 ID 등록 (`wrangler kv:namespace create AGENT_SESSIONS`) | P2 | 배포 전 필요, 3 env (default/staging/production) |
| Production smoke (`POST /agent/resume` round-trip) | P2 | KV ID 등록 후 수행 가능 |
| P95 2s SLA 측정 | P2 | Wrangler tail 기반, KV latency ~5ms 예상 |
| Foundry-X 실 통합 (mock → 실 endpoint) | P3 | 계약 확정 후 후속 Sprint |

## 교훈

- **exactOptionalPropertyTypes 함정**: optional property에 `undefined` 직접 할당 불가. `if (kv !== undefined) env.AGENT_SESSIONS = kv` 패턴으로 우회.
- **SSE 순서 안전성**: KV.put → HITL_REQUEST emit 순서를 지키면 race condition 없음 (SSE 순차 전송 보장).
- **one-shot 삭제가 테스트 핵심**: 두 번째 resume → 404 케이스로 세션 1회성 보장을 명시적으로 검증.
