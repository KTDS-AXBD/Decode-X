# 비즈니스 로직 명세 — LPON 온누리상품권

## 도메인: 온누리상품권 (LPON)
## 핵심 비즈니스: 전자상품권 충전, 결제, 환불/취소, 정산, 알림

> **출처**: AI Foundry 역공학 추출물 (db-policy approved policies)
> **정책 수**: 44건 → BL-001 ~ BL-047 (유사 정책 통합 + 시나리오 분리로 47개 BL 생성)
> **변환 기준**: Design Doc §3.1 (condition→When, criteria→If, outcome→Then)

---

## 시나리오 1: 충전 (Top-up)

> 이용자 또는 회사가 출금계좌에서 자금을 인출하여 온누리상품권 잔액을 충전하는 프로세스.
> 외부 머니플랫폼 API를 경유하며, 출금→충전의 2단계 트랜잭션 구조.

### 전제 조건 (Preconditions)
- 이용자 또는 회사 계정이 활성 상태
- 출금계좌가 등록되어 있음
- 충전 가능 금액 한도가 설정되어 있음

### 비즈니스 룰

| ID | 조건 (When) | 판단 기준 (If) | 처리 (Then) | 예외 (Else) |
|----|-------------|---------------|-------------|-------------|
| BL-001 | 충전 요청 시 출금계좌에서 출금을 시도하는 경우 | 출금계좌 잔액 ≥ 충전 요청 금액 | 출금 처리를 진행한다 | 잔액 부족 시 출금 실패 에러를 반환한다 |
| BL-002 | 출금이 정상적으로 완료된 경우 | 출금 프로세스가 에러 없이 종료됨 | 충전 완료 처리한다 | [미정의] |
| BL-003 | 출금이 실패한 경우 | 출금 프로세스에서 오류 발생 | 에러를 반환하고 충전 프로세스를 중단한다 | [미정의] |
| BL-004 | 출금 요청 후 응답이 타임아웃된 경우 | 출금 요청 후 응답 대기 시간 > 타임아웃 기준 | 5분 후 출금상태조회 API를 호출하여 처리 결과를 확인하고, 결과에 따라 후속 처리를 진행한다 | [미정의] |
| BL-005 | 이용자가 충전을 요청하는 경우 | 충전 요청 금액 ≤ 충전 가능 금액 한도 | 충전 확정 처리를 진행한다 | 한도 초과 시 충전 거부 |
| BL-006 | 회사가 충전을 요청하는 경우 | 충전 요청 금액 ≤ 회사별 충전 한도 | 충전 원장 처리를 진행한다 | 한도 초과 시 충전 거부 |
| BL-007 | 이용자가 포인트 충전을 요청한 경우 | 포인트 충전 요청이 유효하고 한도 내 | 포인트 충전 확정 처리한다 | 유효하지 않거나 한도 초과 시 거부 |
| BL-008 | 자동충전 금액이 설정될 때 | 잔액 조건(blceCondAmt), 일자 조건(ymdCondAmt), 복합 조건(condSmAmt) 중 하나 이상 충족 | 조건에 따라 자동충전 금액(stngAmt)이 산정되어 적용된다 | 조건 미충족 시 자동충전 미실행 |

### 데이터 영향
- **변경 테이블**: `charge_transactions`, `vouchers` (잔액 증가), `withdrawal_transactions`
- **이벤트 발행**: `ChargeCompleted`, `ChargeFailed`, `WithdrawalTimeout`

### 엣지 케이스
- 출금 타임아웃 후 5분 뒤 상태조회에서도 미확인 → 수기처리 프로세스로 에스컬레이션 (BL-039 참조)
- 자동충전 설정 시 잔액 조건과 일자 조건이 동시 충족 → 두 조건 중 하나만 실행 (중복 충전 방지)
- 회사 충전 한도와 개인 충전 한도는 별도 관리

---

## 시나리오 2: 충전 취소/환불

> 충전 확정 이후 이용자 또는 회사가 충전을 취소하고 환불받는 프로세스.
> 출금취소 API를 통해 원 출금을 되돌리는 구조.

### 전제 조건 (Preconditions)
- 충전이 확정(completed) 상태
- 충전 취소 요청이 유효한 조건을 만족

### 비즈니스 룰

