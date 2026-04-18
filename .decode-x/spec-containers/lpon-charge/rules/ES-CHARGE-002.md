# ES-CHARGE-002: 출금 타임아웃 후 에스컬레이션 기준

**Empty Slot ID**: ES-CHARGE-002
**유형**: E4 (Exception Handling)
**우선순위**: High
**Sprint**: 2 (Fill 완성)

---

## 빈 슬롯 설명

BL-004("출금 타임아웃 시 5분 후 상태조회")는 재조회 메커니즘만 정의하며,
조회 후에도 불확실할 때의 에스컬레이션 조건(시간 기준, 금액 기준, 담당자)이 없다.

**위험**: 타임아웃 → 상태조회도 불명확 → 수기 처리 기준 없음 → 방치 또는 중복 처리.

---

## 규칙 정의

### condition (When)
출금 API 응답 대기 시간 > 30초 (타임아웃) 후,
5분 뒤 상태조회 API 결과가 여전히 `UNKNOWN` 또는 `PENDING`인 경우.

### criteria (If)
| 기준 | 조건 |
|------|------|
| 고액 즉시 에스컬레이션 | 충전 요청 금액 ≥ 500,000원 |
| 소액 재시도 후 에스컬레이션 | 충전 요청 금액 < 500,000원 + 2회 재시도(각 5분 간격) 후에도 불확실 |

### outcome (Then)
에스컬레이션 티켓 생성:
- `incident_type`: `WITHDRAWAL_TIMEOUT_UNRESOLVED`
- `priority`: 고액=P1(1시간 SLA) / 소액=P2(4시간 SLA)
- `assignee`: 운영팀 온콜 담당자
- `chargeId` + `withdrawalRequestId` + `amount` + `timeoutAt` 포함

### exception (Else)
상태조회 결과가 `SUCCESS`이면 → BL-002 정상 완료 경로 진행.
상태조회 결과가 `FAILED`이면 → BL-003 실패 처리 경로 진행.

---

## 타임라인

```
T+0s   출금 요청
T+30s  타임아웃 감지
T+5m   1차 상태조회
  └─ SUCCESS → 완료 처리
  └─ FAILED  → 실패 처리
  └─ UNKNOWN/PENDING →
      ├─ 금액 ≥ 50만: 즉시 에스컬레이션 (P1)
      └─ 금액 < 50만: 2차 재시도 (T+10m)
          └─ 여전히 불확실 → 에스컬레이션 (P2)
```
