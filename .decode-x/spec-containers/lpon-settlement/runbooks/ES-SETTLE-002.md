# ES-SETTLE-002: 정산수수료 반영 기준 — 운영 가이드

**Related BL (F504 cross-ref)**: BL-036

**Empty Slot ID**: ES-SETTLE-002
**대상**: 운영팀 관리자 / 재무담당자

---

## 수수료 기준 변경 절차

### 수수료 반영 여부(fee_reflected) 변경

1. 변경 전 현재 값 확인
   ```sql
   SELECT calc_id, period_start, fee_reflected, fee_rate
   FROM calculations
   WHERE calc_status = 'pending'
   ORDER BY period_start;
   ```

2. 변경 적용 (관리자 권한 필수)
   ```sql
   UPDATE calculations
   SET fee_reflected = 'Y'   -- 또는 'N'
   WHERE period_start = '2026-05-01'
     AND calc_status IN ('pending', 'failed');
   ```
   ⚠️ `completed` 건은 재계산 필요 시 별도 절차 (아래 참조)

3. 변경 이력 기록 (감사 로그)
   ```
   audit_type: FEE_REFLECTED_CHANGE
   changed_by: <관리자 ID>
   from: 'N'
   to: 'Y'
   period: 2026-05-01 ~ 2026-05-31
   reason: <변경 사유>
   ```

---

## 기존 완료 건 재계산 절차

수수료 기준 변경 후 이미 `completed` 처리된 기간 재산출 필요 시:

1. 해당 기간 `calc_status` 리셋 (관리자 승인 필수)
   ```sql
   -- 주의: 재계산 전 기존 settlement_summaries 백업 권장
   UPDATE calculations SET calc_status = 'failed' WHERE calc_id = '<id>';
   UPDATE calculation_transactions SET processed = false WHERE calc_id = '<id>';
   ```

2. 배치 재실행 → ES-SETTLE-001 + ES-SETTLE-003 경로 진행

3. 재산출 결과와 기존 결과 차이 확인 + 가맹점 재통보

---

## INVALID_FEE_FLAG 에러 대응

- 배치 로그에서 `INVALID_FEE_FLAG` 건 목록 확인
- `fee_reflected = NULL or 이외` 건 수동 `'Y'` 또는 `'N'` 설정
- 해당 건만 수동 재처리 또는 배치 재실행

---

## SLA
- 수수료 기준 변경: 배치 실행 전(월 초) 완료
- 재계산: 영업일 3일 이내
