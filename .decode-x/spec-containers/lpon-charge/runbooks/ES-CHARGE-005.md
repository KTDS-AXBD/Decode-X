# ES-CHARGE-005: 명절/이벤트 기간 충전 한도 증량 — 운영 가이드

**Empty Slot ID**: ES-CHARGE-005
**대상**: 운영팀 / 관리자

---

## 이벤트 한도 등록 절차

### 이벤트 기간 전 (최소 1영업일 전)

1. 이벤트 정보 준비
   - 이벤트명 (예: `2026 추석 이벤트`)
   - 기간: 시작일시 ~ 종료일시 (ISO8601, KST)
   - 증량 한도: 기본 한도 대비 최대 3배 이내 권장

2. 관리자 UI 또는 D1 직접 등록
   ```sql
   INSERT INTO charge_event_limits
     (event_id, event_type, event_name, start_at, end_at,
      base_limit, event_limit, status, created_by, created_at)
   VALUES
     ('EVT-2026-CHUSEOK-001', 'HOLIDAY', '2026 추석 이벤트',
      '2026-09-26T00:00:00+09:00', '2026-09-28T23:59:59+09:00',
      1000000, 3000000, 'ACTIVE', 'admin@ktds.co.kr', datetime('now'));
   ```

3. 등록 확인
   ```sql
   SELECT event_id, event_name, start_at, end_at, event_limit, status
   FROM charge_event_limits
   WHERE event_id = 'EVT-2026-CHUSEOK-001';
   ```

---

## 이벤트 종료 후 확인 절차

1. 이벤트 상태 자동 만료 확인 (시스템 자동 처리)
   ```sql
   -- 현재 활성 이벤트 조회 (없으면 정상)
   SELECT event_id, event_name, end_at
   FROM charge_event_limits
   WHERE status = 'ACTIVE'
     AND datetime(end_at) >= datetime('now');
   ```

2. 이벤트 종료 후 한도 적용 모니터링 (24시간)
   - 종료 직후 고객 충전 요청이 기본 한도로 처리되는지 확인

---

## 이벤트 한도 오등록 시 조치

```sql
-- 상태 비활성화 (즉시 효력 상실)
UPDATE charge_event_limits
   SET status = 'CANCELLED'
 WHERE event_id = '<event_id>';
```

---

## 이벤트 적용 감사 조회

```sql
-- 이벤트 적용 건 조회
SELECT userId, amount, appliedEventId, chargedAt
FROM chargeEventLog
WHERE appliedEventId = '<event_id>'
ORDER BY chargedAt;
```

---

## SLA
- 이벤트 등록: 시작일 최소 1영업일 전
- 오등록 수정: 발견 즉시 (30분 이내)
- 이벤트 종료 후 원복 확인: 2시간 이내
