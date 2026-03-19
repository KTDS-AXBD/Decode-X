# 기능 정의서 — LPON 온누리상품권

> **도메인**: 온누리상품권 (LPON)
> **범위**: 충전 / 결제 / 환불 / 가맹점 / 정산 / 알림
> **참조**: [01-business-logic.md](./01-business-logic.md) (BL), [02-data-model.md](./02-data-model.md) (TABLE), [05-api.md](./05-api.md) (API)

---

## FN-001: 상품권 충전

- 관련 BL: BL-001 ~ BL-008
- 관련 API: API-010
- 관련 테이블: charge_transactions, vouchers, withdrawal_transactions

### 입력

| 필드 | 타입 | 필수 | 검증 규칙 | 설명 |
|------|------|:----:|-----------|------|
| voucher_id | TEXT | Y | UUID, 존재 확인 | 충전 대상 상품권 ID |
| amount | INTEGER | Y | > 0, 충전한도 이내 | 충전 금액 (원) |
| withdrawal_account_id | TEXT | Y | 등록된 출금계좌 | 출금 계좌 ID |

### 처리 플로우

1. voucher_id 유효성 검사 → 없으면 E404
2. 충전 가능 금액 한도 확인 (BL-005/BL-006) → 초과 시 E422
3. 출금계좌 잔액 확인 (BL-001) → 부족 시 E422
4. `withdrawal_transactions` INSERT (status='PENDING')
5. 외부 출금 API 호출
   - 성공 (BL-002): `withdrawal_transactions.status='COMPLETED'`
   - 실패 (BL-003): `withdrawal_transactions.status='FAILED'` → E500 반환
   - 타임아웃 (BL-004): `withdrawal_transactions.status='TIMEOUT'` → 5분 후 상태조회 스케줄링
6. 출금 성공 시: `charge_transactions` INSERT (status='COMPLETED')
7. `vouchers.balance += amount` 업데이트
8. 이벤트 발행: `ChargeCompleted`

### 출력

| 필드 | 타입 | 설명 |
|------|------|------|
| success | BOOLEAN | 처리 결과 |
| charge_id | TEXT | 생성된 충전 트랜잭션 ID |
| balance | INTEGER | 충전 후 잔액 |

### 에러 케이스

| 코드 | 조건 | HTTP | 응답 |
|------|------|:----:|------|
| E404 | voucher_id 없음 | 404 | { error: "Voucher not found" } |
| E422 | 충전 한도 초과 | 422 | { error: "Charge limit exceeded" } |
| E422 | 출금 계좌 잔액 부족 | 422 | { error: "Insufficient balance" } |
| E500 | 외부 출금 API 실패 | 500 | { error: "Withdrawal failed" } |

---

## FN-002: 충전 취소/환불

- 관련 BL: BL-009 ~ BL-012
- 관련 API: API-012 (POST /vouchers/{id}/charges/{chargeId}/cancel)
- 관련 테이블: charge_transactions, vouchers, withdrawal_transactions

### 입력

| 필드 | 타입 | 필수 | 검증 규칙 | 설명 |
|------|------|:----:|-----------|------|
| voucher_id | TEXT | Y | UUID | 상품권 ID |
| charge_id | TEXT | Y | UUID, 해당 voucher의 충전 건 | 취소 대상 충전 ID |

### 처리 플로우

1. charge_id 유효성 + 상태 확인 → COMPLETED가 아니면 E409
2. 출금취소 가능 여부 확인 (BL-009)
3. 외부 출금취소 API 호출 (BL-010)
   - 성공: `charge_transactions.status='CANCELED'`
   - 실패: E500 반환
4. `vouchers.balance -= charge_amount` 업데이트
5. 이벤트 발행: `ChargeCanceled`

### 출력

| 필드 | 타입 | 설명 |
|------|------|------|
| success | BOOLEAN | 처리 결과 |
| refunded_amount | INTEGER | 환불된 금액 |

