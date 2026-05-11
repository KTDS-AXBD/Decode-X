# ES-SETTLE-001: 정산 배치 멱등성 — 운영 가이드

**Related BL (F504 cross-ref)**: BL-033, BL-034

**Empty Slot ID**: ES-SETTLE-001
**대상**: 운영팀 / SRE / 배치 담당자

---

## 중복 배치 실행 감지 및 차단

### 감지 조건
- 모니터링: `BatchSkipped` 이벤트 과다 발생
- 정산 금액 이상 (2배 집계 등)

### 조치 절차

1. 현재 배치 상태 확인
   ```sql
   SELECT calc_id, period_start, period_end, calc_status, batch_run_id, created_at
   FROM calculations
   WHERE period_start BETWEEN '2026-04-01' AND '2026-04-30'
   ORDER BY created_at DESC
   LIMIT 5;
   ```

2. `calc_status = 'running'` 장기 유지 → 배치 데드락 의심
   - 10분 이상 running 유지 시: 실행 중인 Worker 확인
   - 데드락 확인 후 `calc_status → 'failed'` 수동 리셋

3. `calc_status = 'completed'` 상태에서 재계산 필요 시
   - 관리자 권한: `UPDATE calculations SET calc_status = 'failed' WHERE calc_id = '<id>';`
   - 이후 배치 재실행 → ES-SETTLE-003 재처리 흐름 적용

4. 인시던트 로그
   ```
   type: BATCH_IDEMPOTENCY_VIOLATION or BATCH_STUCK
   calc_id: <값>
   period: <start~end>
   resolution: manual_reset | wait_and_verify
   ```

---

## 배치 스케줄 점검

- BATCH_004 기본 스케줄: 매월 1일 01:00 (월별 정산)
- 중복 방지: 동일 기간 `calculations` UNIQUE 인덱스 보장
- 알림: 3회 대기 초과 시 PagerDuty + 담당자 LMS

---

## SLA
- 배치 중복 감지 후 차단: 즉시 (코드 레벨)
- 데드락 수동 해제: 30분 이내
