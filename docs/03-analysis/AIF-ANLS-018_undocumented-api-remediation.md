---
code: AIF-ANLS-018
title: LPON 미문서화 외부 API 보완 제안서
version: "1.0"
status: Active
category: Analysis
created: 2026-03-09
updated: 2026-03-09
author: AI Foundry FactCheck Engine
---

# AIF-ANLS-018 — LPON 미문서화 외부 API 보완 제안서

## 1. 배경

AI Foundry FactCheck 엔진이 LPON 온누리상품권 플랫폼의 **소스코드 382건**(API 230 + Table 152)과 **인터페이스 설계서 109건**(API 114 + Table 12)을 대조하여, 인터페이스 설계서에 누락된 외부 API 16건을 식별했다.

### 커버리지 현황

| 관점 | 커버리지 | 산식 | 평가 |
|------|:--------:|------|------|
| 전체 소스 대비 | 30.1% | 115/382 | — |
| **외부 API** | **83.7%** | 103/123 | 양호 |
| 외부 API (유틸 제외) | 86.6% | 103/119 | 양호 |
| 문서→소스 역방향 | 90.4% | 103/114 | 우수 |
| 문서 Table | 100% | 12/12 | 완벽 |

> **참고**: 전체 커버리지 30.1%가 낮아 보이지만, 이는 내부 API 107건(관리/배치/유틸)이 설계서 대상이 아니기 때문이다. 고객 대면 외부 API 기준으로는 83.7~86.6%로 양호한 수준이다.

### 분석 방법

1. **구조적 매칭**: 경로 정규화(exact) + Jaccard 토큰 유사도(fuzzy, threshold ≥ 0.6) → 98건
2. **LLM 시맨틱 매칭**: 미매칭 282건을 Claude Sonnet으로 개별 판별 → 17건 추가 매칭
3. **노이즈 필터링**: test/utility/duplicate API 21건 자동 해소

---

## 2. 미문서화 외부 API 목록 (16건)

### 2.1 카드 관리 — CardController (4건, 우선순위 HIGH)

| # | API Path | Method | 소스 메서드 | 추정 기능 | 보완 우선순위 |
|---|----------|--------|------------|----------|:----------:|
| 1 | `/onnuripay/v1.0/card` | POST | `selectCardList` | 카드 목록 조회 | P1 |
| 2 | `/onnuripay/v1.0/card` | POST | `selectCardAmountList` | 카드별 금액 조회 | P1 |
| 3 | `/onnuripay/v1.0/card` | POST | `registCard` | 카드 등록 | P1 |
| 4 | `/onnuripay/v1.0/card` | POST | `unregistCard` | 카드 해지 | P1 |

**분석**: 동일 경로(`/card`)에 4개 메서드가 매핑된 구조. 카드 CRUD 전체가 설계서에서 누락되어 있으므로 **카드 관리 인터페이스 문서를 신규 작성**해야 한다.

### 2.2 캐시백 — DealController (3건, 우선순위 HIGH)

| # | API Path | Method | 소스 메서드 | 추정 기능 | 보완 우선순위 |
|---|----------|--------|------------|----------|:----------:|
| 5 | `/onnuripay/v1.0/deal/cashBackList` | POST | `cashBackList` | 캐시백 내역 목록 | P1 |
| 6 | `/onnuripay/v1.0/deal/cashBackSetting` | POST | `cashBackSetting` | 캐시백 설정 | P1 |
| 7 | `/onnuripay/v1.0/deal/cashBackDetail` | POST | `cashBackDetail` | 캐시백 상세 | P1 |

**분석**: DealController의 다른 API(거래 내역 등)는 설계서에 기술되어 있으나, 캐시백 관련 3개 API만 누락. **기존 deal 인터페이스 문서에 캐시백 섹션을 추가**하면 된다.

### 2.3 가맹점 — PartiesController (2건, 우선순위 MEDIUM)