| ID | 조건 (When) | 판단 기준 (If) | 처리 (Then) | 예외 (Else) |
|----|-------------|---------------|-------------|-------------|
| BL-009 | 출금이 정상적으로 완료된 경우 | 출금 완료 상태 확인 | 해당 출금 건에 대해 출금취소 요청이 가능하다 | 출금 미완료 시 출금취소 불가 |
| BL-010 | 충전 확정 후 출금취소가 필요한 경우 | 출금 상태가 '정상 처리' | 출금취소 API를 통해 출금취소 요청을 수행한다 | 출금 상태 비정상 시 수기처리 |
| BL-011 | 환불 요청이 발생한 경우 | 환불 요청 접수 확인 | `/money/chargeCancel` API를 호출한다 | API 호출 실패 시 재시도 후 에러 반환 |
| BL-012 | 충전 확정 후 이용자가 충전 취소를 요청하는 경우 | 취소 요청이 유효하고 환불 가능 조건 충족 | 충전 취소 및 환불 처리를 진행한다 | 환불 불가 조건 시 거부 |
| BL-013 | 회사가 충전 환불을 요청하는 경우 | 환불 요청이 유효함 | 충전 환불 처리를 진행한다 | 유효하지 않은 요청 시 거부 |

### 데이터 영향
- **변경 테이블**: `charge_transactions` (status 변경), `vouchers` (잔액 차감), `refund_transactions`
- **이벤트 발행**: `ChargeCanceled`, `RefundCompleted`

### 엣지 케이스
- 출금취소 API 호출 후 타임아웃 → BL-004와 동일한 5분 뒤 상태조회 패턴 적용
- 부분 사용 후 충전 취소 → 잔액만 환불 (BL-019 참조)

---

## 시나리오 3: 결제

> 이용자가 온누리상품권으로 가맹점에서 결제하는 프로세스.
> QR 결제, 카드 결제 등 복수 결제 수단 지원.

### 전제 조건 (Preconditions)
- 이용자의 상품권 잔액 ≥ 결제 금액
- 가맹점이 유효한 상태
- 결제 수단(QR, 카드 등)이 정상 작동

### 비즈니스 룰

| ID | 조건 (When) | 판단 기준 (If) | 처리 (Then) | 예외 (Else) |
|----|-------------|---------------|-------------|-------------|
| BL-014 | 결제가 정상적으로 완료된 경우 | 결제 완료 상태 확인 | 결제취소가 가능하다 (부분취소, 망취소 포함) | 결제 미완료 시 취소 불가 |
| BL-015 | 결제 금액이 50,000원 이상인 경우 | 결제 요청 금액 ≥ 50,000원 | SMS를 발송한다 | 50,000원 미만 시 SMS 미발송 |

### 데이터 영향
- **변경 테이블**: `payments`, `vouchers` (잔액 차감), `payment_notifications`
- **이벤트 발행**: `PaymentCompleted`, `PaymentNotification`

### 엣지 케이스
- 결제 중 네트워크 오류 → 망취소 처리 (BL-033 참조)
- 복합 결제(카드+상품권) 시 각 수단별 금액 분리 필요

---

## 시나리오 4: 결제 취소

> 결제 완료 후 이용자 또는 가맹점주가 결제를 취소하는 프로세스.
> 가맹점주 승인이 필요한 경우와 자동 취소 경우를 구분.

### 전제 조건 (Preconditions)
- 결제가 완료(PAID) 상태
- 취소 요청자가 권한을 보유 (이용자 본인 또는 가맹점주)

### 비즈니스 룰

| ID | 조건 (When) | 판단 기준 (If) | 처리 (Then) | 예외 (Else) |
|----|-------------|---------------|-------------|-------------|
| BL-016 | 결제 승인 취소 요청이 접수된 경우 | 취소 요청이 정상적으로 접수됨 | 카드사에 취소 요청을 전달하고 거래 기록을 업데이트한다 | 접수 실패 시 에러 반환 |
| BL-017 | 가맹점주가 온누리앱에서 결제내역 확인 후 취소버튼을 클릭한 경우 | 취소버튼 클릭 이벤트 발생 | BC카드 MPM으로 결제 취소전문을 전송한다 | 전송 실패 시 재시도 |
| BL-018 | QR 결제 취소 요청이 생성된 경우 | 가맹점주가 취소 승인 처리를 완료 | 취소 처리가 완료된다 | 가맹점주 미승인 시 취소 보류 |
| BL-019 | 탈퇴 후 결제 또는 매입 취소가 발생한 경우 | 탈퇴 회원의 취소 발생 | AP06(지급형 상품권 조회/지급) API를 통해 취소 처리한다 | API 실패 시 수기처리 |

