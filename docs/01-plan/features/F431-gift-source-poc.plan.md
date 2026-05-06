---
id: AIF-PLAN-062
title: "F431 — gift source PoC (5 BL G002~G006 PRESENCE 입증, detector coverage 31.6→44.7%)"
sprint: 264
f_items: [F431]
req: AIF-REQ-035
related_features: [F354, F426, F427, F428, F429, F430]
status: PLANNED
created: "2026-05-06"
author: "Master (session 276, Sprint 264)"
related: [AIF-PLAN-059, AIF-PLAN-060, AIF-PLAN-061]
---

# F431 — gift source PoC

## Background

Sprint 261(F428)에서 multi-domain rules.md parser 검증 시 7 spec-containers 38 BL 중 **gift 도메인 6 BL(G001~G006)은 source code 부재**로 PRESENCE 자동 입증 불가 — `DOMAIN_MAP`에 `sourceCodeStatus: "spec-only"` 명시. Sprint 262(F429)의 보편 detector 3종(Threshold/Status transition/Atomic transaction) 도입 후 "gift/settlement source 작성 시 도달 가능 명시" — F431이 그 후속.

**현 상태 진단** (Sprint 263 종결 시점):

- detector REGISTRY: **12종** (5 specific + 3 universal × 매핑 helper).
- coverage: **31.6%** (12/38 BL, refund 5 + charge 4 + payment 3).
- spec-only 6 BL: gift 6(G001~G006) + settlement 6(BL-031~036) + budget 8(BL-041~048) + purchase 7(BL-021~027 sample).
- source 작성 ROI: gift 6 BL 중 5 BL(G002~G006)은 status transition + atomic transaction 패턴이 명확 — **detector 무수정 입증 가능**.

**가치**:

1. detector coverage **31.6% → 44.7%** (+13.1%p, 17/38 BL) — Sprint 262 정량 분석에서 예측한 도달치 실증.
2. **detector 12종의 cross-domain 일반성 입증** — refund 도메인 외에서도 false positive 없이 PRESENCE catch (Sprint 262 charge/payment에 이어 3번째 도메인).
3. lpon-gift `provenance.yaml`의 BL-G002~G006 status를 **OPEN → RESOLVED**로 일괄 전환 — F430 (Sprint 263) write-provenance CLI 재사용 1회 입증.
4. F354 자동화 5/5 (Sprint 260) + F428~F430 인프라 재활용 → **Master inline 12회 연속 회피 패턴 유지**.

## Objective

본 Sprint의 DoD:

- (a) `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/gift.ts` 신규 — 5 함수 (acceptGift/rejectGift/expireGift/cancelGift/transferGiftBalance).
- (b) `반제품-스펙/pilot-lpon-cancel/working-version/tests/gift.test.ts` 신규 — vitest, in-memory better-sqlite3, ≥10 단위 테스트.
- (c) `scripts/divergence/domain-source-map.ts` 갱신 — lpon-gift entry `sourcePath` null → 실 경로, `sourceCodeStatus` "spec-only" → "present", `underImplTargets` 화이트리스트.
- (d) `packages/utils/src/divergence/bl-detector.ts` `BL_DETECTOR_REGISTRY` 갱신 — 5 신규 매핑 (G002~G005 → statusTransitionDetector, G006 → atomicTransactionDetector). `DETECTOR_SUPPORTED_RULES` Set에 5건 추가.
- (e) `packages/utils/test/bl-detector.test.ts` 갱신 — gift fixture 5 케이스 추가 (positive PRESENCE).
- (f) `npx tsx scripts/divergence/detect-bl.ts --all-domains` 실측 → gift 5 BL PRESENCE 자동 입증 + coverage **17/38 = 44.7%** 검증.
- (g) `reports/sprint-264-gift-source-poc-2026-05-06.{json,md}` 실파일.
- (h) `npx tsx scripts/divergence/write-provenance.ts --container lpon-gift --apply` 실행 → BL-G002~G006 status update + idempotency 재실행 0 changes 검증.
- (i) Match Rate ≥ 90% + typecheck/lint/test (`utils` 패키지 + `working-version` 패키지) 전체 PASS.

## Scope