| # | API Path | Method | 소스 메서드 | 추정 기능 | 보완 우선순위 |
|---|----------|--------|------------|----------|:----------:|
| 8 | `/onnuripay/v1.0/parties/companySearchCategoryList` | POST | `companySearchCategoryList` | 카테고리별 가맹점 검색 | P2 |
| 9 | `/onnuripay/v1.0/parties/companyLocationByGroup` | POST | `companyLocationByGroup` | 그룹별 가맹점 위치 | P2 |

**분석**: 기존 parties 인터페이스에 가맹점 목록/상세 API는 문서화되어 있으나, 검색/위치 관련 보조 API가 누락. 기존 문서에 검색 API 섹션 추가 권장.

### 2.4 지갑/잔액 — WalletController (2건, 우선순위 HIGH)

| # | API Path | Method | 소스 메서드 | 추정 기능 | 보완 우선순위 |
|---|----------|--------|------------|----------|:----------:|
| 10 | `/onnuripay/v1.0/wallet` | POST | `getBalance` | 잔액 조회 | P1 |
| 11 | `/onnuripay/v1.0/wallet` | POST | `getBalanceCheck` | 잔액 확인(유효성) | P1 |

**분석**: 지갑 잔액 관련 핵심 API. 충전/결제의 선행 조건이 되는 API이므로 P1 우선순위.

### 2.5 원장 — LedgerController (2건, 우선순위 MEDIUM)

| # | API Path | Method | 소스 메서드 | 추정 기능 | 보완 우선순위 |
|---|----------|--------|------------|----------|:----------:|
| 12 | `/onnuripay/v1.0/ledger/refundDetail` | POST | `refundDetail` | 환불 상세 | P2 |
| 13 | `/onnuripay/v1.0/ledger/autoChargeCodeList` | POST | `autoChargeCodeList` | 자동 충전 코드 목록 | P2 |

**분석**: 기존 ledger 인터페이스에 충전/거래 목록은 있으나, 환불 상세와 자동충전 코드 API가 누락.

### 2.6 결제 승인 — ApprovalController (1건, 우선순위 HIGH)

| # | API Path | Method | 소스 메서드 | 추정 기능 | 보완 우선순위 |
|---|----------|--------|------------|----------|:----------:|
| 14 | `/onnuripay/v1.0/approval/gateway` | POST | `gateway` | PG 결제 게이트웨이 | P1 |

**분석**: 결제 게이트웨이 연동 API. 외부 PG사와의 인터페이스이므로 보안/인증 포함 상세 문서화 필요.

### 2.7 계정 — AccountController (1건, 우선순위 LOW)

| # | API Path | Method | 소스 메서드 | 추정 기능 | 보완 우선순위 |
|---|----------|--------|------------|----------|:----------:|
| 15 | `/onnuripay/v1.0/account/innitechCheck` | POST | `test` | 이니텍 연동 체크 | P3 |

**분석**: 메서드명이 `test`이므로 테스트/연동 확인용 API로 추정. 실제 운영에서 사용되는지 확인 후 문서화 여부 결정.

### 2.8 프론트 — FrontController (1건, 우선순위 LOW)

| # | API Path | Method | 소스 메서드 | 추정 기능 | 보완 우선순위 |
|---|----------|--------|------------|----------|:----------:|
| 16 | `/onnuripay/v1.0/front/popupList` | POST | `selectPopupList` | 팝업 목록 조회 | P3 |

**분석**: 앱 프론트엔드 팝업 관련 보조 API. UI 내부용으로 인터페이스 설계서 대상 여부 확인 필요.

---

## 3. 우선순위별 보완 계획

### P1 — 즉시 보완 (10건)

핵심 비즈니스 기능으로, 인터페이스 설계서 미기재 시 외부 연동 시스템에서 참조 불가.