### 데이터 영향
- **변경 테이블**: `payments` (status→CANCELED), `vouchers` (잔액 복구), `cancel_transactions`
- **이벤트 발행**: `PaymentCanceled`, `CancelApprovalRequested`

### 엣지 케이스
- QR 결제 취소 시 가맹점주가 24시간 내 미승인 → 자동 취소 보류 상태 유지
- 탈퇴 회원의 취소 건 → AP06 API 경유 필수 (일반 취소 플로우 사용 불가)
- 부분취소 시 취소 금액이 원결제 금액 초과 불가

---

## 시나리오 5: 환불

> 상품권 미사용/부분사용 환불, 거래 환불 등을 처리하는 프로세스.
> 환불 가능 여부 판단 → 입금 처리 → 환불 완료의 3단계 구조.

### 전제 조건 (Preconditions)
- 환불 대상 상품권 또는 거래가 존재
- 환불계좌가 등록되어 있음

### 비즈니스 룰

| ID | 조건 (When) | 판단 기준 (If) | 처리 (Then) | 예외 (Else) |
|----|-------------|---------------|-------------|-------------|
| BL-020 | 거래 환불 요청이 접수될 때 | 거래의 환불 가능 여부(rfndPsbltyYn) = 'Y' | 환불 처리를 진행한다 | rfndPsbltyYn = 'N'이면 환불 거부 |
| BL-021 | 환불 가능 여부 체크를 통과한 경우 | 환불 가능 조건 충족 | 입금 처리를 진행한다 | 조건 미충족 시 환불 거부 |
| BL-022 | 입금이 정상적으로 완료된 경우 | 입금 프로세스가 에러 없이 종료됨 | 환불 완료 처리한다 | [미정의] |
| BL-023 | 입금이 실패한 경우 | 입금 프로세스에서 오류 발생 | 에러를 반환한다 | [미정의] |
| BL-024 | 미사용 상품권 환불 요청 시 | 구매 후 7일 이내 환불 요청 | 전액 환불 처리한다 | 7일 초과 시 환불 불가 |
| BL-025 | 기 사용 상품권 잔액 환불 요청 시 | 전체 금액의 60% 이상 사용 | 잔액 환불이 가능하다 | 60% 미만 사용 시 잔액 환불 불가 |
| BL-026 | 캐시백 또는 할인보전 금액 환불 요청 시 | 캐시백 및 할인보전 금액에 해당 | 현금 환불 불가 | [미정의 — 포인트 전환 등 대안 검토 필요] |
| BL-027 | 계좌 오류로 환불 실패 시 | 환불계좌 오류 발생 | 소비자가 환불계좌 재등록 또는 고객센터 수기 접수로 환불 처리한다 | [미정의] |
| BL-028 | 환불 요청 시 제외금액 산정이 필요할 때 | 환불요청액에서 제외금액을 차감 | 입금액 = 환불요청액 − 제외금액으로 계산한다 | 제외금액이 0이면 전액 환불 |
| BL-029 | 유효기간 만료 상품권 환불 요청 시 | 원칙적으로 환불 불가 | 환불을 거부한다. 단, 강성 민원 시 강제환불 기능을 활용한다 | [미정의] |
| BL-030 | 상품권 유효기간 연장 요청 시 | 소진공 요청사항에 해당 | 유효기간 연장 불가 | [미정의] |

### 데이터 영향
- **변경 테이블**: `refund_transactions`, `vouchers` (잔액 차감), `deposit_transactions`
- **이벤트 발행**: `RefundRequested`, `RefundCompleted`, `RefundFailed`, `DepositCompleted`

### 엣지 케이스
- 환불 입금 타임아웃 → 입금상태조회 API 호출 (BL-036 참조)
- 캐시백 환불 불가 안내 후 고객 이의 → 고객센터 에스컬레이션
- 유효기간 만료 + 강성 민원 → 관리자 권한으로 강제환불 실행 (감사 로그 필수)
- 환불계좌 재등록 후에도 실패 → 고객센터 수기 접수로 전환

