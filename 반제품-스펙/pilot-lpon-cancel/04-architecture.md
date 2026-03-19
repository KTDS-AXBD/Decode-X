# 아키텍처 정의서 — LPON 온누리상품권

> **도메인**: 온누리상품권 (LPON)
> **범위**: 충전 / 결제 / 환불 / 가맹점 / 정산 / 알림
> **스택**: 중립 (구현 시 Claude Code가 선택)
> **버전**: 1.0
> **작성일**: 2026-03-19

---

## 1. 시스템 레이어

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│  (REST API Gateway, 요청 검증, 인증 미들웨어, 응답 포맷팅)      │
├─────────────────────────────────────────────────────────────┤
│                    Application Layer                         │
│  (유스케이스 조합, 트랜잭션 조율, 이벤트 발행, 외부 연동 어댑터)   │
├─────────────────────────────────────────────────────────────┤
│                      Domain Layer                            │
│  (비즈니스 룰 실행, 상태 전이 검증, 금액 계산, 도메인 이벤트)     │
├─────────────────────────────────────────────────────────────┤
│                   Infrastructure Layer                       │
│  (DB 접근, 외부 API 클라이언트, 알림 전송, 파일 저장)            │
└─────────────────────────────────────────────────────────────┘
```

### 레이어 간 규칙

| 규칙 | 설명 |
|------|------|
| 의존 방향 | 상위 → 하위만 허용. Domain은 Infrastructure를 직접 참조하지 않음 (인터페이스 의존) |
| Domain 순수성 | Domain Layer는 프레임워크/DB/외부 API에 의존하지 않음. 순수 비즈니스 로직만 포함 |
| Application 조율 | Application Layer가 Domain 호출 + Infrastructure 호출을 조합. 트랜잭션 경계 관리 |
| Presentation 얇게 | 요청 파싱 + 인증 확인 + Application 호출 + 응답 포맷팅만 담당 |

---

## 2. 모듈 구성

### 2.1 모듈 책임 및 의존

| 모듈 | 책임 | 의존 모듈 | 핵심 엔티티 |
|------|------|-----------|------------|
| **Charging** (충전) | 상품권 충전 요청, 충전 내역 관리, 잔액 증가 | Voucher, User | charges |
| **Payment** (결제) | 결제 생성, 상태 전이, 잔액 차감 | Voucher, User, Merchant | payments |
| **Refund** (환불) | 환불 생성, 환불 상태 관리, 잔액 복원 | Payment, Voucher | refunds |
| **Merchant** (가맹점) | 가맹점 등록/수정/조회, 업종 관리, 상태 관리 | — | merchants |
| **Settlement** (정산) | 정산 주기 계산, 정산 내역 생성, 정산 상태 관리 | Payment, Merchant | settlements |
| **Notification** (알림) | 알림 생성, 발송, 이력 관리 | — (이벤트 수신) | notifications |
| **Voucher** (상품권) | 상품권 발급, 잔액 관리, 유효기간 검증 | User | vouchers |
| **User** (이용자) | 이용자 정보 관리, 인증 상태 | — | users |

### 2.2 모듈 의존 다이어그램

```
                     ┌──────────┐
                     │   User   │
                     └────┬─────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        ┌──────────┐ ┌─────────┐ ┌──────────┐
        │ Voucher  │ │Merchant │ │Notification│
        └────┬─────┘ └────┬────┘ └──────────┘
             │            │           ▲
     ┌───────┼────────┐   │           │ (이벤트)
     ▼       ▼        ▼   │           │
┌─────────┐┌─────────┐   │      ┌────┴─────┐
│Charging ││ Payment │───┘      │ (모든 모듈│
└─────────┘└────┬────┘          │  이벤트   │
                │               │  발행)    │
          ┌─────┼─────┐        └──────────┘
          ▼           ▼
    ┌──────────┐ ┌──────────┐
    │  Refund  │ │Settlement│
    └──────────┘ └──────────┘
