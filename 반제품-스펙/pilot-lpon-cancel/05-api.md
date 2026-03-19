# API 명세 — LPON 온누리상품권

> **도메인**: 온누리상품권 (LPON)
> **범위**: 충전 / 결제 / 환불 / 가맹점 / 정산 / 알림
> **Base Path**: `/api/v1`
> **인증**: JWT Bearer Token
> **응답 포맷**: `{ success: boolean, data?: T, error?: { code: string, message: string } }`
> **버전**: 1.0
> **작성일**: 2026-03-19

---

## 공통 사항

### 인증 헤더

```
Authorization: Bearer <JWT_TOKEN>
```

### 공통 에러

| HTTP | Code | 설명 |
|:----:|------|------|
| 401 | E401 | 인증 토큰 없음 또는 만료 |
| 403 | E403 | 권한 부족 |
| 500 | E500 | 서버 내부 오류 |

### 페이지네이션 (목록 API 공통)

- Query: `?page=1&limit=20`
- Response 메타: `{ total, page, limit, totalPages }`

---

## 1. 사용자 / 인증 API

### API-001: 회원가입

- **Method**: `POST`
- **Path**: `/api/v1/auth/register`
- **Auth**: 불필요
- **관련 기능**: FN-

#### Request

```json
{
  "email": "string (required, email format)",
  "password": "string (required, min 8자)",
  "name": "string (required)",
  "phone": "string (required, 010-XXXX-XXXX)"
}
```

#### Response (201)

```json
{
  "success": true,
  "data": {
    "user_id": "string (UUID)",
    "email": "string",
    "name": "string",
    "role": "USER",
    "created_at": "string (ISO 8601)"
  }
}
```

#### Errors

| HTTP | Code | 조건 |
|:----:|------|------|
| 409 | E409 | 이메일 중복 |
| 422 | E422 | 입력값 검증 실패 |

---

### API-002: 로그인

- **Method**: `POST`
- **Path**: `/api/v1/auth/login`
- **Auth**: 불필요
- **관련 기능**: FN-

#### Request

```json
{
  "email": "string (required)",
  "password": "string (required)"
}
```

#### Response (200)

```json
{
  "success": true,
  "data": {
    "token": "string (JWT)",
    "expires_at": "string (ISO 8601)",
    "user": {
      "user_id": "string",
      "email": "string",
      "name": "string",
      "role": "USER | MERCHANT | ADMIN"
    }
  }
}
```

#### Errors

| HTTP | Code | 조건 |
|:----:|------|------|
| 401 | E401 | 이메일 또는 비밀번호 불일치 |

---

## 2. 상품권 API

### API-003: 상품권 발급

- **Method**: `POST`
- **Path**: `/api/v1/vouchers`
- **Auth**: USER, ADMIN
- **관련 기능**: FN-

#### Request

```json
{
  "type": "string (required, PAPER | CARD | MOBILE)"
}
```

#### Response (201)

```json
{
  "success": true,
  "data": {
    "voucher_id": "string (UUID)",
    "type": "PAPER | CARD | MOBILE",
    "balance": 0,
    "status": "ISSUED",
    "expires_at": "string (ISO 8601)",
    "created_at": "string (ISO 8601)"
  }
}
```

---

### API-004: 상품권 상세 조회

- **Method**: `GET`
- **Path**: `/api/v1/vouchers/{voucher_id}`
- **Auth**: USER (본인), ADMIN
- **관련 기능**: FN-

#### Response (200)

```json
{
  "success": true,
  "data": {
    "voucher_id": "string",
    "user_id": "string",
    "type": "PAPER | CARD | MOBILE",
    "balance": "integer (원)",
    "status": "ISSUED | ACTIVE | EXPIRED | SUSPENDED",
    "expires_at": "string (ISO 8601)",
    "created_at": "string (ISO 8601)"
  }
}
```

#### Errors

| HTTP | Code | 조건 |
|:----:|------|------|
| 404 | E404 | 상품권 없음 |

---

### API-005: 내 상품권 목록

- **Method**: `GET`
- **Path**: `/api/v1/vouchers`
- **Auth**: USER (본인 목록), ADMIN (전체)
- **관련 기능**: FN-

#### Query Parameters

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|:----:|------|
| status | string | N | 상태 필터 |
| page | integer | N | 페이지 (기본 1) |
| limit | integer | N | 페이지 크기 (기본 20, 최대 100) |