### 에러 케이스

| 코드 | 조건 | HTTP | 응답 |
|------|------|:----:|------|
| E404 | charge_id 없음 | 404 | { error: "Charge not found" } |
| E409 | 이미 취소됨 또는 미완료 상태 | 409 | { error: "Charge not cancelable" } |
| E500 | 외부 출금취소 API 실패 | 500 | { error: "Withdrawal cancel failed" } |

---

## FN-003: 결제

- 관련 BL: BL-013 ~ BL-019
- 관련 API: API-020
- 관련 테이블: payments, vouchers, merchants

### 입력

| 필드 | 타입 | 필수 | 검증 규칙 | 설명 |
|------|------|:----:|-----------|------|
| voucher_id | TEXT | Y | UUID | 상품권 ID |
| merchant_id | TEXT | Y | UUID, 활성 가맹점 | 가맹점 ID |
| amount | INTEGER | Y | > 0, 잔액 이내 | 결제 금액 (원) |
| method | TEXT | Y | CARD / CASH / MIXED | 결제 수단 |

### 처리 플로우

1. voucher_id, merchant_id 유효성 검사
2. 가맹점 활성 상태 확인 → 비활성 시 E403
3. 상품권 잔액 확인 (BL-013) → 부족 시 E422
4. 결제수단별 분기:
   - CARD (BL-014): 카드사 승인 API 호출
   - CASH (BL-015): 현금 결제 처리
   - MIXED (BL-016): 카드+현금 각각 처리
5. `payments` INSERT (status='PAID')
6. `vouchers.balance -= amount` 업데이트
7. 결제금액 ≥ 50,000원 시 SMS 발송 (BL-019, FN-010 참조)
8. 이벤트 발행: `PaymentCompleted`

### 출력

| 필드 | 타입 | 설명 |
|------|------|------|
| success | BOOLEAN | 처리 결과 |
| payment_id | TEXT | 생성된 결제 ID |
| balance | INTEGER | 결제 후 잔액 |

### 에러 케이스

| 코드 | 조건 | HTTP | 응답 |
|------|------|:----:|------|
| E404 | voucher_id 또는 merchant_id 없음 | 404 | { error: "Not found" } |
| E403 | 가맹점 비활성 | 403 | { error: "Merchant inactive" } |
| E422 | 잔액 부족 | 422 | { error: "Insufficient voucher balance" } |
| E502 | 카드사 승인 실패 | 502 | { error: "Card authorization failed" } |

---

## FN-004: 결제 취소

- 관련 BL: BL-020 ~ BL-025
- 관련 API: API-023
- 관련 테이블: payments, cancel_transactions, vouchers

### 입력

| 필드 | 타입 | 필수 | 검증 규칙 | 설명 |
|------|------|:----:|-----------|------|
| payment_id | TEXT | Y | UUID, PAID 상태 | 취소 대상 결제 ID |
| cancel_type | TEXT | N | FULL / PARTIAL | 전체/부분 취소 (기본: FULL) |
| cancel_amount | INTEGER | N | cancel_type=PARTIAL 시 필수 | 부분 취소 금액 |

### 처리 플로우

1. payment_id 유효성 + 상태 확인 → PAID가 아니면 E409
2. 결제 정상 완료 확인 (BL-020) → 결제취소 가능 여부
3. 취소 유형 분기:
   - FULL (BL-021): 전액 취소
   - PARTIAL (BL-022): 부분 취소 (cancel_amount 검증)
4. 결제수단별 취소 처리:
   - CARD: 카드사 취소 API 호출 (BL-023)
   - CASH: 현금 환불 처리
   - MIXED: 카드분+현금분 각각 취소 (BL-024)
5. `cancel_transactions` INSERT
6. `payments.status = 'CANCELED'` (전체) 또는 `payments.canceled_amount += cancel_amount` (부분)
7. `vouchers.balance += cancel_amount` 업데이트
8. 이벤트 발행: `PaymentCanceled`