---

## 시나리오 6: 정산 (Settlement)

> 충전/환불/결제 거래를 집계하고 가맹점 정산 데이터를 산출하는 배치 프로세스.

### 전제 조건 (Preconditions)
- 정산 대상 기간의 거래 데이터가 존재
- BATCH 스케줄이 설정되어 있음

### 비즈니스 룰

| ID | 조건 (When) | 판단 기준 (If) | 처리 (Then) | 예외 (Else) |
|----|-------------|---------------|-------------|-------------|
| BL-031 | 충전 또는 환불 거래가 발생할 때 | 충전 건수, 금액, 할인금액, 환불 건수, 환불 금액, 환불 수수료로 집계 | 충전 및 환불 내역을 집계하여 관리한다 | 거래 0건 시 집계 생략 |
| BL-032 | 포인트 충전 또는 환불 거래가 발생할 때 | 포인트 충전 건수, 금액, 환불 건수, 환불 금액으로 집계 | 포인트 충전 및 환불 현황을 집계하여 관리한다 | 거래 0건 시 집계 생략 |
| BL-033 | BATCH_004가 실행되는 경우 | BATCH_004 스케줄 또는 수동 실행 | CALCULATION, CALCULATION_TRANS 테이블에서 데이터 조회 및 반복 갱신 처리한다 | 배치 실패 시 알림 발송 |
| BL-034 | 계산 데이터 처리가 필요한 경우 | CALCULATION 및 CALCULATION_TRANS 데이터가 존재 | 거래 데이터 반복 처리 후 CALCULATION_TRANS, CALCULATION 데이터를 갱신한다 | 데이터 미존재 시 스킵 |
| BL-035 | 특정 기간에 대한 산정 점검 데이터 로딩 요청 시 | 입력된 기간 파라미터가 유효 | 해당 기간의 산정 점검 데이터를 반환한다 | 기간 파라미터 무효 시 에러 반환 |
| BL-036 | 수수료 산출 시 | 정산수수료 반영 여부가 'Y' 또는 'N' | 정산수수료 반영 여부를 결정한다 | [미정의] |

### 데이터 영향
- **변경 테이블**: `calculations`, `calculation_transactions`, `settlement_summaries`
- **이벤트 발행**: `SettlementCalculated`, `BatchCompleted`

### 엣지 케이스
- 배치 실행 중 장애 → 중단 지점부터 재시작 가능해야 함 (멱등성 보장)
- 동일 기간 중복 배치 실행 → 기존 데이터 덮어쓰기 (upsert)
- 정산수수료 반영 여부 변경 시 이미 산출된 건에 대한 재계산 필요

---

## 시나리오 7: 예외 처리 및 복구

> 외부 API 호출 실패, 타임아웃, 네트워크 오류 등 비정상 상황에 대한 처리 정책.

### 전제 조건 (Preconditions)
- 외부 시스템(머니플랫폼, BC카드 등)과 연계된 트랜잭션이 존재
- 비정상 상태가 감지됨

### 비즈니스 룰

| ID | 조건 (When) | 판단 기준 (If) | 처리 (Then) | 예외 (Else) |
|----|-------------|---------------|-------------|-------------|
| BL-037 | 충전 프로세스에서 출금 실패 시 | 출금 처리 결과가 '실패' 상태로 반환됨 | 에러를 리턴하고 충전 프로세스를 중단한다 | [미정의] |
| BL-038 | 머니플랫폼 출금 요청 시 타임아웃 발생 | 출금 요청 후 응답 대기 시간 초과 | 5분 후 출금상태조회 API를 호출한다. 정상 처리 확인 시 필요하면 출금취소 요청을 수행한다 | 상태조회도 실패 시 수기처리로 전환 |
| BL-039 | 자동 환불/취소 처리가 불가하거나 예외 상황 발생 시 | 자동 처리 실패 확인 | 관리자가 수기로 환불 요청 정보(사용자ID, 상품권ID, 입금계좌ID, 당일입금여부)를 입력하여 처리한다. 타임아웃 시 입금상태조회를 수행한다 | [미정의] |
| BL-040 | 환불 프로세스에서 입금 결과가 비정상인 경우 | 입금 결과가 '에러'이면 재시도 가능한 일시적 오류, '실패'이면 재시도 불가한 확정적 오류 | 에러 시 입금요청을 재시도한다. 실패 시 에러를 리턴하여 프로세스를 종료한다 | [미정의] |
| BL-041 | 외부 API(EXTERNAL-API) 호출이 실패한 경우 | 외부 시스템 연계 호출 시 오류 발생 | 정의된 ERROR CODE를 반환한다. 해당 트랜잭션은 실패 처리되고 롤백 또는 재시도 절차를 수행한다 | [미정의] |
| BL-042 | 결제 망 취소가 감지된 경우 | 네트워크 오류 등으로 결제 망 취소 발생 | 거래 상태를 변경하고 복구 처리를 수행한다 | 복구 실패 시 수기처리 |

