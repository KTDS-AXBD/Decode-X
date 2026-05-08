---
code: AIF-DOC-foundry-x-mou-v0-2-draft
title: "Foundry-X ↔ Decode-X 통합 협력 MoU (초안 v0.2)"
version: 1.0
status: active
category: contracts
created: 2026-04-18
updated: 2026-04-18
author: Sinclair Seo
---

# Foundry-X ↔ Decode-X 통합 협력 MoU (초안 v0.2)

**문서 유형**: Memorandum of Understanding — 협력 계약 초안
**버전**: v0.2 (DRAFT — 내부 사전 정리, 협상 전)
**작성일**: 2026-04-19 (Phase 0 Day 2, 세션 208)
**작성자**: Sinclair (Decode-X Lead) + Claude
**상태**: 🔴 **DRAFT — 양 팀 협상 전, 구속력 없음**
**선행 버전**: `docs/contracts/foundry-x-mou.v0.1-draft.md` (v0.1, 2026-04-18)
**관련 문서**:
- Decode-X Phase 0 Kick-off: `docs/req-interview/decode-x-v1.2/phase-0-kickoff.md` §2.1 C1
- Decode-X PRD v1.3: `docs/req-interview/decode-x-v1.2/prd-v2.md` §13 Foundry-X 통합 전략
- Foundry-X 레포: [KTDS-AXBD/Foundry-X](https://github.com/KTDS-AXBD/Foundry-X) (Sprint 289 기준, master)
- **Foundry-X 공식 계약 문서** (Q1 해소 근거): `Foundry-X/docs/specs/plumb-output-contract.md` (code `FX-SPEC-002`, v1.0, commit `e5c7260`, 2026-03-16)

---

## 0. 목적

본 MoU는 **Decode-X (Input Plane Producer)** 와 **Foundry-X (Process/Output Plane Orchestrator)** 간의 **역할 분담·인터페이스 계약·버전 정책·운영 리듬**을 공식화하기 위한 협력 합의서이다.

본 문서는 법적 구속력을 갖는 계약이 아니며, 양 팀의 작업 방식·의존성 관리·Drift 방지 원칙을 정의하는 **내부 운영 합의(Operational Agreement)**이다.

---

## 1. 당사자

| 당사자 | 대표자 | 역할 |
|--------|--------|------|
| **Decode-X 팀** | Decode-X Lead (Sinclair) | Input Plane — 레거시 자산 → AI-Ready Spec 생산 |
| **Foundry-X 팀** | Foundry-X PM (TBD) | Process/Output Plane — Spec → Working Site 실행·검증 |
| **상위 조직** | KT DS AXBD 본부장 | 양 팀 관할, 예산·자원·방향성 승인 |

**서명 예정일**: 2026-04-24 (Phase 0 Week 1 말)

---

## 2. 역할 분담 (Role Separation)

### 2.1 Decode-X의 책임 (Input Plane)
- 레거시 소스코드 + SI 산출물(요구사항·API·테이블·화면) 수집 및 구조화
- Spec 컨테이너 v1.1 ① Executable + ② Verifiable Layer 생산
- `rules/*.md` (EARS 포맷) + `tests/*.ts` + `traceability/*.jsonl` 완결성 보장
- Empty Slot(암묵지) 식별·HITL 인터뷰·`rules/` 반영
- AI-Ready 6기준 자체 채점 (passRate ≥ 0.75 이전 Foundry-X 투입 금지)
- **Plumb Output Contract (`FX-SPEC-002`)** 스키마 준수 — v0.2에서 계약 대상 명확화

### 2.2 Foundry-X의 책임 (Process/Output Plane)
- Spec 컨테이너 수신 → Working Site 자동 재현
- Plumb 엔진을 통한 `Spec ↔ Code ↔ Test` 3각 동기화
- SDD Triangle 검증 결과 `SyncResult` 반환 (green/yellow/red)
- Drift 감지 및 Decode-X로 역피드백
- 6-Agent 하네스 오케스트레이션 (spec-author / code-impl / test-runner / review / integrator / gatekeeper)

### 2.3 경계 원칙 (Non-overlapping Scope)
- Decode-X는 **코드를 생성하지 않는다** (Spec만 산출)
- Foundry-X는 **레거시 자산을 직접 파싱하지 않는다** (Spec만 소비)
- 공통 매개체는 **Git 저장소 + SPEC.md SSOT + Plumb `decisions.jsonl`**
- 경계 분쟁 발생 시 월간 Sync Meeting에서 조율, 합의 안 되면 본부장 에스컬레이션

---

## 3. 인터페이스 계약 (Interface Contract)

### 3.1 Primary Contract — Plumb Output Contract

> **v0.2 변경**: v0.1의 "FX-PLUMB-OUT / major 버전(v8 기준)" 표기를 계약 문서 실체 기준으로 정정. "v8"은 Foundry-X 전체 PRD(`FX-SPEC-PRD-V8_foundry-x.md`)의 버전이며, 실제 출력 계약의 자체 버전과 무관함이 확인됨.

| 항목 | 값 |
|------|-----|
| **계약 문서** | `Foundry-X/docs/specs/plumb-output-contract.md` |
| **계약 코드** | `FX-SPEC-002` |
| **고정 버전** | **v1.0** (frontmatter `version: 1.0`) |
| **system-version** | 0.2.0 |
| **Frozen baseline commit** | `e5c7260` (2026-03-16, 현재 유일한 revision) |
| **REQ 출처** | FX-REQ-013 (F13) |

**호환성 규칙** (계약 문서 §5 원문 인용):

| 변경 유형 | 호환성 | 합의 필요성 |
|-----------|:------:|:-----------:|
| 필드 추가 | ✅ 호환 (JSON.parse 무시) | 없음 — Foundry-X 단독 진행 가능 |
| 필드 제거 | ❌ 비호환 | **MAJOR 합의 필수** (30일 사전 통지 + 90일 마이그레이션) |
| 타입 변경 | ❌ 비호환 | **MAJOR 합의 필수** |
| 열거값 추가 (GapItem.type) | ⚠️ 부분 호환 | Decode-X 통보 대상 (Sync Meeting) |

**Decode-X 책임**: 본 MoU 체결 시점 계약(v1.0 @ `e5c7260`)에 명시된 SyncResult·GapItem·Decision·PlumbError 스키마로 컨테이너 출력.

### 3.2 Secondary Contracts
- **Plumb Error Contract**: `Foundry-X/docs/specs/plumb-error-contract.md` (`FX-SPEC-003`, 동시 관리). PlumbError 배열 호환성은 §3.1과 동일 규칙 적용
- **MCP Streamable HTTP** (AIF-REQ-026): meta-tool 3종(`foundry_policy_eval`, `foundry_skill_query`, `foundry_ontology_lookup`) 유지. 도구 개수는 SLA로 관리하지 않음
- **AG-UI Protocol** (AIF-REQ-024): 22종 event 타입, `packages/types/src/ag-ui.ts` 정의
- **`SyncResult` 스키마**: Plumb Output Contract §2.1에 내포. 독립 계약 문서 아님 (§3.1 규칙 적용)

### 3.3 참조 매핑 (`references/foundry-x.yaml`)
- Decode-X 레포에 `references/foundry-x.yaml` 신규 생성 예정 — 본 MoU 체결과 동시 착수
- 축약 코드(`FX-SPEC-002`, `FX-SPEC-003`, `FX-REQ-013` 등) ↔ Foundry-X 커밋 SHA 매핑
- 분기 동기화 미팅에서 매핑 재확인 (P0-R3 Foundry-X 버전 스큐 방지)

---

## 4. 버전 정책 (Versioning Policy)

### 4.1 SemVer 준수
- 양 팀 모두 `vMAJOR.MINOR.PATCH` 준수
- Breaking change = MAJOR, Additive = MINOR, Bug fix = PATCH

### 4.2 본 MoU 체결 시점 Frozen Baseline
- **Foundry-X Plumb Output Contract**: `FX-SPEC-002 v1.0` @ commit `e5c7260` (2026-03-16)
- **Foundry-X 레포 전체 baseline**: Sprint 289 시점 master HEAD (서명 시점 SHA 병기)
- **Foundry-X 제품 PRD**: `FX-SPEC-PRD-V8_foundry-x.md` v8 (별도 트랙, 본 MoU와 동기화 불필요 — 제품 방향성 참고용)
- **Decode-X**: Sprint 208 + v1.3 PRD (`prd-v2.md`, 2026-04-18 commit `18d023e` 시점)
- 위 baseline을 `references/foundry-x.yaml`에 기록

### 4.3 업그레이드 프로토콜
1. 주체 팀이 30일 전 Sync Meeting에서 변경 예고
2. 상대 팀이 영향도 분석 + 마이그레이션 계획 제출
3. Shadow 모드 병렬 운영 2주
4. Cut-over 날짜 합의
5. 사후 1주간 rollback 옵션 유지

---

## 5. 운영 리듬 (Operating Cadence)

### 5.1 정기 회의
| 주기 | 참석 | 의제 | 진행자 |
|------|------|------|--------|
| **월간 Sync Meeting** (6회/년, Phase 0~1 12주 동안 최소 3회) | Decode-X Lead + Foundry-X PM + 주요 엔지니어 | 버전 변경 예고, 계약 드리프트, Spec 품질 메트릭, 다음 달 계획 | 양 팀 교대 |
| 주간 상호 리뷰 (선택) | 양 팀 1명씩 | 블로커 해소, 즉시 질의 | 상시 |
| 분기 전략 리뷰 | 양 팀 Lead + 본부장 | 큰 방향성, GTM, 예산 | 본부장 |

### 5.2 비상 커뮤니케이션
- P1 인시던트 (파이프라인 중단): 4시간 내 양 팀 Lead 통보 + 24시간 내 복구 목표
- Plumb 계약 drift 감지: 당일 Sync 요청
- Foundry-X Major 변경 공지 누락: Decode-X가 escalation 가능

### 5.3 공유 산출물
- `/shared/sync-meeting-minutes/YYYY-MM.md` — 월간 회의록 (양 팀 레포에 동일 커밋)
- `/shared/contract-drift-log.md` — 계약 위반·조정 사례

---

## 6. 의존성 관리 (Dependency Management)

### 6.1 Hard Dependencies (Phase 0 Gate Blocker)
- T1: Foundry-X Plumb E2E 1건 녹색 (`SyncResult.success == true`) — 2026-05-01 목표
- AIF-REQ-026 Phase 1-3 MCP 통합 완료 상태 ✅ (기존)

### 6.2 Soft Dependencies (Phase 1 시작 이전)
- Decode-X v1.1 컨테이너 포맷이 Foundry-X가 소비 가능한지 샘플 Skill 1건 검증
- Tier-A 핵심 서비스 6종(예산/충전/구매/결제/환불/선물) 중 1종에 대해 E2E 파이프라인 녹색

### 6.3 No-Go Conditions (본 MoU 해지 사유)
- Foundry-X가 계약 문서 **MAJOR 변경**(필드 제거·타입 변경)을 30일 사전 통지 없이 3회 이상 진행
- Decode-X가 Plumb Output Contract v1.0 스키마 위반 Skill 출력을 반복 (3회 이상)
- 양 팀 합의 없는 일방적 범위 변경

---

## 7. Drift 방지 메커니즘 (SSOT 규율)

### 7.1 단일 진실 소스 원칙
- **Spec**: Decode-X 레포 `spec/*.md` (Decode-X SSOT)
- **Code**: Foundry-X 레포 (생성 결과, `Foundry-X/apps/*`)
- **Decisions**: `decisions.jsonl` (양 팀 공유, append-only — 계약 문서 §4 규칙 준수)
- **계약 스키마**: Foundry-X 레포 `docs/specs/plumb-*-contract.md` (Foundry-X SSOT)

### 7.2 양방향 트레이스 링크
- Spec 조항 ↔ CPG 노드 ↔ SCIP 심볼 (Decode-X 관리)
- Code 심볼 ↔ Test ↔ Spec (Foundry-X 관리 via Plumb)
- 링크 끊김 시 즉시 알림 (양 팀 CI에 Drift Detection)

### 7.3 정합성 검증 주기
- **주간**: 양 팀 CI가 `SyncResult` 대시보드 자동 생성
- **월간**: Sync Meeting에서 drift 총량 리뷰
- **분기**: `/ax:req-integrity` 유사 도구로 3-way 검증 (SPEC ↔ Code ↔ Test)

---

## 8. 상호 제공 (Mutual Deliverables)

### 8.1 Decode-X → Foundry-X 제공
- Spec 컨테이너 (batch 단위, 도메인별 tier)
- Empty Slot 채움 결과 + Provenance 링크
- Runbook(`rules/*-runbook.md`) — HITL DA 세션 산출
- Quality Metrics (passRate, coverage, Input Completeness)

### 8.2 Foundry-X → Decode-X 제공
- `SyncResult` 피드백 (green/yellow/red + 상세 사유)
- Drift Report (Spec 변경 요청)
- Agent Resume state (AIF-REQ-026 Sprint 202)
- GTM 성공 사례 피드백 (Decode-X가 어떤 Spec이 재사용되는지 학습)

---

## 9. 본 MoU의 변경·종료

### 9.1 변경
- 양 팀 Lead 서면 동의로 개정 (v0.1 → v0.2 ...)
- MINOR 변경(문구 명확화)은 이메일 합의로 충분
- MAJOR 변경(역할 재편, 계약 포맷)은 본부장 서명 필요

### 9.2 종료
- 양 팀 합의 하 30일 전 통보로 종료
- No-Go Condition 발생 시 즉시 종료 + 에스컬레이션
- 종료 시 각 팀이 각자의 SSOT 유지, 공유 산출물은 양측 보관 90일

---

## 10. 서명란 (Placeholder)

| 역할 | 이름 | 날짜 | 서명 |
|------|------|------|------|
| Decode-X Lead | Sinclair | | |
| Foundry-X PM | TBD | | |
| KT DS AXBD 본부장 | TBD | | |

---

## 11. 부록 — Open Questions (협상 시 해소)

> 🔴 **본 섹션은 Decode-X 측에서 제기하는 논점이다. 해소된 항목은 상태를 명시하고 근거를 병기한다.**

- [x] **Q1 해소** (2026-04-19, Day 2): Plumb Output Contract 실체 확인 — `FX-SPEC-002 v1.0` @ commit `e5c7260`. "v8"은 Foundry-X 제품 PRD의 별도 트랙으로 계약 버전과 혼동 금지. §3.1 및 §4.2에 반영. **협상 시 Foundry-X PM과 최종 확인 1건만 남음** (향후 마이너 릴리스 계획이 있는지 여부)
- [ ] Q2: 월간 Sync Meeting 일정 6회 분 사전 확정 vs 유연 스케줄링
- [ ] Q3: `SyncResult` schema breaking change 시 "30일 통지 + 90일 마이그레이션" 기간이 현실적인가? (계약 문서 §5에는 버전 호환 정책만 있고 마이그레이션 기간 미정 — MoU에서 신설 조항)
- [ ] Q4: AIF-REQ-026 Sprint 202 AgentResume state 복구 stub의 실구현 책임은 어느 팀?
- [ ] Q5: `foundry_ontology_lookup` meta-tool의 정확도·지연 SLA 수치
- [ ] Q6: 비상 커뮤니케이션 채널 (Slack? 이메일? 전화?) 고정
- [ ] Q7: No-Go Condition 3회 기준이 너무 관대한가? 아니면 적절한가?

---

## 문서 이력

- **v0.1 DRAFT (2026-04-18, 세션 207)**: Phase 0 Day 1 초안 생성. Open Questions 7건 제기. ~~major 버전 v8 기준 고정~~ (v0.2에서 정정)
- **v0.2 DRAFT (2026-04-19, 세션 208)**: Phase 0 Day 2 내부 정리판. **Q1 해소** — Foundry-X 레포 조사로 Plumb Output Contract 실체(`FX-SPEC-002 v1.0`, commit `e5c7260`) 확인. §3.1 Primary Contract 상세화(호환성 규칙 원문 인용), §4.2 Frozen Baseline에 계약 버전 + commit SHA 병기, §6.3 No-Go Condition을 계약 문서 MAJOR 변경 정의에 맞춰 정정, §3.2에 Plumb Error Contract(`FX-SPEC-003`) 병행 관리 추가. Foundry-X PM 미지정 상태로 Q2~Q7은 협상 대기
- **다음 갱신**: Foundry-X PM 지정 후 Q2~Q7 협상 반영 v0.3 — 2026-04-22 목표 (Week 1 Day 5)
