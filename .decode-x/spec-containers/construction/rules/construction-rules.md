# Spec Container — CONSTRUCTION-001 (건설 산업 합성 도메인)

**Skill ID**: CONSTRUCTION-001
**Domain**: Construction (건설 산업 — 입찰한도/보유금한도/변경atomic/프로젝트상태전환/마일스톤배치/안전검사atomic)
**Source**: SYNTHETIC — Sprint 301 F467, withRuleId 재사용 31번째 도메인 PoC (Agriculture 다음 산업, 20번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (CN-001 ~ CN-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| CN-001 | 입찰 제출 시 | `bidAmount < MAX_BID_AMOUNT_LIMIT` (UPPERCASE 상수, 1,000,000,000 KRW) AND 프로젝트 status='bidding' | 입찰 허용 + bids INSERT | `E422-BID-LIMIT` (입찰 한도 초과) |
| CN-002 | 보유금 계산 시 | `retentionRate <= retentionRateLimit` (var-vs-var, `limit` keyword 매칭) | 보유금 허용 + 기록 | `E422-RETENTION-EXCEEDED` (보유금 비율 한도 초과) |
| CN-003 | 변경 청구 처리 시 | `project.status = 'in_progress'` | atomic: `change_orders` INSERT + `projects.contract_value` 갱신 + `change_order_approvals` INSERT | `E404-PROJECT`, `E409-PROJECT` |
| CN-004 | 프로젝트 상태 전환 (bidding → awarded → in_progress → completed → closed) | 허용 매트릭스 충족 | `projects.status` UPDATE + 타임스탬프 기록 | `E404-PROJECT`, `E409-PROJECT` |
| CN-005 | 마일스톤 일괄 완료 처리 (배치) | `milestones.completed = 0` AND `due_date <= dueDateCutoff` | `milestones.completed=1, status='completed'` 일괄 UPDATE | 대상 없으면 markedCount=0 |
| CN-006 | 안전 검사 처리 시 | `project.status = 'in_progress'` | atomic: `safety_inspections` INSERT + `correction_orders` INSERT(실패 시) + `projects.last_inspection_*` UPDATE | `E404-PROJECT`, `E409-PROJECT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `projects` | status 전환 / awarded_at / started_at / completed_at / closed_at / contract_value / last_inspection_* (CN-001/CN-003/CN-004/CN-006) | submitBid / processChangeOrder / transitionProjectStatus / processSafetyInspection |
| `bids` | INSERT (CN-001) | submitBid |
| `payment_retentions` | INSERT (CN-002) | computePaymentRetention |
| `change_orders` | INSERT (CN-003) | processChangeOrder |
| `change_order_approvals` | INSERT (CN-003) | processChangeOrder |
| `milestones` | completed=1 / status='completed' (CN-005) | markMilestoneCompletion |
| `safety_inspections` | INSERT (CN-006) | processSafetyInspection |
| `correction_orders` | INSERT 조건부 (CN-006 실패 시) | processSafetyInspection |

---

## 임계값 / 상수

- `MAX_BID_AMOUNT_LIMIT = 1_000_000_000` (CN-001 최대 입찰 한도, KRW)
- `retentionRateLimit = 0.10/0.07/0.05` (CN-002 계약 규모별 최대 보유금 비율 — small/medium/large)

---

## 상태 머신

```
projects: bidding → awarded (CN-004 transition)
projects: awarded → in_progress (CN-004 transition)
projects: in_progress → completed (CN-004 transition)
projects: completed → closed (CN-004 transition)

milestones: completed=0 → completed=1 / status='completed' (CN-005 batch)

change_orders: [created] — CN-003 atomic 생성 (status='approved')
change_order_approvals: [created] — CN-003 atomic 생성 (불변)

safety_inspections: [created] — CN-006 atomic 생성 (passed/failed)
correction_orders: [created] — CN-006 atomic 생성 (실패 시만, 불변)
```

---

## 권한

- **submitBid**: 시공사 / 입찰관리 SYSTEM
- **computePaymentRetention**: 발주처 재무팀 / 대금정산 SYSTEM
- **processChangeOrder**: 현장감독 / 변경관리 SYSTEM
- **transitionProjectStatus**: 프로젝트관리자 / 프로젝트관리 SYSTEM
- **markMilestoneCompletion**: 마일스톤관리 SYSTEM (배치)
- **processSafetyInspection**: 안전검사원 / 안전관리 SYSTEM

---

## 관련 문서

- `rules/CN-001.md` ~ `rules/CN-006.md` — 개별 BL detail
- `runbooks/CN-001.md` ~ `runbooks/CN-006.md` — operational runbooks
- `tests/CN-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/construction.ts` — 합성 source
