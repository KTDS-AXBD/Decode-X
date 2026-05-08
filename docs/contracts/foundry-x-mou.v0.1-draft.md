---
code: AIF-DOC-foundry-x-mou-v0-1-draft
title: "Foundry-X ↔ Decode-X 통합 협력 MoU (초안 v0.1)"
version: 1.0
status: active
category: contracts
created: 2026-04-18
updated: 2026-04-18
author: Sinclair Seo
---

# Foundry-X ↔ Decode-X 통합 협력 MoU (초안 v0.1)

**문서 유형**: Memorandum of Understanding — 협력 계약 초안
**버전**: v0.1 (DRAFT — 초안, 협상 전)
**작성일**: 2026-04-18 (Phase 0 Day 1, 세션 207)
**작성자**: Sinclair (Decode-X Lead) + Claude
**상태**: 🔴 **DRAFT — 양 팀 협상 전, 구속력 없음**
**관련 문서**:
- Decode-X Phase 0 Kick-off: `docs/req-interview/decode-x-v1.2/phase-0-kickoff.md` §2.1 C1
- Decode-X PRD v1.3: `docs/req-interview/decode-x-v1.2/prd-v2.md` §13 Foundry-X 통합 전략
- Foundry-X 레포: [KTDS-AXBD/Foundry-X](https://github.com/KTDS-AXBD/Foundry-X) (Phase 46 Sprint 308 기준)

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
- `FX-PLUMB-OUT` 계약 포맷 준수

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

### 3.1 Primary Contract — `FX-PLUMB-OUT`
- **Foundry-X 관리 파일**: `Foundry-X/contracts/plumb-output-contract.md`
- **Decode-X 책임**: 해당 계약에 명시된 스키마로 컨테이너 출력
- **버전 고정**: 본 MoU 체결 시점의 **major 버전(v8 기준)** 고정 — 하위 호환성 보장
- **minor/patch 변경**: 양 팀 합의 없이 Foundry-X가 진행 가능 (Decode-X는 월간 Sync에서 통보받음)
- **major 변경**: 양 팀 서면 합의 필수 + 최소 **30일 전 사전 통지** + Decode-X 마이그레이션 기간 **90일 보장**

### 3.2 Secondary Contracts
- **MCP Streamable HTTP** (AIF-REQ-026): 619 tools 규모, meta-tool 3종(`foundry_policy_eval`, `foundry_skill_query`, `foundry_ontology_lookup`) 유지
- **AG-UI Protocol** (AIF-REQ-024): 22종 event 타입, `packages/types/src/ag-ui.ts` 정의
- **`SyncResult` 스키마**: Foundry-X 관리, Decode-X는 수신자 (Breaking change 시 major로 취급)

### 3.3 참조 매핑 (`foundry-x.yaml`)
- Decode-X 레포 `references/foundry-x.yaml`에 Foundry-X 축약 코드(`FX-PLUMB-OUT`, `FX-INDEX` 등) ↔ 커밋 SHA 매핑 관리
- 분기 동기화 미팅에서 매핑 재확인 (R13 Foundry-X 버전 스큐 방지)

---

## 4. 버전 정책 (Versioning Policy)

### 4.1 SemVer 준수
- 양 팀 모두 `vMAJOR.MINOR.PATCH` 준수
- Breaking change = MAJOR, Additive = MINOR, Bug fix = PATCH

### 4.2 본 MoU 체결 시점 Frozen Baseline
- **Foundry-X**: Phase 46 Sprint 308 기준 (커밋 SHA는 서명 시점 확정)
- **Decode-X**: Sprint 208 + v1.3 PRD 적용 시점 (prd-v2.md 커밋 SHA)
- `foundry-x.yaml` 에 양 baseline 기록

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
- T1: Foundry-X Plumb E2E 1건 녹색 (`SyncResult.status == "green"`) — 2026-05-01 목표
- AIF-REQ-026 Phase 1-3 MCP 통합 완료 상태 ✅ (기존)

### 6.2 Soft Dependencies (Phase 1 시작 이전)
- Decode-X v1.1 컨테이너 포맷이 Foundry-X가 소비 가능한지 샘플 Skill 1건 검증
- Tier-A 핵심 서비스 6종(예산/충전/구매/결제/환불/선물) 중 1종에 대해 E2E 파이프라인 녹색

### 6.3 No-Go Conditions (본 MoU 해지 사유)
- Foundry-X가 major 변경을 30일 사전 통지 없이 3회 이상 진행
- Decode-X가 `FX-PLUMB-OUT` 계약 위반 Skill 출력을 반복 (3회 이상)
- 양 팀 합의 없는 일방적 범위 변경

---

## 7. Drift 방지 메커니즘 (SSOT 규율)

### 7.1 단일 진실 소스 원칙
- **Spec**: Decode-X 레포 `spec/*.md` (Decode-X SSOT)
- **Code**: Foundry-X 레포 (생성 결과, `Foundry-X/apps/*`)
- **Decisions**: `decisions.jsonl` (양 팀 공유, append-only)
- **계약 스키마**: Foundry-X 레포 (Foundry-X SSOT)

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

> 🔴 **본 섹션은 Decode-X 측에서 제기하는 논점 초안이다. Foundry-X 팀과 협상 시 제거하거나 확정된 합의로 이관한다.**

- [ ] Q1: Plumb `FX-PLUMB-OUT` 현재 major 버전 확정 (v8 추정, Foundry-X PM 확인 필요)
- [ ] Q2: 월간 Sync Meeting 일정 6회 분 사전 확정 vs 유연 스케줄링
- [ ] Q3: `SyncResult` schema breaking change 시 "30일 통지 + 90일 마이그레이션" 기간이 현실적인가?
- [ ] Q4: AIF-REQ-026 Sprint 202 AgentResume state 복구 stub의 실구현 책임은 어느 팀?
- [ ] Q5: `foundry_ontology_lookup` meta-tool의 정확도·지연 SLA 수치
- [ ] Q6: 비상 커뮤니케이션 채널 (Slack? 이메일? 전화?) 고정
- [ ] Q7: No-Go Condition 3회 기준이 너무 관대한가? 아니면 적절한가?

---

## 문서 이력

- **v0.1 DRAFT (2026-04-18, 세션 207)**: Phase 0 Day 1 초안 생성 — prd-v2.md §13 + phase-0-kickoff.md §2.1 C1 기반. Open Questions 7건 제기. Foundry-X PM과 Week 1 중 협상 시작 예정 (Sinclair + Claude)
- **다음 갱신**: Foundry-X PM 첫 리뷰 반영 후 v0.2 — 2026-04-22 목표