### In Scope
- gift.ts source code (5 함수, ~150~200 lines, refund.ts/charging.ts 패턴 일관).
- gift.test.ts (vitest, in-memory sqlite, 합성 schema CREATE TABLE in setup).
- DOMAIN_MAP + bl-detector REGISTRY 매핑 갱신.
- detect-bl --all-domains 실측 + reports.
- provenance.yaml apply (lpon-gift, F430 CLI 재사용).
- SPEC.md §5/§6 갱신.

### Out of Scope
- BL-G001 (선물 발송 시작) detector 매핑 — **사용자 결정 (Skip)**: "잔액 ≤ 발송자 AND 수신자 유효" 검증 + INSERT는 명확한 detector pattern 부재, false positive 위험. 5 BL 입증으로 +13%p 목표 충족.
- 실 schema migration (`migrations/0003_gift.sql`) — PoC 범위 외, working-version PoC 풀 스택 동작 불요. **사용자 결정 (Code+Test 두 축)**.
- gift-rules.md 보강 — 기존 6 BL 그대로 사용.
- settlement/budget/purchase 도메인 source 작성 — 차기 Sprint 후보 (각각 6/8/7 BL 추가 가능).
- Foundry-X handoff 검증 — 본 PoC는 detector 입증에 집중.

## Implementation Plan

### Step 1: Plan + SPEC §6 등록 (0.5h)
- 본 문서 commit.
- SPEC.md §6 Sprint 264 블록 신규 + §7 F431 추가 + §1/§5 Last Updated 갱신.

### Step 2: gift.ts source 작성 (3h)
- 5 함수:
  - `acceptGift(db, giftId, receiverId)` — BL-G002: status pending→accepted, balance transfer, GiftAccepted event.
  - `rejectGift(db, giftId, receiverId)` — BL-G003: status pending→rejected, sender balance restore, GiftRejected event.
  - `expireGift(db, giftId)` — BL-G004: expires_at < NOW + status pending→expired, sender balance restore.
  - `cancelGift(db, giftId, senderId)` — BL-G005: status pending→canceled, sender balance restore, HTTP 422 if accepted.
  - `transferGiftBalance(db, senderId, receiverId, amount)` — BL-G006: db.transaction()에서 sender 차감 + receiver 증가 + ledger 2행 INSERT.
- `GiftError` class (refund.ts/charging.ts 패턴).
- 합성 schema 가정: `gift_transactions(id, sender_id, receiver_id, amount, status, expires_at, created_at, updated_at)`, `gift_ledger_entries(id, gift_id, account_id, direction, amount, created_at)`, `vouchers(id, user_id, balance)`.

### Step 3: gift.test.ts 작성 (1.5h)
- vitest, in-memory better-sqlite3.
- setup: 합성 schema CREATE TABLE + seed 2 vouchers (sender 100,000 / receiver 0).
- 케이스 ≥10:
  1. acceptGift PASS — pending→accepted, receiver +amount, sender 0 (이미 차감됨).
  2. acceptGift FAIL — already accepted → HTTP 422.
  3. acceptGift FAIL — expired → HTTP 422.
  4. rejectGift PASS — pending→rejected, sender restored.
  5. expireGift PASS — expires_at past + pending → expired, sender restored.
  6. expireGift no-op — already accepted (ES-GIFT-001 보호).
  7. cancelGift PASS — pending → canceled, sender restored.
  8. cancelGift FAIL — accepted → HTTP 422 (ES-GIFT-002).
  9. transferGiftBalance atomic — 2 ledger rows + sender/receiver balance.
  10. transferGiftBalance rollback — partial fail (e.g., receiver vouchers update 실패) → 전체 롤백.

### Step 4: DOMAIN_MAP + bl-detector + 단위 테스트 갱신 (1h)
- `domain-source-map.ts` lpon-gift entry sourcePath/sourceCodeStatus 활성화 + underImplTargets 5 함수 화이트리스트.
- `bl-detector.ts` `BL_DETECTOR_REGISTRY` 5 신규 매핑 (G002~G005 status transition, G006 atomic transaction).
- `DETECTOR_SUPPORTED_RULES` Set에 5건 push.
- `bl-detector.test.ts` gift fixture 5 케이스 (positive PRESENCE 매칭 검증).