### 데이터 영향
- **변경 테이블**: `charge_transactions`, `refund_transactions`, `deposit_transactions`, `payments` (상태 변경)
- **이벤트 발행**: `ManualProcessRequired`, `RetryAttempted`, `NetworkCancelDetected`

### 엣지 케이스
- 입금 '에러'(일시적) vs '실패'(확정적)의 구분 기준은 외부 API 응답 코드에 의존
- 수기처리 시 관리자 권한 검증 + 감사 로그 기록 필수
- 망취소 복구 시 이중 처리 방지를 위한 멱등성 키 관리 필요

---

## 시나리오 8: 알림 (Notification)

> 결제, 정책 변경, 스케줄 메시지 등에 대한 알림 발송 프로세스.

### 전제 조건 (Preconditions)
- 알림 대상 이벤트가 발생함
- 수신자 연락처가 등록되어 있음

### 비즈니스 룰

| ID | 조건 (When) | 판단 기준 (If) | 처리 (Then) | 예외 (Else) |
|----|-------------|---------------|-------------|-------------|
| BL-015 | 결제 금액이 50,000원 이상인 경우 | 결제 요청 금액 ≥ 50,000원 | SMS를 발송한다 | 50,000원 미만 시 SMS 미발송 |
| BL-043 | 카드사 SMS 서비스 제공 시 | 수신동의 고객 대상, 카드사 자체 관리 | 전산 연계하여 카드사에서 SMS를 관리한다 | 수신 미동의 고객은 제외 |
| BL-044 | 실시간 알림 통보 시 | 사용자와 가맹점 모두에게 알림 발송 | 실시간 알림을 구현하고, 사용자에게 카드사 SMS 중복알림 방지 옵션을 제공한다 | [미정의] |
| BL-045 | 정책 발행일 전 | 정책 발행 예정 상태 확인 | 담당자에게 LMS를 발송한다 | [미정의] |
| BL-046 | 등록된 스케줄 메시지의 취소 요청이 접수된 경우 | 취소 요청이 발송 예정일 이전에 접수됨 | 스케줄 메시지의 상태를 '취소'로 변경한다 | 발송 예정일 이후 접수 시 취소 불가 |
| BL-047 | 스케줄 메시지가 취소된 경우 | 스케줄 메시지 상태가 '취소'로 변경됨 | 관련 발송 작업을 중단하고 수신자에게 발송하지 않는다 | [미정의] |

### 데이터 영향
- **변경 테이블**: `payment_notifications`, `scheduled_messages`
- **이벤트 발행**: `NotificationSent`, `ScheduledMessageCanceled`

### 엣지 케이스
- 카드사 SMS와 자체 SMS 중복 발송 방지 → 사용자별 알림 설정 확인 필요
- 스케줄 메시지 취소 요청이 발송 직전(수 초 이내) 도착 → 경쟁 조건(race condition) 처리

---

## 부록: BL 크로스 레퍼런스