### 출력

| 필드 | 타입 | 설명 |
|------|------|------|
| success | BOOLEAN | 처리 결과 |
| cancel_id | TEXT | 취소 트랜잭션 ID |
| refunded_amount | INTEGER | 환불된 금액 |

### 에러 케이스

| 코드 | 조건 | HTTP | 응답 |
|------|------|:----:|------|
| E404 | payment_id 없음 | 404 | { error: "Payment not found" } |
| E409 | 이미 취소됨 | 409 | { error: "Already canceled" } |
| E422 | 부분취소 금액 > 결제금액 | 422 | { error: "Cancel amount exceeds payment" } |
| E502 | 카드사 취소 실패 | 502 | { error: "Card cancel failed" } |

---

## FN-005: 환불 신청

- 관련 BL: BL-026 ~ BL-032
- 관련 API: API-030
- 관련 테이블: refund_transactions, refund_accounts, vouchers

### 입력

| 필드 | 타입 | 필수 | 검증 규칙 | 설명 |
|------|------|:----:|-----------|------|
| voucher_id | TEXT | Y | UUID | 상품권 ID |
| refund_type | TEXT | Y | UNUSED_FULL / USED_BALANCE / EXPIRED | 환불 유형 |
| refund_account_id | TEXT | Y | 등록된 환불계좌 | 환불 계좌 ID |

### 처리 플로우

1. voucher_id 유효성 검사
2. 환불 유형별 자격 확인:
   - UNUSED_FULL (BL-026): 미사용 상품권 + 구매 후 7일 이내 → 전액 환불
   - USED_BALANCE (BL-027): 기사용 상품권 → 잔액 환불
   - EXPIRED (BL-028): 유효기간 만료 → 원칙적 환불 불가 (강성 민원 시 강제환불 BL-029)
3. 캐시백/할인보전 금액은 현금 환불 불가 (BL-030)
4. `refund_transactions` INSERT (status='PENDING')
5. ADMIN 승인 대기 (FN-006 참조)

### 출력

| 필드 | 타입 | 설명 |
|------|------|------|
| success | BOOLEAN | 접수 결과 |
| refund_id | TEXT | 환불 신청 ID |
| status | TEXT | PENDING (관리자 승인 대기) |

### 에러 케이스

| 코드 | 조건 | HTTP | 응답 |
|------|------|:----:|------|
| E404 | voucher_id 없음 | 404 | { error: "Voucher not found" } |
| E422 | 미사용 환불인데 7일 초과 | 422 | { error: "Full refund period expired" } |
| E422 | 유효기간 만료 상품권 | 422 | { error: "Expired voucher not refundable" } |
| E422 | 캐시백/할인보전 환불 시도 | 422 | { error: "Cashback not refundable" } |

---

## FN-006: 환불 승인/거절

- 관련 BL: BL-031, BL-032
- 관련 API: API-033 (승인), API-034 (거절)
- 관련 테이블: refund_transactions, deposit_transactions, vouchers

### 입력

| 필드 | 타입 | 필수 | 검증 규칙 | 설명 |
|------|------|:----:|-----------|------|
| refund_id | TEXT | Y | UUID, PENDING 상태 | 환불 신청 ID |
| action | TEXT | Y | APPROVE / REJECT | 승인/거절 |
| reject_reason | TEXT | N | action=REJECT 시 필수 | 거절 사유 |

### 처리 플로우 (APPROVE)

1. refund_id 유효성 + PENDING 상태 확인
2. 환불 계좌 유효성 확인 (BL-031)
   - 계좌 오류 시: 이용자에게 환불계좌 재등록 요청 (BL-032)
3. 입금 처리 API 호출
4. `deposit_transactions` INSERT (status='COMPLETED')
5. `refund_transactions.status = 'COMPLETED'`
6. `vouchers.balance = 0` (전액 환불 시) 또는 차감
7. 이벤트 발행: `RefundCompleted`

