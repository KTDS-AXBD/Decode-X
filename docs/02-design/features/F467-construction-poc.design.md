---
id: AIF-DSGN-099
sprint: 301
feature: F467
title: Construction 31번째 도메인 설계 (건설 산업, 20번째 신규 산업)
status: active
created: 2026-05-10
related: [AIF-PLAN-099]
---

# F467 Design — AIF-DSGN-099

## §1 개요

Sprint 300 (F466 Agriculture) 동일 패턴으로 Construction(건설) 합성 도메인을 신규 추가한다.
31번째 도메인, 20번째 신규 산업 (round number 마일스톤).

## §2 BL 정의 (6종)

| BL | 함수 | Detector | 상세 |
|----|------|----------|------|
| CN-001 | `submitBid()` | Threshold (Path A, UPPERCASE) | `bidAmount < MAX_BID_AMOUNT_LIMIT` — 입찰 한도 검증 |
| CN-002 | `computePaymentRetention()` | Threshold (Path B, var-vs-var) | `retentionRate > retentionRateLimit` — `limit` keyword 매칭 |
| CN-003 | `processChangeOrder()` | Atomic | change order + 단가 재계산 + 승인 트랜잭션 |
| CN-004 | `transitionProjectStatus()` | Status | bidding → awarded → in_progress → completed → closed |
| CN-005 | `markMilestoneCompletion()` | Status | 마일스톤 일괄 갱신 (batch) |
| CN-006 | `processSafetyInspection()` | Atomic | 안전 검사 + 시정 명령 + 통과 처리 트랜잭션 |

## §3 파일 매핑

### 생성 파일

| 파일 | 역할 |
|------|------|
| `반제품-스펙/.../src/domain/construction.ts` | 도메인 소스 (~280 lines) |
| `.decode-x/spec-containers/construction/rules/construction-rules.md` | 메인 rules.md |
| `.decode-x/spec-containers/construction/rules/CN-001.md` | BL-001 detail |
| `.decode-x/spec-containers/construction/rules/CN-002.md` | BL-002 detail |
| `.decode-x/spec-containers/construction/rules/CN-003.md` | BL-003 detail |
| `.decode-x/spec-containers/construction/rules/CN-004.md` | BL-004 detail |
| `.decode-x/spec-containers/construction/rules/CN-005.md` | BL-005 detail |
| `.decode-x/spec-containers/construction/rules/CN-006.md` | BL-006 detail |
| `.decode-x/spec-containers/construction/runbooks/CN-001.md` | runbook-001 |
| `.decode-x/spec-containers/construction/runbooks/CN-002.md` | runbook-002 |
| `.decode-x/spec-containers/construction/runbooks/CN-003.md` | runbook-003 |
| `.decode-x/spec-containers/construction/runbooks/CN-004.md` | runbook-004 |
| `.decode-x/spec-containers/construction/runbooks/CN-005.md` | runbook-005 |
| `.decode-x/spec-containers/construction/runbooks/CN-006.md` | runbook-006 |
| `.decode-x/spec-containers/construction/tests/CN-001.yaml` | test scenarios |
| `.decode-x/spec-containers/construction/provenance.yaml` | provenance |

### 수정 파일

| 파일 | 변경 |
|------|------|
| `scripts/divergence/domain-source-map.ts` | DOMAIN_MAP 31번째 entry 추가 |
| `packages/utils/src/divergence/bl-detector.ts` | CN-001~006 registry 추가 |
| `packages/utils/src/divergence/rules-parser.ts` | CN prefix BL_ID_PATTERN 추가 |
| `packages/utils/test/bl-detector.test.ts` | CN-001~006 PRESENCE 단위 테스트 6건 |

## §4 상태 머신

```
projects: bidding → awarded → in_progress → completed → closed
milestones: [created] graded=0 → completed=1 (batch AG-005 패턴)
change_orders: [created] → approved (processChangeOrder atomic)
safety_inspections: [created] → passed (processSafetyInspection atomic)
```

## §5 DoD 체크리스트

- [ ] construction.ts ~280 lines, 6 함수 + ConstructionError
- [ ] spec-container/construction 15 sub-files
- [ ] DOMAIN_MAP 31번째 entry
- [ ] parser regex CN prefix (longer match first 입증)
- [ ] REGISTRY CN-001~006
- [ ] utils 260+6 = 266 PASS
- [ ] typecheck PASS (--force)
- [ ] detect-bl 31 containers, CN 0 ABSENCE
- [ ] write-provenance --apply 0 changes
- [ ] 20 산업 연속 0 ABSENCE