#### Response (200)

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "voucher_id": "string",
        "type": "string",
        "balance": "integer",
        "status": "string",
        "expires_at": "string"
      }
    ],
    "total": "integer",
    "page": "integer",
    "limit": "integer",
    "totalPages": "integer"
  }
}
```

---

## 3. 충전 API

### API-010: 상품권 충전

- **Method**: `POST`
- **Path**: `/api/v1/vouchers/{voucher_id}/charges`
- **Auth**: USER (본인), ADMIN
- **관련 기능**: FN-

#### Request

```json
{
  "amount": "integer (required, 1,000 ~ 500,000원, 1,000원 단위)",
  "payment_method": "string (required, CARD | BANK_TRANSFER)"
}
```

#### Response (201)

```json
{
  "success": true,
  "data": {
    "charge_id": "string (UUID)",
    "voucher_id": "string",
    "amount": "integer",
    "balance_after": "integer",
    "payment_method": "string",
    "charged_at": "string (ISO 8601)"
  }
}
```

#### Errors

| HTTP | Code | 조건 |
|:----:|------|------|
| 404 | E404 | 상품권 없음 |
| 409 | E409 | 상품권 상태가 ACTIVE가 아님 (EXPIRED, SUSPENDED) |
| 422 | E422-AMT | 충전 금액 범위 초과 또는 단위 불일치 |
| 422 | E422-LMT | 충전 한도 초과 (일 100만원, 월 300만원) |

---

### API-011: 충전 내역 조회

- **Method**: `GET`
- **Path**: `/api/v1/vouchers/{voucher_id}/charges`
- **Auth**: USER (본인), ADMIN
- **관련 기능**: FN-

#### Query Parameters

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|:----:|------|
| from | string | N | 시작일 (ISO 8601) |
| to | string | N | 종료일 (ISO 8601) |
| page | integer | N | 페이지 |
| limit | integer | N | 페이지 크기 |

#### Response (200)

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "charge_id": "string",
        "amount": "integer",
        "balance_after": "integer",
        "payment_method": "string",
        "charged_at": "string"
      }
    ],
    "total": "integer",
    "page": "integer",
    "limit": "integer",
    "totalPages": "integer"
  }
}
```

---

## 4. 결제 API

### API-020: 결제 실행

- **Method**: `POST`
- **Path**: `/api/v1/payments`
- **Auth**: USER
- **관련 기능**: FN-

#### Request

```json
{
  "voucher_id": "string (required, UUID)",
  "merchant_id": "string (required, UUID)",
  "amount": "integer (required, > 0)",
  "description": "string (optional, 결제 설명)"
}
```

#### Response (201)

```json
{
  "success": true,
  "data": {
    "payment_id": "string (UUID)",
    "voucher_id": "string",
    "merchant_id": "string",
    "amount": "integer",
    "balance_after": "integer",
    "status": "PAID",
    "paid_at": "string (ISO 8601)"
  }
}
```

#### Errors

| HTTP | Code | 조건 |
|:----:|------|------|
| 404 | E404-V | 상품권 없음 |
| 404 | E404-M | 가맹점 없음 |
| 409 | E409-VS | 상품권 상태 이상 (EXPIRED, SUSPENDED) |
| 409 | E409-MS | 가맹점 상태 이상 (SUSPENDED, TERMINATED) |
| 422 | E422-BAL | 잔액 부족 |
| 422 | E422-AMT | 결제 금액이 0 이하 |

---

### API-021: 결제 상세 조회

- **Method**: `GET`
- **Path**: `/api/v1/payments/{payment_id}`
- **Auth**: USER (본인), MERCHANT (본인 가맹점), ADMIN
- **관련 기능**: FN-

#### Response (200)

```json
{
  "success": true,
  "data": {
    "payment_id": "string",
    "user_id": "string",
    "voucher_id": "string",
    "merchant_id": "string",
    "amount": "integer",
    "status": "PENDING | PAID | CANCEL_REQUESTED | CANCELED | REFUNDED",
    "description": "string | null",
    "paid_at": "string",
    "canceled_at": "string | null",
    "created_at": "string"
  }
}
```

#### Errors

| HTTP | Code | 조건 |
|:----:|------|------|
| 404 | E404 | 결제 내역 없음 |

---

### API-022: 결제 내역 목록