| BL ID | 원본 정책 코드 | 시나리오 | 관련 테이블 (Doc 2) |
|-------|---------------|---------|---------------------|
| BL-001 | POL-PENSION-WD-150 | 충전 | `withdrawal_transactions`, `vouchers` |
| BL-002 | POL-PENSION-WD-001 | 충전 | `charge_transactions`, `vouchers` |
| BL-003 | POL-PENSION-WD-002 | 충전 | `charge_transactions` |
| BL-004 | POL-PENSION-WD-097 | 충전 | `withdrawal_transactions` |
| BL-005 | POL-PENSION-CT-419 | 충전 | `charge_transactions`, `vouchers` |
| BL-006 | POL-PENSION-CT-421 | 충전 | `charge_transactions`, `vouchers` |
| BL-007 | POL-PENSION-CT-427 | 충전 | `point_transactions`, `vouchers` |
| BL-008 | POL-PENSION-CT-406 | 충전 | `auto_charge_settings` |
| BL-009 | POL-PENSION-WD-004 | 충전 취소 | `withdrawal_transactions` |
| BL-010 | POL-PENSION-WD-141, WD-143 | 충전 취소 | `withdrawal_transactions` |
| BL-011 | POL-PENSION-WD-006 | 충전 취소 | `charge_transactions`, `refund_transactions` |
| BL-012 | POL-PENSION-CT-420 | 충전 취소 | `charge_transactions`, `refund_transactions` |
| BL-013 | POL-PENSION-CT-422 | 충전 취소 | `charge_transactions`, `refund_transactions` |
| BL-014 | POL-PENSION-WD-011 | 결제 | `payments` |
| BL-015 | POL-PENSION-NF-010 | 결제/알림 | `payment_notifications` |
| BL-016 | POL-PENSION-WD-251 | 결제 취소 | `payments`, `cancel_transactions` |
| BL-017 | POL-PENSION-WD-220 | 결제 취소 | `payments`, `cancel_transactions` |
| BL-018 | POL-PENSION-WD-224 | 결제 취소 | `payments`, `cancel_transactions` |
| BL-019 | POL-PENSION-EX-009 | 결제 취소 | `payments`, `cancel_transactions` |
| BL-020 | POL-PENSION-WD-400 | 환불 | `refund_transactions` |
| BL-021 | POL-PENSION-WD-005 | 환불 | `refund_transactions`, `deposit_transactions` |
| BL-022 | POL-PENSION-WD-006 | 환불 | `refund_transactions`, `deposit_transactions` |
| BL-023 | POL-PENSION-WD-007 | 환불 | `refund_transactions` |
| BL-024 | POL-PENSION-WD-004 | 환불 | `refund_transactions`, `vouchers` |
| BL-025 | POL-PENSION-WD-005 | 환불 | `refund_transactions`, `vouchers` |
| BL-026 | POL-PENSION-WD-007 | 환불 | `refund_transactions` |
| BL-027 | POL-PENSION-WD-008 | 환불 | `refund_transactions`, `refund_accounts` |
| BL-028 | POL-PENSION-CL-226 | 환불 | `refund_transactions` |
| BL-029 | POL-PENSION-EX-006 | 환불 | `refund_transactions`, `vouchers` |
| BL-030 | POL-PENSION-EX-022 | 환불 | `vouchers` |
| BL-031 | POL-PENSION-CT-410 | 정산 | `settlement_summaries` |
| BL-032 | POL-PENSION-CT-412 | 정산 | `settlement_summaries` |
| BL-033 | POL-PENSION-CL-005 | 정산 | `calculations`, `calculation_transactions` |
| BL-034 | POL-PENSION-CL-014 | 정산 | `calculations`, `calculation_transactions` |
| BL-035 | POL-PENSION-CL-418 | 정산 | `calculations` |
| BL-036 | POL-PENSION-CL-192 | 정산 | `calculations` |
| BL-037 | POL-PENSION-WD-139 | 예외 처리 | `charge_transactions` |
| BL-038 | POL-PENSION-EX-150 | 예외 처리 | `withdrawal_transactions` |
| BL-039 | POL-PENSION-EX-149, EX-105 | 예외 처리 | `refund_transactions` |
| BL-040 | POL-PENSION-EX-152 | 예외 처리 | `deposit_transactions` |
| BL-041 | POL-PENSION-EX-145 | 예외 처리 | — (공통) |
| BL-042 | POL-PENSION-EX-252 | 예외 처리 | `payments` |
| BL-043 | POL-PENSION-NF-015 | 알림 | `payment_notifications` |
| BL-044 | POL-PENSION-NF-016 | 알림 | `payment_notifications` |
| BL-045 | POL-PENSION-NF-027 | 알림 | `scheduled_messages` |
| BL-046 | POL-PENSION-NF-425 | 알림 | `scheduled_messages` |
| BL-047 | POL-PENSION-NF-429 | 알림 | `scheduled_messages` |