```

### 2.3 이벤트 흐름

| 이벤트 | 발행 모듈 | 수신 모듈 | 설명 |
|--------|----------|----------|------|
| `VoucherCharged` | Charging | Notification | 충전 완료 알림 |
| `PaymentCreated` | Payment | Settlement, Notification | 결제 발생 → 정산 대상 추가 |
| `PaymentCanceled` | Payment | Settlement, Refund, Notification | 결제 취소 시 정산 차감 |
| `RefundCompleted` | Refund | Notification | 환불 완료 알림 |
| `SettlementProcessed` | Settlement | Notification | 정산 완료 알림 |
| `MerchantStatusChanged` | Merchant | Payment, Notification | 가맹점 정지 시 결제 차단 |

---

## 3. 인증/권한 매트릭스

### 3.1 인증 방식

- JWT 기반 토큰 인증
- 역할(Role): `USER`, `MERCHANT`, `ADMIN`
- 토큰 페이로드: `{ sub, role, merchant_id? }`

### 3.2 권한 매트릭스

| 기능 | USER | MERCHANT | ADMIN |
|------|:----:|:--------:|:-----:|
| **충전** | | | |
| 상품권 충전 | O (본인) | X | O |
| 충전 내역 조회 | O (본인) | X | O (전체) |
| **결제** | | | |
| 결제 실행 | O (본인) | X | O |
| 결제 내역 조회 | O (본인) | O (본인 가맹점) | O (전체) |
| 결제 취소 | O (본인) | X | O |
| **환불** | | | |
| 환불 신청 | O (본인 결제건) | X | O |
| 환불 상태 조회 | O (본인) | O (본인 가맹점) | O (전체) |
| 환불 승인 | X | X | O |
| **가맹점** | | | |
| 가맹점 등록 | X | O (본인) | O |
| 가맹점 정보 수정 | X | O (본인) | O |
| 가맹점 목록 조회 | O (공개 정보) | O (본인) | O (전체) |
| 가맹점 상태 변경 | X | X | O |
| **정산** | | | |
| 정산 내역 조회 | X | O (본인 가맹점) | O (전체) |
| 정산 실행 | X | X | O |
| 정산 확정 | X | X | O |
| **알림** | | | |
| 알림 목록 조회 | O (본인) | O (본인) | O (전체) |
| 알림 읽음 처리 | O (본인) | O (본인) | O (본인) |

### 3.3 접근 제어 규칙

| 규칙 ID | 설명 |
|---------|------|
| AC-01 | USER는 본인 데이터만 접근 가능 (`user_id = token.sub`) |
| AC-02 | MERCHANT는 본인 가맹점 관련 데이터만 접근 가능 (`merchant_id = token.merchant_id`) |
| AC-03 | ADMIN은 모든 데이터 접근 가능, 관리 기능(정산 실행, 환불 승인, 가맹점 상태 변경) 독점 |
| AC-04 | 미인증 요청은 401 반환. 권한 부족은 403 반환 |
| AC-05 | 가맹점 상태가 SUSPENDED인 경우, 해당 가맹점 대상 결제 차단 |

---

## 4. 상태 전이

### 4.1 상품권 (Voucher) 상태

```
ISSUED ──→ ACTIVE ──→ EXPIRED
              │
              └──→ SUSPENDED (관리자)
```

| 전이 | 조건 |
|------|------|
| ISSUED → ACTIVE | 최초 충전 완료 시 |
| ACTIVE → EXPIRED | 유효기간 만료 |
| ACTIVE → SUSPENDED | 관리자 정지 조치 |

### 4.2 결제 (Payment) 상태

```
PENDING ──→ PAID ──→ CANCEL_REQUESTED ──→ CANCELED
                                              │
                                              └──→ REFUNDED
```

| 전이 | 조건 |
|------|------|
| PENDING → PAID | 잔액 차감 성공 |
| PAID → CANCEL_REQUESTED | 사용자 취소 요청 |
| CANCEL_REQUESTED → CANCELED | 취소 처리 완료 |
| CANCELED → REFUNDED | 환불 처리 완료 |

### 4.3 환불 (Refund) 상태

```
REQUESTED ──→ APPROVED ──→ COMPLETED
    │
    └──→ REJECTED
```

| 전이 | 조건 |
|------|------|
| REQUESTED → APPROVED | 관리자 승인 |
| REQUESTED → REJECTED | 관리자 거절 |
| APPROVED → COMPLETED | 환불 금액 복원 완료 |

### 4.4 정산 (Settlement) 상태

```
PENDING ──→ CALCULATED ──→ CONFIRMED ──→ PAID
                               │
                               └──→ DISPUTED
```

| 전이 | 조건 |
|------|------|
| PENDING → CALCULATED | 정산 금액 계산 완료 |
| CALCULATED → CONFIRMED | 관리자 확정 |
| CONFIRMED → PAID | 송금 완료 |
| CALCULATED → DISPUTED | 가맹점 이의 제기 |

### 4.5 가맹점 (Merchant) 상태

```
PENDING ──→ ACTIVE ──→ SUSPENDED ──→ ACTIVE
                │
                └──→ TERMINATED