| 도메인 | 건수 | 보완 방법 |
|--------|:----:|----------|
| 카드 관리 | 4 | 인터페이스 설계서 신규 섹션 작성 |
| 캐시백 | 3 | 기존 deal 섹션에 추가 |
| 지갑/잔액 | 2 | 인터페이스 설계서 신규 섹션 작성 |
| 결제 게이트웨이 | 1 | 인터페이스 설계서 신규 섹션 작성 (보안 명세 포함) |

**예상 작업량**: 인터페이스 설계서 4개 섹션 신규/추가, 약 2~3일

### P2 — 다음 스프린트 보완 (4건)

기존 문서에 보조 API를 추가하는 수준.

| 도메인 | 건수 | 보완 방법 |
|--------|:----:|----------|
| 가맹점 검색 | 2 | 기존 parties 섹션에 추가 |
| 원장 상세 | 2 | 기존 ledger 섹션에 추가 |

**예상 작업량**: 기존 문서 4건 업데이트, 약 1일

### P3 — 검토 후 결정 (2건)

테스트/유틸 성격이 강하여 문서화 대상 여부 확인 필요.

| 도메인 | 건수 | 판단 기준 |
|--------|:----:|----------|
| 이니텍 연동 체크 | 1 | 운영 환경 호출 여부 확인 |
| 팝업 목록 | 1 | 외부 연동 시스템 사용 여부 확인 |

---

## 4. 보완 시 권장 문서 형식

각 API에 대해 아래 항목을 인터페이스 설계서에 기술할 것을 권장한다:

```
인터페이스 ID: IF-LPON-{SEQ}
API Path: /onnuripay/v1.0/{domain}/{endpoint}
HTTP Method: POST
요청 파라미터:
  - (소스코드 @RequestBody 기반 역공학 필요)
응답 형식:
  - (소스코드 returnType 기반 역공학 필요)
인증: (Bearer Token / Session / API Key)
비고: AI Foundry FactCheck 자동 탐지 (AIF-ANLS-018)
```

> **참고**: 요청/응답 파라미터 상세는 소스코드의 VO 클래스와 Controller 메서드 시그니처에서 역공학으로 추출 가능하다. AI Foundry의 Stage 2 (Structure Extraction)이 이 정보를 이미 보유하고 있다.

---

## 5. 보완 후 예상 커버리지

| 시나리오 | 외부 API 커버리지 | 전체 커버리지 |
|---------|:-----------------:|:------------:|
| 현재 (as-is) | 83.7% (103/123) | 30.1% |
| P1 보완 후 | **91.9%** (113/123) | 32.7% |
| P1+P2 보완 후 | **95.1%** (117/123) | 33.8% |
| 전체 보완 후 | **96.7%** (119/123) | 34.8% |

> P3 2건은 테스트/유틸 성격이므로 보완하더라도 문서화 대상에서 제외할 수 있다.

---

## 6. 부록: 내부 API 현황 (참고)

내부 API 107건은 인터페이스 설계서 대상이 아니지만, 참고용으로 도메인별 분포를 기록한다.

| 도메인 | 건수 | 대표 Controller | 성격 |
|--------|:----:|----------------|------|
| 포인트 허브 | 11 | PointHubController | 포인트 적립/사용 내부 로직 |
| 관리/수동 | 9 | ManualController | 운영자 수동 처리 |
| 정산/뱅킹 | 15 | SettleBankController, OpenBankController | 은행 연동 배치 |
| 배치/스케줄 | 6 | ExtBatchController | 스케줄 작업 |
| 메시지 | 7 | ProducerScheduleRestController 외 | 푸시 알림 |
| 충전(내부) | 10 | ComChargeController, ChargeController | B2B 충전 처리 |
| 선물(내부) | 6 | ComGiftController | B2B 선물 처리 |
| 회원(내부) | 4 | MemberController | 내부 회원 관리 |
| 인증(내부) | 3 | KmcController | 본인인증 연동 |
| 기타 | 36 | CommonController 외 | 유틸/보조 |