- **Method**: `GET`
- **Path**: `/api/v1/payments`
- **Auth**: USER (본인), MERCHANT (본인 가맹점), ADMIN (전체)
- **관련 기능**: FN-

#### Query Parameters

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|:----:|------|
| voucher_id | string | N | 상품권 필터 |
| merchant_id | string | N | 가맹점 필터 |
| status | string | N | 상태 필터 |
| from | string | N | 시작일 |
| to | string | N | 종료일 |
| page | integer | N | 페이지 |
| limit | integer | N | 페이지 크기 |

#### Response (200)

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "payment_id": "string",
        "merchant_id": "string",
        "amount": "integer",
        "status": "string",
        "paid_at": "string"
      }
    ],
    "total": "integer",
    "page": "integer",
    "limit": "integer",
    "totalPages": "integer"
  }
}
```

---

### API-023: 결제 취소

- **Method**: `POST`
- **Path**: `/api/v1/payments/{payment_id}/cancel`
- **Auth**: USER (본인), ADMIN
- **관련 기능**: FN-

#### Request

```json
{
  "reason": "string (required, 취소 사유)"
}
```

#### Response (200)

```json
{
  "success": true,
  "data": {
    "payment_id": "string",
    "status": "CANCEL_REQUESTED",
    "cancel_reason": "string",
    "requested_at": "string (ISO 8601)"
  }
}
```

#### Errors

| HTTP | Code | 조건 |
|:----:|------|------|
| 404 | E404 | 결제 내역 없음 |
| 409 | E409-ST | 이미 취소/환불된 결제 |
| 422 | E422-PD | 취소 가능 기간 초과 (결제일로부터 7일) |

---

## 5. 환불 API

### API-030: 환불 신청

- **Method**: `POST`
- **Path**: `/api/v1/refunds`
- **Auth**: USER (본인 결제건), ADMIN
- **관련 기능**: FN-

#### Request

```json
{
  "payment_id": "string (required, UUID)",
  "amount": "integer (required, > 0, 결제 금액 이하)",
  "reason": "string (required, 환불 사유)"
}
```

#### Response (201)

```json
{
  "success": true,
  "data": {
    "refund_id": "string (UUID)",
    "payment_id": "string",
    "amount": "integer",
    "status": "REQUESTED",
    "reason": "string",
    "requested_at": "string (ISO 8601)"
  }
}
```

#### Errors

| HTTP | Code | 조건 |
|:----:|------|------|
| 404 | E404 | 결제 내역 없음 |
| 409 | E409-ST | 결제 상태가 CANCELED가 아님 |
| 422 | E422-AMT | 환불 금액이 결제 금액 초과 |
| 422 | E422-DUP | 이미 환불 신청된 결제 |

---

### API-031: 환불 상세 조회

- **Method**: `GET`
- **Path**: `/api/v1/refunds/{refund_id}`
- **Auth**: USER (본인), MERCHANT (본인 가맹점), ADMIN
- **관련 기능**: FN-

#### Response (200)

```json
{
  "success": true,
  "data": {
    "refund_id": "string",
    "payment_id": "string",
    "amount": "integer",
    "status": "REQUESTED | APPROVED | REJECTED | COMPLETED",
    "reason": "string",
    "reject_reason": "string | null",
    "requested_at": "string",
    "completed_at": "string | null"
  }
}
```

---

### API-032: 환불 목록 조회

- **Method**: `GET`
- **Path**: `/api/v1/refunds`
- **Auth**: USER (본인), MERCHANT (본인 가맹점), ADMIN (전체)
- **관련 기능**: FN-

#### Query Parameters

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|:----:|------|
| payment_id | string | N | 결제 ID 필터 |
| status | string | N | 상태 필터 |
| from | string | N | 시작일 |
| to | string | N | 종료일 |
| page | integer | N | 페이지 |
| limit | integer | N | 페이지 크기 |

#### Response (200)

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "refund_id": "string",
        "payment_id": "string",
        "amount": "integer",
        "status": "string",
        "requested_at": "string"
      }
    ],
    "total": "integer",
    "page": "integer",
    "limit": "integer",
    "totalPages": "integer"
  }
}
```

---

### API-033: 환불 승인

- **Method**: `POST`
- **Path**: `/api/v1/refunds/{refund_id}/approve`
- **Auth**: ADMIN
- **관련 기능**: FN-

#### Response (200)