### 처리 플로우 (REJECT)

1. `refund_transactions.status = 'REJECTED'`, reject_reason 기록
2. 이벤트 발행: `RefundRejected`

---

## FN-007: 가맹점 등록/관리

- 관련 BL: BL-033 ~ BL-037
- 관련 API: API-040 ~ API-044
- 관련 테이블: merchants

### 입력 (등록)

| 필드 | 타입 | 필수 | 검증 규칙 | 설명 |
|------|------|:----:|-----------|------|
| name | TEXT | Y | 1~100자 | 가맹점명 |
| business_number | TEXT | Y | 사업자번호 형식 | 사업자등록번호 |
| region_code | TEXT | Y | 행정구역코드 | 지역 코드 |
| category | TEXT | Y | 업종 분류 코드 | 업종 |

### 처리 플로우

1. 사업자번호 중복 확인 → 중복 시 E409
2. `merchants` INSERT (status='PENDING')
3. ADMIN 승인 후 status='ACTIVE'
4. 가맹점 지역 검색 지원 (BL-033 ~ BL-036):
   - 지자체 단위, 시군구 단위, 읍면동 단위, 시장별 검색

---

## FN-008: 정산

- 관련 BL: BL-038 ~ BL-042
- 관련 API: API-050 ~ API-053
- 관련 테이블: calculations, calculation_transactions, settlement_summaries

### 처리 플로우

1. 정산 실행 (ADMIN, 배치):
   - 기간별 결제/취소 데이터 집계 (BL-038)
   - `calculations`, `calculation_transactions` 생성
   - 가맹점별 정산 금액 산출
2. 정산 확정 (BL-039): `settlement_summaries` INSERT
3. 가맹점에 정산 금액 지급
4. 일마감 승인 체계 (BL-041): 매일 자금 마감

---

## FN-009: 탈퇴 후 결제/매입 취소

- 관련 BL: BL-043
- 관련 API: 내부 프로세스
- 관련 테이블: payments, cancel_transactions

### 처리 플로우

1. 회원 탈퇴 후 결제 또는 매입 취소 발생 시
2. AP06 (지급형 상품권 조회/지급) API를 통해 취소 처리 (BL-043)
3. 관리자 수동 처리 필요 시 알림

---

## FN-010: 알림 발송

- 관련 BL: BL-044 ~ BL-047
- 관련 API: API-060 ~ API-062
- 관련 테이블: payment_notifications, scheduled_messages

### 처리 플로우

1. 결제금액 ≥ 50,000원 시 SMS 발송 (BL-044)
2. 충전 완료/실패 시 Push 알림 (BL-045)
3. 환불 승인/거절 시 알림 (BL-046)
4. 중복 알림 방지 옵션 제공 (BL-047)
5. 정책 발행일 전 담당자 LMS 알림

---

## 크로스 레퍼런스 매트릭스

| 기능 | BL 범위 | API | 주 테이블 |
|------|---------|-----|----------|
| FN-001 충전 | BL-001~008 | API-010 | charge_transactions, vouchers |
| FN-002 충전취소 | BL-009~012 | API-012 | charge_transactions, vouchers |
| FN-003 결제 | BL-013~019 | API-020 | payments, vouchers |
| FN-004 결제취소 | BL-020~025 | API-023 | payments, cancel_transactions |
| FN-005 환불신청 | BL-026~030 | API-030 | refund_transactions |
| FN-006 환불승인 | BL-031~032 | API-033/034 | refund_transactions, deposit_transactions |
| FN-007 가맹점 | BL-033~037 | API-040~044 | merchants |
| FN-008 정산 | BL-038~042 | API-050~053 | calculations, settlement_summaries |
| FN-009 탈퇴취소 | BL-043 | 내부 | payments |
| FN-010 알림 | BL-044~047 | API-060~062 | payment_notifications |
