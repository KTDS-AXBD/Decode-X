---
sprint: 1
task: B-1
title: 충전 서비스 범위 확정 + LPON 자산 매핑
created: 2026-04-19
---

# Sprint 1 B-1 — 충전·충전취소 서비스 범위

## 1. 서비스 정의 (Tier-A 충전 도메인)

| 서비스 | 설명 | LPON 정책 수 (추정) |
|--------|------|:-------------------:|
| **충전** (Top-up) | 이용자/회사가 출금계좌 → LPON 잔액 충전 | ~24건 |
| **충전취소** (Cancel) | 충전 확정 후 취소·환불 처리 | ~15건 |
| **자동충전** (Auto Top-up) | 잔액/일자 조건 기반 자동 충전 | ~10건 |
| **소계** | | **~49건** |

## 2. LPON 기존 자산 매핑

| 자산 유형 | 전체 수 | 충전 도메인 추정 |
|-----------|:-------:|:----------------:|
| Skills | 859 | 49건 |
| Policies | 848 | 44건 (추출됨: BL-001~047) |
| Terms | 7,332 | 충전 관련 ~200건 |
| Gap 리포트 | 1건 | 충전 섹션 포함 |

**출처 문서**: `반제품-스펙/pilot-lpon-cancel/01-business-logic.md` (§시나리오 1~2)

## 3. 핵심 API

| API | 용도 | 호출 주체 |
|-----|------|----------|
| `/money/withdraw` | 출금계좌 출금 | Charge Service → Money Platform |
| `/money/withdrawStatus` | 출금 상태조회 (타임아웃 대응) | Charge Service |
| `/money/chargeCancel` | 충전 취소 | CancelCharge Service |

## 4. 데이터 테이블

- `charge_transactions` — 충전 원장
- `vouchers` — 잔액
- `withdrawal_transactions` — 출금 원장
- `refund_transactions` — 환불 원장
