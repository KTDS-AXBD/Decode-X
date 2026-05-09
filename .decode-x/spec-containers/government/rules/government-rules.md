# Spec Container — GOVERNMENT-001 (공공/정부 산업 합성 도메인)

**Skill ID**: GOVERNMENT-001
**Domain**: Government (공공/정부 산업 — 허가신청한도/누진수수료/결재승인atomic/신청상태전환/연체가산배치/문서검증atomic)
**Source**: SYNTHETIC — Sprint 295 F461, withRuleId 재사용 25번째 도메인 PoC (Energy 다음 산업, 14번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (GV-001 ~ GV-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| GV-001 | 허가 신청 요청 시 | `currentCount < MAX_ANNUAL_PERMIT_COUNT` AND 회계연도 기준 확인 | `permit_applications` INSERT + 카운트 증가 | `E422-PERMIT-LIMIT` (연간 한도 초과) |
| GV-002 | 누진 수수료 구간 계산 시 | `feeAmount <= feeTierLimit` (구간 탐색) | 해당 구간 요율 반환 + `permit_applications.status='reviewing'` | `E404-FEE-TIER` |
| GV-003 | 결재 워크플로우 처리 시 | `permit.status = 'reviewing'` | atomic: `approval_workflows` INSERT + `permit_applications.status='approved'` + `permit_applications.status='issued'` | `E404-PERMIT`, `E409-PERMIT` |
| GV-004 | 신청 상태 전환 (submitted → reviewing → approved → issued) | 허용 매트릭스 충족 | `permit_applications.status` UPDATE | `E404-APPLICATION`, `E409-APPLICATION` |
| GV-005 | 연체 가산금 일괄 처리 (배치) | `overdue_penalties.status = 'pending'` AND 대상 신청자 확인 | `overdue_penalties.status='penalized'` 일괄 UPDATE + 가산금 반영 | 대상 없으면 penalizedCount=0 |
| GV-006 | 문서 검증 처리 시 | `document.status = 'pending'` | atomic: `documents.status='validated'` + `documents.status='certified'` + `documents.status='issued'` | `E404-DOCUMENT`, `E409-DOCUMENT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `permit_applications` | INSERT (GV-001) / status='reviewing' (GV-002) / status 전환 (GV-003/GV-004) | submitPermitApplication / computeFeeTier / processApproval / transitionApplicationStatus |
| `fee_tiers` | 조회 (GV-002) | computeFeeTier |
| `approval_workflows` | INSERT (GV-003) | processApproval |
| `overdue_penalties` | status='penalized' + 가산금 (GV-005) | applyOverduePenalty |
| `documents` | status='validated'/'certified'/'issued' (GV-006) | validateDocument |

---

## 임계값 / 상수

- `MAX_ANNUAL_PERMIT_COUNT = 10` (GV-001 연간 최대 허가 신청 건수)
- `MAX_OVERDUE_PENALTY_RATE = 0.05` (GV-005 연체 가산 비율 5%)

---

## 상태 머신

```
permit_applications: [submitPermitApplication] → submitted
permit_applications: submitted → reviewing (GV-004 / GV-002 자동)
permit_applications: reviewing → approved (GV-003 atomic)
permit_applications: approved → issued (GV-003 atomic)
permit_applications: reviewing → rejected (GV-004 transition)
permit_applications: submitted → expired (GV-004 transition)

overdue_penalties: [created] → pending
overdue_penalties: pending → penalized (GV-005 batch)
overdue_penalties: pending → waived (manual)

documents: [created] → pending
documents: pending → validated (GV-006 atomic step 1)
documents: validated → certified (GV-006 atomic step 2)
documents: certified → issued (GV-006 atomic step 3)
```

---

## 권한

- **submitPermitApplication**: 민원인 / 공무원 SYSTEM
- **computeFeeTier**: 수수료 SYSTEM
- **processApproval**: 결재 SYSTEM (워크플로우)
- **transitionApplicationStatus**: 심사 SYSTEM
- **applyOverduePenalty**: 징수 SYSTEM (배치)
- **validateDocument**: 문서 SYSTEM

---

## 관련 문서

- `rules/GV-001.md` ~ `rules/GV-006.md` — 개별 BL detail
- `runbooks/GV-001.md` ~ `runbooks/GV-006.md` — operational runbooks
- `tests/GV-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/government.ts` — 합성 source