```json
{
  "success": true,
  "data": {
    "refund_id": "string",
    "status": "APPROVED",
    "approved_at": "string (ISO 8601)"
  }
}
```

#### Errors

| HTTP | Code | 조건 |
|:----:|------|------|
| 404 | E404 | 환불 내역 없음 |
| 409 | E409 | 이미 처리됨 (APPROVED, REJECTED, COMPLETED) |

---

### API-034: 환불 거절

- **Method**: `POST`
- **Path**: `/api/v1/refunds/{refund_id}/reject`
- **Auth**: ADMIN
- **관련 기능**: FN-

#### Request

```json
{
  "reason": "string (required, 거절 사유)"
}
```

#### Response (200)

```json
{
  "success": true,
  "data": {
    "refund_id": "string",
    "status": "REJECTED",
    "reject_reason": "string",
    "rejected_at": "string (ISO 8601)"
  }
}
```

#### Errors

| HTTP | Code | 조건 |
|:----:|------|------|
| 404 | E404 | 환불 내역 없음 |
| 409 | E409 | 이미 처리됨 |

---

## 6. 가맹점 API

### API-040: 가맹점 등록

- **Method**: `POST`
- **Path**: `/api/v1/merchants`
- **Auth**: MERCHANT, ADMIN
- **관련 기능**: FN-

#### Request

```json
{
  "business_name": "string (required, 상호명)",
  "business_number": "string (required, 사업자등록번호 XXX-XX-XXXXX)",
  "category": "string (required, 업종코드)",
  "representative": "string (required, 대표자명)",
  "phone": "string (required)",
  "address": "string (required)",
  "bank_account": "string (required, 정산 계좌번호)",
  "bank_code": "string (required, 은행코드)"
}
```

#### Response (201)

```json
{
  "success": true,
  "data": {
    "merchant_id": "string (UUID)",
    "business_name": "string",
    "business_number": "string",
    "category": "string",
    "status": "PENDING",
    "created_at": "string (ISO 8601)"
  }
}
```

#### Errors

| HTTP | Code | 조건 |
|:----:|------|------|
| 409 | E409 | 사업자등록번호 중복 |
| 422 | E422-BN | 사업자등록번호 형식 오류 |
| 422 | E422-BV | 사업자등록번호 유효하지 않음 (외부 API 검증 실패) |

---

### API-041: 가맹점 상세 조회

- **Method**: `GET`
- **Path**: `/api/v1/merchants/{merchant_id}`
- **Auth**: USER (공개 정보만), MERCHANT (본인), ADMIN (전체)
- **관련 기능**: FN-

#### Response (200)

```json
{
  "success": true,
  "data": {
    "merchant_id": "string",
    "business_name": "string",
    "business_number": "string (MERCHANT/ADMIN만)",
    "category": "string",
    "representative": "string (MERCHANT/ADMIN만)",
    "phone": "string",
    "address": "string",
    "status": "PENDING | ACTIVE | SUSPENDED | TERMINATED",
    "created_at": "string"
  }
}
```

---

### API-042: 가맹점 목록 조회

- **Method**: `GET`
- **Path**: `/api/v1/merchants`
- **Auth**: USER (공개 목록), MERCHANT (본인), ADMIN (전체)
- **관련 기능**: FN-

#### Query Parameters

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|:----:|------|
| category | string | N | 업종 필터 |
| status | string | N | 상태 필터 |
| search | string | N | 상호명 검색 |
| page | integer | N | 페이지 |
| limit | integer | N | 페이지 크기 |

---

### API-043: 가맹점 정보 수정

- **Method**: `PATCH`
- **Path**: `/api/v1/merchants/{merchant_id}`
- **Auth**: MERCHANT (본인), ADMIN
- **관련 기능**: FN-

#### Request

```json
{
  "phone": "string (optional)",
  "address": "string (optional)",
  "bank_account": "string (optional)",
  "bank_code": "string (optional)"
}
```

#### Response (200)

```json
{
  "success": true,
  "data": {
    "merchant_id": "string",
    "updated_fields": ["string"],
    "updated_at": "string (ISO 8601)"
  }
}
```

---

### API-044: 가맹점 상태 변경

- **Method**: `PATCH`
- **Path**: `/api/v1/merchants/{merchant_id}/status`
- **Auth**: ADMIN
- **관련 기능**: FN-

#### Request

