---
sprint: 1
task: B-5
title: Fill Seed — ES-CHARGE-001 (충전 멱등성)
created: 2026-04-19
ref: PRD §2.5.5
---

# Sprint 1 B-5 — Fill Seed: ES-CHARGE-001

**대상**: ES-CHARGE-001 (충전 중복 요청 방지 — 멱등성)
**Sprint 2 Fill 작업의 시드**

---

## 1. 빈 슬롯 설명 (규칙 부재)

현재 BL-002("출금 완료 시 충전 확정")는 **정상 흐름만** 정의하고,
동일 요청이 재전송(retry)되었을 때의 중복 방지 규칙이 없다.

**위험**: 클라이언트 재시도 + 네트워크 중복 배달 시 이중 충전 발생.

---

## 2. rules/ 초안 (Fill 조건)

```markdown
# ES-CHARGE-001: 충전 멱등성 규칙

## condition (When)
동일한 `chargeRequestId`로 충전 요청이 2회 이상 수신된 경우

## criteria (If)
`charge_transactions` 테이블에 동일 `chargeRequestId`가 이미 존재하면서
status IN ('processing', 'completed')

## outcome (Then)
기존 트랜잭션의 결과를 그대로 반환한다.
새 출금 요청을 발생시키지 않는다.

## exception (Else)
`chargeRequestId`가 없거나 status = 'failed'이면 신규 처리한다.
```

---

## 3. tests/ 계약 초안

```yaml
scenarios:
  - id: TC-IDEM-001
    name: 동일 requestId 재전송 시 기존 결과 반환
    given:
      chargeRequestId: "req-abc-001"
      existingStatus: "completed"
    when: charge_requested_again
    then:
      - newWithdrawalCreated: false
      - responseChargeId: "existing-charge-id"

  - id: TC-IDEM-002
    name: 실패한 요청 재전송 시 신규 처리
    given:
      chargeRequestId: "req-abc-002"
      existingStatus: "failed"
    when: charge_requested_again
    then:
      - newWithdrawalCreated: true
```

---

## 4. runbooks/ 운영 가이드 초안

```markdown
# 이중 충전 발생 시 수동 조치

1. `charge_transactions`에서 동일 `chargeRequestId` 건 조회
2. 두 건 모두 completed 상태이면 → 후발 건 취소 (`/money/chargeCancel`)
3. 이용자 잔액 차이 확인 → 불일치 시 수기 조정
4. 인시던트 로그 기록 (incident_id + 양쪽 charge_id)
```

---

## 5. Sprint 2 Fill 작업 분량 예측

| 항목 | 예상 소요 |
|------|----------|
| rules/ 완성 | 15분 |
| tests/contract/ 완성 (4 시나리오) | 20분 |
| runbooks/ 완성 | 10분 |
| Plumb 재검증 | 5분 |
| **합계** | **50분** |