### Step 5: detect-bl 실측 + provenance.yaml apply (1h)
- `cd packages/utils && pnpm test` (130~140 PASS).
- `pnpm typecheck && pnpm lint`.
- `npx tsx scripts/divergence/detect-bl.ts --all-domains` → gift 5 BL PRESENCE 출력 검증.
- `npx tsx scripts/divergence/write-provenance.ts --container lpon-gift --dry-run` → diff 미리보기.
- `npx tsx scripts/divergence/write-provenance.ts --container lpon-gift --apply` → BL-G002~G006 status update.
- `git diff .decode-x/spec-containers/lpon-gift/provenance.yaml` 검증.
- idempotency: `--apply` 재실행 → 0 changes.
- `reports/sprint-264-gift-source-poc-2026-05-06.{json,md}` 작성 (Sprint 261/262 패턴).

### Step 6: Analysis + Report + commit (1h)
- `docs/03-analysis/features/F431-gift-source-poc.analysis.md` (AIF-ANLS-062).
- `docs/04-report/features/F431-gift-source-poc.report.md` (AIF-RPRT-062).
- SPEC.md §6 Sprint 264 [x] 마킹, §1/§5 갱신.
- MEMORY.md 활성 작업 갱신.
- Conventional commit: `feat: Sprint 264 — F431 gift source PoC (5 BL G002~G006 PRESENCE 입증, detector coverage 31.6→44.7%)`.
- `git push`.

## DoD

- ✅ gift.ts (5 함수, ~150-200 lines) + GiftError
- ✅ gift.test.ts (≥10 시나리오 PASS)
- ✅ DOMAIN_MAP lpon-gift entry sourcePath/sourceCodeStatus/underImplTargets 활성화
- ✅ BL_DETECTOR_REGISTRY 5 신규 매핑 (G002~G005 status transition, G006 atomic) + DETECTOR_SUPPORTED_RULES 5건 추가
- ✅ bl-detector.test.ts gift fixture 5 케이스 추가 (PRESENCE positive)
- ✅ detect-bl --all-domains 실측 → gift 5 BL PRESENCE 자동 입증 + coverage 31.6% → 44.7% 검증
- ✅ provenance.yaml apply → BL-G002~G006 OPEN → RESOLVED + idempotency 재실행 0 changes
- ✅ Match Rate ≥ 90% + typecheck/lint/test 전부 green
- ✅ AIF-PLAN/ANLS/RPRT-062 + reports JSON+MD 실파일

## Risk

- **R1**: gift 도메인 합성 schema 가정과 실 lpon-gift 운영 schema 차이 — PoC 범위 외이지만, 차기 실 schema 도래 시 함수 시그니처 일부 변경 가능. 대응: schema 의존부(prepared statements)는 변수화, 비즈니스 룰 매핑(status/event)은 schema 독립.
- **R2**: detector 12종 pattern matching이 gift.ts 5 함수에 false positive — Sprint 261 BL-027 false positive 회피 패턴(underImplTargets 화이트리스트) 재사용. mockGiftApi 같은 helper는 화이트리스트 외부.
- **R3**: provenance.yaml apply 후 Sprint 263 lpon-refund 패턴과 다른 yaml 들여쓰기/주석 형태로 변형 — Sprint 263 단위 테스트 18건이 들여쓰기/헤더 주석 보존 검증함. dry-run 출력 시각 확인으로 회귀 없음 검증.
- **R4**: Atomic transaction detector (BL-G006)가 `db.transaction(()=>{ ... })` 콜백 외 다른 패턴(예: prepared BEGIN/COMMIT 분리) 사용 시 미매칭. 대응: refund.ts/charging.ts 일관 패턴 그대로 사용 → 매칭 보장.

## References

- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/refund.ts` (252 lines, BL 매핑 패턴 reference)
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/charging.ts` (174 lines, db.transaction 패턴 reference)
- `.decode-x/spec-containers/lpon-gift/rules/gift-rules.md` (6 BL 정의)
- `packages/utils/src/divergence/bl-detector.ts` (12 detector REGISTRY + 3 universal pattern)
- `scripts/divergence/domain-source-map.ts` (DOMAIN_MAP, lpon-gift entry)
- `scripts/divergence/write-provenance.ts` (F430, --apply 게이트)
- AIF-PLAN-059~061 (Sprint 261~263, multi-domain detector + provenance writer 시리즈)