```

| 전이 | 조건 |
|------|------|
| PENDING → ACTIVE | 관리자 승인 |
| ACTIVE → SUSPENDED | 관리자 정지 |
| SUSPENDED → ACTIVE | 관리자 해제 |
| ACTIVE → TERMINATED | 계약 해지 |

---

## 5. 모듈별 레이어 구성

### 5.1 Charging 모듈

| 레이어 | 구성 요소 | 책임 |
|--------|----------|------|
| Presentation | `POST /api/v1/charges`, `GET /api/v1/charges` | 충전 요청 접수, 내역 조회 |
| Application | ChargeUseCase | 충전 검증 → 잔액 증가 → 이력 저장 → 이벤트 발행 |
| Domain | ChargePolicy | 충전 한도 검증, 최소/최대 금액 검증 |
| Infrastructure | ChargeRepository, VoucherRepository | DB 읽기/쓰기 |

### 5.2 Payment 모듈

| 레이어 | 구성 요소 | 책임 |
|--------|----------|------|
| Presentation | `POST /api/v1/payments`, `GET /api/v1/payments`, `POST .../cancel` | 결제/취소/조회 |
| Application | PaymentUseCase, CancelPaymentUseCase | 결제 플로우 조율, 취소 플로우 조율 |
| Domain | PaymentPolicy | 잔액 확인, 가맹점 상태 확인, 취소 기간 검증 |
| Infrastructure | PaymentRepository, VoucherRepository | DB 읽기/쓰기, 외부 결제 연동 |

### 5.3 Refund 모듈

| 레이어 | 구성 요소 | 책임 |
|--------|----------|------|
| Presentation | `POST /api/v1/refunds`, `GET /api/v1/refunds`, `POST .../approve` | 환불 신청/조회/승인 |
| Application | RefundUseCase | 환불 요청 → 승인/거절 → 잔액 복원 |
| Domain | RefundPolicy | 환불 가능 여부, 금액 계산, 부분 환불 규칙 |
| Infrastructure | RefundRepository, PaymentRepository | DB 읽기/쓰기 |

### 5.4 Merchant 모듈

| 레이어 | 구성 요소 | 책임 |
|--------|----------|------|
| Presentation | `POST /api/v1/merchants`, `GET /api/v1/merchants`, `PATCH .../status` | 등록/조회/상태변경 |
| Application | MerchantUseCase | 가맹점 등록 → 심사 → 승인 플로우 |
| Domain | MerchantPolicy | 업종 검증, 사업자등록 검증, 상태 전이 검증 |
| Infrastructure | MerchantRepository | DB 읽기/쓰기, 사업자등록 확인 API |

### 5.5 Settlement 모듈

| 레이어 | 구성 요소 | 책임 |
|--------|----------|------|
| Presentation | `GET /api/v1/settlements`, `POST .../confirm`, `POST /api/v1/settlements/execute` | 조회/확정/실행 |
| Application | SettlementUseCase | 정산 주기별 계산 → 확정 → 송금 |
| Domain | SettlementPolicy | 정산 금액 계산 (수수료 차감), 정산 주기 규칙 |
| Infrastructure | SettlementRepository, PaymentRepository | DB 읽기/쓰기, 송금 API |

### 5.6 Notification 모듈

| 레이어 | 구성 요소 | 책임 |
|--------|----------|------|
| Presentation | `GET /api/v1/notifications`, `PATCH .../read` | 알림 조회/읽음 처리 |
| Application | NotificationUseCase | 이벤트 수신 → 알림 생성 → 발송 |
| Domain | NotificationPolicy | 알림 유형 결정, 수신 대상 결정, 중복 방지 |
| Infrastructure | NotificationRepository, PushService, EmailService | DB, Push/Email 발송 |

---

## 6. 비기능 요구사항

| 항목 | 기준 | 비고 |
|------|------|------|
| **동시 사용자** | 1,000명 (파일럿) | 부하 테스트 기준 |
| **응답 시간** | < 500ms (p95) | 결제/충전 API 기준 |
| **가용성** | 99.5% | 월간 기준, 계획된 유지보수 제외 |
| **데이터 무결성** | 결제-잔액 트랜잭션 원자성 | 결제 시 잔액 차감 + 결제 내역 생성이 원자적 |
| **감사 추적** | 모든 금액 변동 이력 보존 | charges, payments, refunds, settlements |
| **데이터 보존** | 거래 데이터 5년 보존 | 전자금융거래법 준수 |
| **암호화** | 개인정보 암호화 저장 | 이름, 전화번호, 사업자등록번호 |
| **정산 정확성** | 정산 금액 = 결제 합계 - 환불 합계 - 수수료 | 원 단위 정확 |

---

## 7. 외부 연동 인터페이스

| 연동 대상 | 방향 | 방식 | 용도 |
|-----------|------|------|------|
| 사업자등록 확인 API | Outbound | REST | 가맹점 등록 시 사업자 유효성 검증 |
| 은행 송금 API | Outbound | REST | 정산금 가맹점 계좌 송금 |
| Push 알림 서비스 | Outbound | REST/WebSocket | 사용자/가맹점 푸시 알림 |
| Email 서비스 | Outbound | REST | 정산 완료, 가맹점 상태 변경 알림 |

> **Note**: 외부 연동은 Infrastructure Layer의 어댑터로 구현. Domain은 인터페이스만 정의하고, 실제 구현체는 Infrastructure에서 주입.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-19 | 초안 — 6모듈 아키텍처, 권한 매트릭스, 상태 전이, 비기능 요구사항 | AI Foundry |
