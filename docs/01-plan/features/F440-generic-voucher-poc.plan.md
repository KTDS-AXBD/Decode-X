---
id: AIF-PLAN-072
sprint: 274
feature: F440
title: Generic Voucher 9번째 도메인 source PoC — withRuleId 재사용 정점
status: active
estimated_hours: 2
created: 2026-05-08
---

# F440 Plan — AIF-PLAN-072

## 목표

LPON 7 + miraeasset-pension 8 도메인 패턴을 **Generic Voucher (합성)** 9번째 도메인으로 확장. **신규 detector 0개** (withRuleId 재사용 9번째 도메인) — 인프라 누적 재활용 7 Sprint 연속 달성 (Sprint 264~269 + 274) + 합성 도메인으로 일반화 가능성 추가 입증.

## 배경

- 8 도메인 활성화 완료 — detector coverage 64.6% → 69.1% (Sprint 269 시점)
- BL_DETECTOR_REGISTRY 31 entries (5 universal + 5 lpon-refund specific + 21 withRuleId 재사용)
- Generic Voucher = LPON pattern 일반화 합성 도메인 — 카드/쿠폰/포인트 도메인의 공통 추상화. 비금융 도메인 재사용 가능성 입증 목적.

## DoD

| # | 항목 | 기준 |
|---|------|------|
| 1 | Plan 문서 (AIF-PLAN-072) | 이 파일 ✅ |
| 2 | source.ts | `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/voucher.ts` (~180 lines, 6 함수 + VoucherError) |
| 3 | tests | `voucher.test.ts` (~200 lines, 18~20 cases, in-memory better-sqlite3) |
| 4 | spec-container | `.decode-x/spec-containers/generic-voucher/` (provenance + rules/V-001~V-006 + runbooks/V-001~V-006 + tests/V-001~V-006 + contract/voucher-contract + voucher-rules.md) — 14 sub-files |
| 5 | DOMAIN_MAP entry | `scripts/divergence/domain-source-map.ts` 9번째 entry — sourceCodeStatus="present", underImplTargets=[6 함수] |
| 6 | REGISTRY 6 entries | `bl-detector.ts` V-001~V-006 mapping (신규 detector 0개) |
| 7 | parser regex | `rules-parser.ts` `V` prefix 확장 `/^(?:BL\|BB\|BP\|BG\|BS\|P\|V)-[A-Z]?\d{1,3}$/` |
| 8 | detect-bl 검증 | `--all-domains` 9 containers 6 BL PRESENCE 자동 입증 (0 ABSENCE markers) |
| 9 | provenance apply | `write-provenance --all-domains --apply` 0 changes (PRESENCE 자연 결과) |
| 10 | typecheck/lint clean | `pnpm typecheck && pnpm lint` 오류 0 |
| 11 | unit test PASS | utils 170/170 → 188+/188+ PASS (V-001~006 +18 cases) |
| 12 | Match ≥ 90% | Gap analysis 통과 |
| 13 | Report (AIF-RPRT-072) | `reports/sprint-274-generic-voucher-poc-2026-05-08.{md,json}` |
| 14 | SPEC §6 Sprint 274 등록 | F440 ✅ DONE 마킹 + Match + 산출물 + 메타 |

## 비즈니스 룰 설계 (합성)

| ID | 조건 | 조건충족 | 결과 | 예외 | 함수 | Detector |
|----|------|---------|------|------|------|:----:|
| V-001 | 바우처 발행 요청 | 발행 한도 ≤ 1,000건 | 발행 처리 | 한도 초과 시 ThresholdExceeded | issueVoucher | ThresholdCheck |
| V-002 | 바우처 사용 요청 | 발행 후 365일 이내 | 사용 처리 | 365일 초과 시 Expired | useVoucher | ThresholdCheck |
| V-003 | 사용 시 잔액 차감 | atomic transaction | balance update + ledger insert | 1건 실패 시 전체 롤백 | redeemVoucher | AtomicTransaction |
| V-004 | 잔액 ≤ 1,000원 | 자동 소멸 | status=destroyed | 미달 시 active 유지 | autoDestroyVoucher | StatusTransition |
| V-005 | 환불 요청 | 사용 0건 + 발행 후 7일 이내 | 전액 환불 | 사용 1건+ 또는 7일 초과 시 reject | refundVoucher | ThresholdCheck |
| V-006 | 양도 요청 | active → transferred 1회 | 양도 처리 | 이미 transferred 시 Locked | transferVoucher | StatusTransition |