```json
{
  "status": "string (required, ACTIVE | SUSPENDED | TERMINATED)",
  "reason": "string (required, 변경 사유)"
}
```

#### Response (200)

```json
{
  "success": true,
  "data": {
    "merchant_id": "string",
    "previous_status": "string",
    "status": "string",
    "reason": "string",
    "changed_at": "string (ISO 8601)"
  }
}
```

#### Errors

| HTTP | Code | 조건 |
|:----:|------|------|
| 404 | E404 | 가맹점 없음 |
| 409 | E409 | 허용되지 않은 상태 전이 (예: TERMINATED → ACTIVE) |

---

## 7. 정산 API

### API-050: 정산 내역 조회

- **Method**: `GET`
- **Path**: `/api/v1/settlements`
- **Auth**: MERCHANT (본인 가맹점), ADMIN (전체)
- **관련 기능**: FN-

#### Query Parameters

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|:----:|------|
| merchant_id | string | N | 가맹점 필터 (ADMIN) |
| status | string | N | 상태 필터 |
| period_from | string | N | 정산 기간 시작 |
| period_to | string | N | 정산 기간 종료 |
| page | integer | N | 페이지 |
| limit | integer | N | 페이지 크기 |

#### Response (200)

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "settlement_id": "string",
        "merchant_id": "string",
        "period_start": "string (ISO 8601)",
        "period_end": "string (ISO 8601)",
        "total_sales": "integer",
        "total_refunds": "integer",
        "fee": "integer",
        "net_amount": "integer",
        "status": "PENDING | CALCULATED | CONFIRMED | PAID | DISPUTED",
        "created_at": "string"
      }
    ],
    "total": "integer",
    "page": "integer",
    "limit": "integer",
    "totalPages": "integer"
  }
}
```

---

### API-051: 정산 상세 조회

- **Method**: `GET`
- **Path**: `/api/v1/settlements/{settlement_id}`
- **Auth**: MERCHANT (본인), ADMIN
- **관련 기능**: FN-

#### Response (200)

```json
{
  "success": true,
  "data": {
    "settlement_id": "string",
    "merchant_id": "string",
    "merchant_name": "string",
    "period_start": "string",
    "period_end": "string",
    "total_sales": "integer",
    "total_refunds": "integer",
    "fee": "integer",
    "fee_rate": "number (예: 0.03)",
    "net_amount": "integer",
    "status": "string",
    "payments": [
      {
        "payment_id": "string",
        "amount": "integer",
        "paid_at": "string"
      }
    ],
    "confirmed_at": "string | null",
    "paid_at": "string | null"
  }
}
```

---

### API-052: 정산 실행 (일괄)

- **Method**: `POST`
- **Path**: `/api/v1/settlements/execute`
- **Auth**: ADMIN
- **관련 기능**: FN-

#### Request

```json
{
  "period_start": "string (required, ISO 8601)",
  "period_end": "string (required, ISO 8601)",
  "merchant_ids": "string[] (optional, 비어있으면 전체 가맹점)"
}
```

#### Response (201)

```json
{
  "success": true,
  "data": {
    "settlements_created": "integer",
    "total_net_amount": "integer",
    "period": {
      "start": "string",
      "end": "string"
    }
  }
}
```

#### Errors

| HTTP | Code | 조건 |
|:----:|------|------|
| 409 | E409 | 해당 기간 정산이 이미 존재 |
| 422 | E422 | 기간 형식 오류 또는 start > end |

---

### API-053: 정산 확정

- **Method**: `POST`
- **Path**: `/api/v1/settlements/{settlement_id}/confirm`
- **Auth**: ADMIN
- **관련 기능**: FN-

#### Response (200)

```json
{
  "success": true,
  "data": {
    "settlement_id": "string",
    "status": "CONFIRMED",
    "confirmed_at": "string (ISO 8601)"
  }
}
```

#### Errors

| HTTP | Code | 조건 |
|:----:|------|------|
| 404 | E404 | 정산 내역 없음 |
| 409 | E409 | 상태가 CALCULATED가 아님 |

---

## 8. 알림 API

### API-060: 알림 목록 조회

- **Method**: `GET`
- **Path**: `/api/v1/notifications`
- **Auth**: USER (본인), MERCHANT (본인), ADMIN (전체)
- **관련 기능**: FN-

#### Query Parameters

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|:----:|------|
| is_read | boolean | N | 읽음 상태 필터 |
| type | string | N | 알림 유형 필터 |
| page | integer | N | 페이지 |
| limit | integer | N | 페이지 크기 |

#### Response (200)

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "notification_id": "string",
        "type": "CHARGE | PAYMENT | REFUND | SETTLEMENT | MERCHANT | SYSTEM",
        "title": "string",
        "message": "string",
        "is_read": "boolean",
        "reference_id": "string | null",
        "reference_type": "string | null",
        "created_at": "string"
      }
    ],
    "unread_count": "integer",
    "total": "integer",
    "page": "integer",
    "limit": "integer",
    "totalPages": "integer"
  }
}
```

