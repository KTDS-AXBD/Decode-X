---
id: AIF-RPRT-048
title: Sprint 251 F359 PDCA 완결 보고서
type: report
analysis: AIF-ANLS-048
sprint: 251
verdict: PASS
match_rate: 100
created: 2026-05-04
---

# AIF-RPRT-048: Sprint 251 F359 완결 보고서

## 요약

| 항목 | 결과 |
|---|---|
| Sprint | 251 |
| F-item | F359 |
| Match Rate | **100%** |
| round-trip implementedRate | **100%** (12/12, 베이스라인 91.7%에서 회복) |
| typecheck | PASS |
| TD-22 | ✅ 해소 |
| TD-23 | ✅ 해소 |
| 소요 시간 | ~2h |

## 달성 항목

### 4 Sub-task 전체 완결
1. **(a) comparator 8 keys**: 3 real keys 실 DB 검증 전환 + 5 stub keys STUB_PENDING 명시화
2. **(b) TD-23**: `RefundResult.rfndPsbltyYn` domain 반환값으로 교체 (runner 하드코딩 제거)
3. **(c) BL-028 cashback**: `vouchers.cashback_amount` 컬럼 migration + exclusion 산출 공식 (×1.1)
4. **(d) BL-020 종합**: BL-024(7일) + BL-025(60% 사용) + BL-029(만료) 구현

### DoD 체크리스트
- [x] round-trip implementedRate ≥95% → **100%** 달성
- [x] 8 keys silent PASS 0건 (3건 실 검증, 5건 STUB_PENDING 명시)
- [x] TD-22 + TD-23 SPEC §8 ✅ 마킹
- [x] BL-028 cashback migration (`0002_cashback.sql`) 적용
- [x] working-version typecheck PASS
- [x] Match Rate ≥90% → **100%**

## 핵심 변경 사항

| 파일 | 변경 내용 |
|---|---|
| `반제품-스펙/.../migrations/0002_cashback.sql` | `vouchers.cashback_amount` 컬럼 신규 |
| `반제품-스펙/.../domain/refund.ts` | BL-020/024/025/028/029 + rfndPsbltyYn |
| `scripts/roundtrip-verify/fixtures.ts` | 전체 migration 적용 + remainingBalance alias + cashbackUsed 픽스처 |
| `scripts/roundtrip-verify/runner.ts` | rfndPsbltyYn 제거 + refundType 전달 + DB 읽기 |
| `scripts/roundtrip-verify/comparator.ts` | 3 real keys 실 검증 + rfndPsbltyYn fallback 정리 |
| `scripts/roundtrip-verify/types.ts` | STUB_PENDING FailReason 추가 |

## 교훈

- **Source-First 원칙 재확인**: domain 반환값이 아닌 test harness가 값을 주입하면 실제 도메인 로직 검증이 누락됨. TD-23이 이 패턴의 교과서적 사례
- **fixture alias 중요성**: `remainingBalance`와 `voucherBalance`처럼 contract YAML의 given 필드명이 내부 픽스처 키와 불일치하면 테스트가 의도와 다른 상태로 실행됨 (TC-REFUND-003의 balance=35000 의도 미반영이었던 점)
- **cashback × 1.1 공식**: 비즈니스 룰 명시화 과정에서 `5000 → 5500` 변환 공식을 역추출(10% 취급수수료)하여 contract 값과 일치 확인 — 역공학 방식의 PoC 성격을 잘 보여줌