## 구현 범위

### 신규 파일 (16개)
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/voucher.ts` (~180 lines)
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/voucher.test.ts` (~200 lines)
- `.decode-x/spec-containers/generic-voucher/provenance.yaml`
- `.decode-x/spec-containers/generic-voucher/rules/voucher-rules.md`
- `.decode-x/spec-containers/generic-voucher/rules/V-{001..006}.md` (6 files)
- `.decode-x/spec-containers/generic-voucher/runbooks/V-{001..006}.md` (6 files)
- `.decode-x/spec-containers/generic-voucher/tests/V-{001..006}.yaml` (6 files)
- `.decode-x/spec-containers/generic-voucher/tests/contract/voucher-contract.yaml`
- `reports/sprint-274-generic-voucher-poc-2026-05-08.md` + `.json`

### 수정 파일 (3개)
- `scripts/divergence/domain-source-map.ts` (DOMAIN_MAP entry 9번째 추가)
- `packages/utils/src/divergence/bl-detector.ts` (REGISTRY V-001~006 추가)
- `packages/utils/src/divergence/rules-parser.ts` (regex V prefix 추가)

## 4-Step 실행

| Step | 시간 | 작업 |
|------|------|------|
| 1 | 0.4h | voucher.ts (6 함수 + VoucherError + better-sqlite3 schema) + voucher.test.ts (18 cases) |
| 2 | 0.5h | spec-container/generic-voucher/ 14 sub-files (provenance + rules + runbooks + tests + contract) |
| 3 | 0.3h | DOMAIN_MAP entry + REGISTRY 6 entries + parser regex V prefix |
| 4 | 0.3h | 검증 (typecheck/lint/test) + detect-bl --all-domains + write-provenance + Report + SPEC §6 + commit |

## 검증 시나리오

### 단위
- voucher.test.ts 18 cases PASS (각 BL별 happy path + edge case + error case)
- bl-detector.test.ts 회귀 0 (170 → 175+ PASS, V-001~006 unit cases 추가)
- rules-parser.test.ts 회귀 0 (V prefix 정확 매칭)

### 통합
- detect-bl --all-domains: 8 → 9 containers, 6 BL V-001~V-006 PRESENCE 자동 입증 (0 ABSENCE)
- write-provenance --all-domains --apply: 0 changes (PRESENCE 자연 결과 — Sprint 263+ 패턴)
- Coverage 변화: 31/48 (64.6%) + 6/6 = 37/54 = **68.5%** (분모 변경 — 신규 도메인 6 BL 추가 가산)

### 회귀
- 기존 8 도메인 detect-bl 결과 동일 (regression 0)
- typecheck/lint clean

## 사용자 결정 (사전)

- 도메인 = **Generic Voucher** (합성, 비금융 일반화 검증)
- 모드 = **Master inline** (~2-3h, 14회 연속 회피 패턴 유지)
- 범위 = **전체 패턴** (source + tests + spec-container + DOMAIN_MAP + REGISTRY + parser)

## 리스크 / 대응

- **R1**: V prefix가 P (pension) prefix와 검증 시 conflict 가능성
  - **대응**: parser regex는 prefix 명시 매칭 (`P\|V`)이므로 conflict 0. 검증: parser unit test "V-001"/"P-001" 양쪽 정확 매칭 유지.
- **R2**: 합성 비즈니스 룰이 LPON 패턴 단순 복제로 보일 가능성
  - **대응**: V-005 환불 조건은 LPON BL-024 (7일)과 같으나 V-001/002/004/006은 LPON 외 일반화 패턴 — 합성이지만 유효한 신규 룰. Plan 본문에 명시.
- **R3**: better-sqlite3 schema 추가가 다른 도메인 schema와 충돌
  - **대응**: voucher 전용 테이블 (`vouchers`, `voucher_ledger_entries`) — 다른 도메인 테이블과 격리. test 내 in-memory DB로 분리.

## 참조

- Sprint 269 F436 (`F436-miraeasset-pension-containers.plan.md`) 8번째 도메인 패턴
- Sprint 264 F431 gift / Sprint 265 F432 settlement / Sprint 266 F433 budget+purchase 7 Sprint 연속 인프라 누적
- Sprint 262 F429 universal detector 3종 (Threshold/Status/Atomic)
- `scripts/divergence/domain-source-map.ts` DOMAIN_MAP 8 entries
- `packages/utils/src/divergence/bl-detector.ts` BL_DETECTOR_REGISTRY 31 entries