---

### API-061: 알림 읽음 처리

- **Method**: `PATCH`
- **Path**: `/api/v1/notifications/{notification_id}/read`
- **Auth**: USER (본인), MERCHANT (본인), ADMIN (본인)
- **관련 기능**: FN-

#### Response (200)

```json
{
  "success": true,
  "data": {
    "notification_id": "string",
    "is_read": true,
    "read_at": "string (ISO 8601)"
  }
}
```

---

### API-062: 알림 일괄 읽음

- **Method**: `PATCH`
- **Path**: `/api/v1/notifications/read-all`
- **Auth**: USER (본인), MERCHANT (본인), ADMIN (본인)
- **관련 기능**: FN-

#### Response (200)

```json
{
  "success": true,
  "data": {
    "updated_count": "integer"
  }
}
```

---

## API 요약표

| ID | Method | Path | Auth | 모듈 | 설명 |
|----|--------|------|------|------|------|
| API-001 | POST | /auth/register | - | User | 회원가입 |
| API-002 | POST | /auth/login | - | User | 로그인 |
| API-003 | POST | /vouchers | USER, ADMIN | Voucher | 상품권 발급 |
| API-004 | GET | /vouchers/{id} | USER, ADMIN | Voucher | 상품권 상세 |
| API-005 | GET | /vouchers | USER, ADMIN | Voucher | 상품권 목록 |
| API-010 | POST | /vouchers/{id}/charges | USER, ADMIN | Charging | 충전 |
| API-011 | GET | /vouchers/{id}/charges | USER, ADMIN | Charging | 충전 내역 |
| API-020 | POST | /payments | USER | Payment | 결제 |
| API-021 | GET | /payments/{id} | ALL | Payment | 결제 상세 |
| API-022 | GET | /payments | ALL | Payment | 결제 목록 |
| API-023 | POST | /payments/{id}/cancel | USER, ADMIN | Payment | 결제 취소 |
| API-030 | POST | /refunds | USER, ADMIN | Refund | 환불 신청 |
| API-031 | GET | /refunds/{id} | ALL | Refund | 환불 상세 |
| API-032 | GET | /refunds | ALL | Refund | 환불 목록 |
| API-033 | POST | /refunds/{id}/approve | ADMIN | Refund | 환불 승인 |
| API-034 | POST | /refunds/{id}/reject | ADMIN | Refund | 환불 거절 |
| API-040 | POST | /merchants | MERCHANT, ADMIN | Merchant | 가맹점 등록 |
| API-041 | GET | /merchants/{id} | ALL | Merchant | 가맹점 상세 |
| API-042 | GET | /merchants | ALL | Merchant | 가맹점 목록 |
| API-043 | PATCH | /merchants/{id} | MERCHANT, ADMIN | Merchant | 가맹점 수정 |
| API-044 | PATCH | /merchants/{id}/status | ADMIN | Merchant | 가맹점 상태 변경 |
| API-050 | GET | /settlements | MERCHANT, ADMIN | Settlement | 정산 목록 |
| API-051 | GET | /settlements/{id} | MERCHANT, ADMIN | Settlement | 정산 상세 |
| API-052 | POST | /settlements/execute | ADMIN | Settlement | 정산 실행 |
| API-053 | POST | /settlements/{id}/confirm | ADMIN | Settlement | 정산 확정 |
| API-060 | GET | /notifications | ALL | Notification | 알림 목록 |
| API-061 | PATCH | /notifications/{id}/read | ALL | Notification | 알림 읽음 |
| API-062 | PATCH | /notifications/read-all | ALL | Notification | 일괄 읽음 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-19 | 초안 — 28개 API (인증 2, 상품권 3, 충전 2, 결제 4, 환불 5, 가맹점 5, 정산 4, 알림 3) | AI Foundry |
