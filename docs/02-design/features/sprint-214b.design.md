# Sprint 214b Design — lpon-payment + lpon-refund Spec Containers

**Sprint**: 214b
**작성일**: 2026-04-20

---

## §1. 아키텍처 개요

lpon-charge 패턴을 완전 재활용. 두 Spec Container를 동일 구조로 생성.

```
.decode-x/spec-containers/
├── lpon-charge/          ← 기존 (Sprint 1 완료)
├── lpon-payment/         ← 신규 (이번 Sprint)
│   ├── provenance.yaml
│   ├── rules/
│   │   ├── payment-rules.md       # BL-013~019 테이블
│   │   └── ES-PAYMENT-001~005.md  # 5개 Empty Slot
│   ├── runbooks/
│   │   └── ES-PAYMENT-001~005.md  # 운영 가이드
│   └── tests/
│       ├── ES-PAYMENT-001~005.yaml
│       └── contract/payment-contract.yaml
└── lpon-refund/          ← 신규 (이번 Sprint)
    ├── provenance.yaml
    ├── rules/
    │   ├── refund-rules.md        # BL-020~030 테이블
    │   └── ES-REFUND-001~005.md   # 5개 Empty Slot
    ├── runbooks/
    │   └── ES-REFUND-001~005.md
    └── tests/
        ├── ES-REFUND-001~005.yaml
        └── contract/refund-contract.yaml
```

---

## §2. lpon-payment Empty Slot 목록

| ES ID | 제목 | BL 근거 | 유형 | 위험도 |
|-------|------|---------|------|--------|
| ES-PAYMENT-001 | 결제 멱등성 — 중복 결제 방지 | BL-014 (정상흐름 only) | E4 | High |
| ES-PAYMENT-002 | CARD 카드사 승인 실패 재시도 정책 | BL-016 (재시도 기준 미정의) | E4 | High |
| ES-PAYMENT-003 | MIXED 결제 부분 실패 처리 | BL-016/017 (카드+현금 일부 실패) | E3 | High |
| ES-PAYMENT-004 | SMS 발송 실패 비즈니스 영향 | BL-015 (실패 시 미정의) | E2 | Medium |
| ES-PAYMENT-005 | 탈퇴 회원 결제취소 AP06 API 실패 처리 | BL-019 (수기처리 기준 미정의) | E4 | High |

---

## §3. lpon-refund Empty Slot 목록

| ES ID | 제목 | BL 근거 | 유형 | 위험도 |
|-------|------|---------|------|--------|
| ES-REFUND-001 | 환불가능여부(rfndPsbltyYn) 자동 판정 기준 | BL-020 (판정 로직 미정의) | E1 | High |
| ES-REFUND-002 | 캐시백/할인보전 환불불가 시 대안 처리 | BL-026 (대안 미정의) | E3 | Medium |
| ES-REFUND-003 | 환불계좌 오류 재처리 플로우 | BL-027 (재처리 미정의) | E4 | High |
| ES-REFUND-004 | 강제환불 권한 및 감사 로그 | BL-029 (강제환불 미정의) | E4 | High |
| ES-REFUND-005 | 제외금액 산정 상세 공식 | BL-028 (공식 미정의) | E1 | Medium |

---

## §4. 출처 추적 전략 (provenance.yaml)

두 Container 모두 `type: reverse-engineering` + `type: ai-foundry-policy-db` 2종 소스 기재.
confidence: 0.85 (TypeScript 소스 기반) — charge의 0.92보다 낮은 이유: 결제취소/강제환불 등 일부 BL이 [미정의] 상태.

---

## §5. Worker 파일 매핑 (구현 대상)

| 파일 | 설명 |
|------|------|
| `.decode-x/spec-containers/lpon-payment/provenance.yaml` | 신규 |
| `.decode-x/spec-containers/lpon-payment/rules/payment-rules.md` | 신규 |
| `.decode-x/spec-containers/lpon-payment/rules/ES-PAYMENT-001.md` | 신규 |
| `.decode-x/spec-containers/lpon-payment/rules/ES-PAYMENT-002.md` | 신규 |
| `.decode-x/spec-containers/lpon-payment/rules/ES-PAYMENT-003.md` | 신규 |
| `.decode-x/spec-containers/lpon-payment/rules/ES-PAYMENT-004.md` | 신규 |
| `.decode-x/spec-containers/lpon-payment/rules/ES-PAYMENT-005.md` | 신규 |
| `.decode-x/spec-containers/lpon-payment/runbooks/ES-PAYMENT-001.md` | 신규 |
| `.decode-x/spec-containers/lpon-payment/runbooks/ES-PAYMENT-002.md` | 신규 |
| `.decode-x/spec-containers/lpon-payment/runbooks/ES-PAYMENT-003.md` | 신규 |
| `.decode-x/spec-containers/lpon-payment/runbooks/ES-PAYMENT-004.md` | 신규 |
| `.decode-x/spec-containers/lpon-payment/runbooks/ES-PAYMENT-005.md` | 신규 |
| `.decode-x/spec-containers/lpon-payment/tests/ES-PAYMENT-001.yaml` | 신규 |
| `.decode-x/spec-containers/lpon-payment/tests/ES-PAYMENT-002.yaml` | 신규 |
| `.decode-x/spec-containers/lpon-payment/tests/ES-PAYMENT-003.yaml` | 신규 |
| `.decode-x/spec-containers/lpon-payment/tests/ES-PAYMENT-004.yaml` | 신규 |
| `.decode-x/spec-containers/lpon-payment/tests/ES-PAYMENT-005.yaml` | 신규 |
| `.decode-x/spec-containers/lpon-payment/tests/contract/payment-contract.yaml` | 신규 |
| `.decode-x/spec-containers/lpon-refund/provenance.yaml` | 신규 |
| `.decode-x/spec-containers/lpon-refund/rules/refund-rules.md` | 신규 |
| `.decode-x/spec-containers/lpon-refund/rules/ES-REFUND-001.md` | 신규 |
| `.decode-x/spec-containers/lpon-refund/rules/ES-REFUND-002.md` | 신규 |
| `.decode-x/spec-containers/lpon-refund/rules/ES-REFUND-003.md` | 신규 |
| `.decode-x/spec-containers/lpon-refund/rules/ES-REFUND-004.md` | 신규 |
| `.decode-x/spec-containers/lpon-refund/rules/ES-REFUND-005.md` | 신규 |
| `.decode-x/spec-containers/lpon-refund/runbooks/ES-REFUND-001.md` | 신규 |
| `.decode-x/spec-containers/lpon-refund/runbooks/ES-REFUND-002.md` | 신규 |
| `.decode-x/spec-containers/lpon-refund/runbooks/ES-REFUND-003.md` | 신규 |
| `.decode-x/spec-containers/lpon-refund/runbooks/ES-REFUND-004.md` | 신규 |
| `.decode-x/spec-containers/lpon-refund/runbooks/ES-REFUND-005.md` | 신규 |
| `.decode-x/spec-containers/lpon-refund/tests/ES-REFUND-001.yaml` | 신규 |
| `.decode-x/spec-containers/lpon-refund/tests/ES-REFUND-002.yaml` | 신규 |
| `.decode-x/spec-containers/lpon-refund/tests/ES-REFUND-003.yaml` | 신규 |
| `.decode-x/spec-containers/lpon-refund/tests/ES-REFUND-004.yaml` | 신규 |
| `.decode-x/spec-containers/lpon-refund/tests/ES-REFUND-005.yaml` | 신규 |
| `.decode-x/spec-containers/lpon-refund/tests/contract/refund-contract.yaml` | 신규 |
