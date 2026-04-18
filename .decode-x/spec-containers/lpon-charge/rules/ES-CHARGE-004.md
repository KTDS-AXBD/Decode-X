# ES-CHARGE-004: 자동충전 중복 실행 방지 규칙 (분산 락)

**Empty Slot ID**: ES-CHARGE-004
**유형**: E4 (Exception Handling)
**우선순위**: High
**Sprint**: 3 (Fill 완성)
**발견 근거**: BL-008 "중복 충전 방지" 언급만 존재, 분산 환경 락 메커니즘 미정의

---

## 빈 슬롯 설명

BL-008은 "자동충전 중복 방지"를 명시하나, 스케줄러가 분산 환경(복수 Worker 인스턴스)에서
동시 실행될 때의 락 획득·해제·만료 메커니즘이 정의되어 있지 않다.

**위험**: 동일 jobId + targetDate 조합이 복수 Worker에서 동시 처리 → 이중 자동충전 발생.

---

## 규칙 정의

### condition (When)
자동충전 스케줄러가 동일 `(jobId, targetDate)` 조합에 대해 실행을 시도할 때.

### criteria (If)
`auto_charge_locks` 테이블에서 해당 `(jobId, targetDate)` 락 상태 확인:
- `status = 'LOCKED'` 이고 `lockedAt > NOW() - TTL(30분)` → 락 보유 중 (다른 인스턴스 처리 중)
- `status = 'LOCKED'` 이고 `lockedAt ≤ NOW() - TTL(30분)` → 락 만료 (스테일 락)
- `status` 없음 또는 `'UNLOCKED'` → 락 없음 (실행 가능)

### outcome (Then)
- **락 없음 / 만료**: `UPDATE ... SET status='LOCKED', lockedAt=NOW(), instanceId=:instanceId WHERE status != 'LOCKED' OR lockedAt ≤ NOW()-TTL` (원자적 UPDATE, 0 rows affected 시 경쟁 패배 → SKIP)
- **락 획득 성공**: 자동충전 실행 → 완료 후 `status='UNLOCKED'` 해제
- **락 보유 중**: SKIP + 로그 기록 (`AUTO_CHARGE_SKIP_LOCKED`)

### exception (Else)
- 실행 도중 Worker 크래시 → TTL 30분 후 스테일 락 자동 만료 → 다음 스케줄 실행 시 재처리
- SKIP된 건은 `auto_charge_skip_log`에 기록 (모니터링 알림 대상)

---

## 구현 힌트

```sql
-- auto_charge_locks 테이블 (D1)
CREATE TABLE IF NOT EXISTS auto_charge_locks (
  job_id      TEXT NOT NULL,
  target_date TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'UNLOCKED',
  locked_at   TEXT,
  instance_id TEXT,
  PRIMARY KEY (job_id, target_date)
);

-- 원자적 락 획득 (경쟁 안전)
UPDATE auto_charge_locks
   SET status = 'LOCKED',
       locked_at = datetime('now'),
       instance_id = :instanceId
 WHERE job_id = :jobId
   AND target_date = :targetDate
   AND (status = 'UNLOCKED'
        OR datetime(locked_at) <= datetime('now', '-30 minutes'));

-- 완료 후 락 해제
UPDATE auto_charge_locks
   SET status = 'UNLOCKED', locked_at = NULL, instance_id = NULL
 WHERE job_id = :jobId AND target_date = :targetDate AND instance_id = :instanceId;
```

- Cloudflare Workers는 인스턴스 격리 → D1의 단일 쓰기 직렬화 보장
- TTL=30분: 자동충전 최대 소요시간 기준 (BL-008 암묵적 SLA)
- `instanceId`: `crypto.randomUUID()` 로 Worker 기동 시 생성
