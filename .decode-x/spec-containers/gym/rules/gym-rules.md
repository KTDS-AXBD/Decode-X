# Spec Container — GYM-001 (헬스장 매장 합성 도메인)

**Skill ID**: GYM-001
**Domain**: Gym (헬스장 매장 산업 — 회원정원/PT한도/회원등록atomic/멤버십상태전환/만료멤버십배치/트레이너정산atomic)
**Source**: SYNTHETIC — 세션 295 F488, withRuleId 재사용 46번째 도메인 PoC (Veterinary 다음 산업, 35번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (GY-001 ~ GY-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| GY-001 | 회원 등록 요청 시 | `branch.member_count < capacity` (UPPERCASE fallback MAX_GYM_CAPACITY) | 등록 허용 + branch.member_count 증가 | `E422-GYM-CAPACITY-EXCEEDED` (지점 정원 초과) |
| GY-002 | PT 세션 사용 요청 시 | `membership.pt_used < ptLimit` (var-vs-var, `limit` keyword 매칭) | PT 허용 + pt_used 증가 | `E422-PT-LIMIT-EXCEEDED` (PT 한도 초과) |
| GY-003 | 신규 회원 등록 atomic 요청 시 | `lockers.status = 'available'` | atomic: members INSERT + lockers UPDATE + member_payments INSERT | `E404-LOCKER` |
| GY-004 | 멤버십 상태 전환 (active → paused → expired → cancelled) | 허용 매트릭스 충족 | `memberships.status` UPDATE | `E404-MEMBERSHIP`, `E409-MEMBERSHIP` |
| GY-005 | 만료 멤버십 일괄 처리 | `memberships.status = 'active'` AND `expires_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| GY-006 | 트레이너 정산 요청 시 | `pt_sessions.status = 'completed'` | atomic: trainer_billing_records INSERT + trainer_payouts INSERT + trainer_billing_records UPDATE | `E404-COMPLETED-PT-SESSION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `branches` | member_count 증가 (GY-001) | registerGymMember |
| `memberships` | INSERT (GY-001), pt_used 증가 (GY-002), status 갱신 (GY-004), batch expired (GY-005) | registerGymMember / applyPtLimit / transitionMembershipStatus / markExpiredMembershipBatch |
| `members` | INSERT (GY-003) | registerMemberWithLocker |
| `lockers` | status='occupied' (GY-003) | registerMemberWithLocker |
| `member_payments` | INSERT (GY-003) | registerMemberWithLocker |
| `trainer_billing_records` | INSERT + status='settled' (GY-006) | processTrainerBilling |
| `trainer_payouts` | INSERT (GY-006) | processTrainerBilling |

---

## 임계값 / 상수

- `MAX_GYM_CAPACITY = 300` (GY-001 헬스장 지점 회원 정원 기본 한도, 명)
- `ptLimit = memberships.pt_limit` (GY-002 멤버십 등급별 PT 세션 한도)

---

## 상태 머신

```
memberships: active → paused (GY-004 transition)
memberships: paused → active (GY-004 transition)
memberships: active → expired (GY-005 batch)
memberships: expired → cancelled (GY-004 transition)

lockers: available → occupied (GY-003 atomic)
lockers: occupied → available (만료 시 자동 회수)

trainer_billing_records: pending → calculated → settled (GY-006 atomic)
pt_sessions: scheduled → in_progress → completed → billed
```

---

## 의존 함수 (gym.ts)

| BL | 함수 | detector |
|----|------|----------|
| GY-001 | `registerGymMember` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| GY-002 | `applyPtLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| GY-003 | `registerMemberWithLocker` | AtomicTransaction (`db.transaction(...)`) |
| GY-004 | `transitionMembershipStatus` | StatusTransition (matrix) |
| GY-005 | `markExpiredMembershipBatch` | StatusTransition (batch) |
| GY-006 | `processTrainerBilling` | AtomicTransaction (`db.transaction(...)`) |
