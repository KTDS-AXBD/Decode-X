# ES-CHARGE-005: 명절/이벤트 기간 충전 한도 일시 증량 정책

**Empty Slot ID**: ES-CHARGE-005
**유형**: E1 (Surge Handling)
**우선순위**: High
**Sprint**: 3 (Fill 완성)
**발견 근거**: 암묵적 운영 관행 추정 — 명절 전 운영팀 수동 한도 조정 이력, 규칙화 없음

---

## 빈 슬롯 설명

충전 한도(일일 최대 충전 금액)는 고정값으로 관리되나,
명절/이벤트 기간에는 운영팀이 수동으로 임시 증량하는 관행이 존재한다.
이 증량 정책이 시스템에 등록되지 않아 매번 수작업이 필요하고,
기간 종료 후 원복 누락 위험이 있다.

**위험**: 이벤트 기간 종료 후 증량 한도가 원복되지 않으면 한도 초과 손실 발생.

---

## 규칙 정의

### condition (When)
사용자가 충전을 요청할 때, 시스템이 적용 가능한 이벤트 한도를 조회한다.

### criteria (If)
`charge_event_limits` 테이블에서 현재 시각이 포함되는 활성 이벤트 조회:
- `status = 'ACTIVE'`
- `start_at ≤ NOW() ≤ end_at`
- 이벤트 타입: `HOLIDAY` / `PROMOTION` / `EMERGENCY`
- 조회 결과: `eventLimit` (증량 한도), `baseLimit` (기본 한도)

### outcome (Then)
- **활성 이벤트 있음**: 요청 금액이 `eventLimit` 이내이면 허용 + `chargeEventLog` 기록
- **활성 이벤트 없음**: 기본 `baseLimit` 적용

### exception (Else)
- 이벤트 기간이 중첩될 경우: 가장 높은 한도 적용 (`MAX(eventLimit)`)
- 이벤트 종료 시 자동 만료 (시스템이 `NOW() > end_at` 조건으로 자동 배제)
- 관리자 등록 필수 — 미등록 기간은 기본 한도 적용 (수동 조정 불가)

---

## 구현 힌트

```sql
-- charge_event_limits 테이블 (D1)
CREATE TABLE IF NOT EXISTS charge_event_limits (
  event_id    TEXT PRIMARY KEY,
  event_type  TEXT NOT NULL,  -- HOLIDAY | PROMOTION | EMERGENCY
  event_name  TEXT NOT NULL,
  start_at    TEXT NOT NULL,  -- ISO8601
  end_at      TEXT NOT NULL,
  base_limit  INTEGER NOT NULL,
  event_limit INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 활성 이벤트 조회
SELECT MAX(event_limit) AS applicable_limit
  FROM charge_event_limits
 WHERE status = 'ACTIVE'
   AND datetime(start_at) <= datetime('now')
   AND datetime(end_at)   >= datetime('now');
```

- 관리자 등록 UI: 이벤트명·기간·증량한도 3필드 입력
- 한도 단위: 원(KRW), 최소 단위 1,000원
- 이중 적용 방지: `CHECK (event_limit > base_limit)` 제약
- 감사 로그: `chargeEventLog` 테이블에 적용 건별 기록 (이벤트 ID + 사용자 ID + 금액)
