# ES-CHARGE-004: 자동충전 중복 실행 방지 — 운영 가이드

**Empty Slot ID**: ES-CHARGE-004
**대상**: 운영팀 / 백엔드 개발자

---

## 이중 자동충전 발생 시 수동 조치

### 감지 조건
- `auto_charge_skip_log`에 동일 `jobId + targetDate`로 SKIP 기록 없는데 이중 충전 발생
- 고객센터 자동충전 이중 출금 민원
- D1 `auto_charge_locks`에 동일 키로 2건 이상의 `LOCKED` 기록

### 조치 절차

1. 락 상태 조회
   ```sql
   SELECT job_id, target_date, status, locked_at, instance_id
   FROM auto_charge_locks
   WHERE job_id = '<민원_jobId>'
     AND target_date = '<대상_날짜>';
   ```

2. 중복 자동충전 건 조회
   ```sql
   SELECT chargeId, chargeRequestId, amount, status, createdAt
   FROM charge_transactions
   WHERE jobId = '<민원_jobId>'
     AND targetDate = '<대상_날짜>'
   ORDER BY createdAt;
   ```

3. 이중 완료 건 확인 시 → 후발 건 취소
   ```
   POST /money/chargeCancel
   { "chargeId": "<후발_chargeId>", "reason": "DUPLICATE_AUTO_CHARGE" }
   ```

4. 락 수동 해제 (스테일 락 잔존 시)
   ```sql
   UPDATE auto_charge_locks
      SET status = 'UNLOCKED', locked_at = NULL, instance_id = NULL
    WHERE job_id = '<jobId>' AND target_date = '<date>';
   ```

5. 인시던트 기록
   ```
   incident_id: INC-{YYYYMMDD}-AUTO-{SEQ}
   type: DUPLICATE_AUTO_CHARGE
   jobId: <값>
   chargeIds: [<원본>, <중복>]
   resolution: <취소|정상>
   ```

---

## 예방 조치 (개발팀)

- `auto_charge_locks` 테이블 PRIMARY KEY 유니크 제약 적용
- TTL 모니터링 알림: `locked_at > 60분` → 알림 발송
- 스케줄러 중복 실행 방지: Cloudflare Cron Trigger는 단일 실행 보장, Custom Scheduler는 락 필수

---

## SLA
- 이중 자동충전 감지 후 취소: 4시간 이내
- 잔액 조정 완료: 24시간 이내
- 락 수동 해제: 1시간 이내
