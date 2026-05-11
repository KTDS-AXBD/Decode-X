# ES-SETTLE-003: 배치 부분 재처리 — 운영 가이드

**Related BL (F504 cross-ref)**: BL-033, BL-035

**Empty Slot ID**: ES-SETTLE-003
**대상**: SRE / 배치 담당자

---

## 배치 실패 후 재처리 절차

### 감지 조건
- `BatchFailed` 이벤트 발생
- `calculations.calc_status = 'failed'` 상태 유지 1시간 이상
- 모니터링 알림: PagerDuty

### 조치 절차

1. 실패 기간 및 미처리 건 확인
   ```sql
   SELECT c.calc_id, c.period_start, c.period_end, c.calc_status,
          COUNT(ct.calc_tx_id) FILTER (WHERE ct.processed = false) AS unprocessed_count,
          COUNT(ct.calc_tx_id) FILTER (WHERE ct.processed = true)  AS processed_count
   FROM calculations c
   JOIN calculation_transactions ct ON c.calc_id = ct.calc_id
   WHERE c.calc_status = 'failed'
   GROUP BY c.calc_id;
   ```

2. 배치 재실행 (자동)
   - `calc_status = 'failed'` → ES-SETTLE-001이 재실행 허용
   - 새 `batch_run_id` 생성 후 `processed = false` 건만 처리
   - 결과: 점진적 완료 후 `calc_status → 'completed'`

3. 재실행 후에도 실패 반복
   - 특정 `calc_tx_id` 건에서 반복 실패 → DB 데이터 이상 의심
   - 해당 건 `processed = true` 수동 마킹 후 스킵 + 감사 로그
   - 이후 수동 검증 및 보정

4. 인시던트 로그
   ```
   type: BATCH_PARTIAL_FAILURE
   calc_id: <값>
   processed: <완료수>/<전체수>
   resolution: auto_restart | manual_skip
   ```

---

## 예방 점검

- `calculation_transactions.processed` 기본값 `false` + NOT NULL 확인
- Worker 타임아웃 설정: 배치 Workers `cpu_limit` 30초 권장 (건별 커밋으로 재시작 안전)
- 장기 `running` 상태 알림: 2시간 이상 → `PagerDuty`

---

## SLA
- 배치 실패 감지 후 재시작: 자동 (15분 이내)
- 수동 개입 필요 시: 2시간 이내
