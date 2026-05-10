---
id: AIF-DSNG-114
sprint: 316
feature: F482
title: F482 Design — lpon-settlement BL-031/032 + lpon-gift BL-G001 detector 매핑
status: active
created: 2026-05-10
plan_ref: AIF-PLAN-114
---

# F482 Design — lpon-settlement/gift Gap Fill

## §1 목표

BL_DETECTOR_REGISTRY에 BL-031/032 (lpon-settlement atomic) + BL-G001 (lpon-gift ABSENCE) 3 entry 추가.
detect-bl coverage 95.0% → **98.1%** (+1.2%pp via Sprint 315 F481 chain).

## §2 변경 파일 목록

| 파일 | 변경 유형 | 내용 |
|------|----------|------|
| `packages/utils/src/divergence/bl-detector.ts` | 수정 | BL_DETECTOR_REGISTRY에 BL-031/BL-032/BL-G001 3 entry 추가 + detectGiftImplementation 신규 함수 |
| `packages/utils/test/bl-detector.test.ts` | 수정 | 247→250 sorted array 갱신 + BL-031/032 PRESENCE × 2 + BL-G001 ABSENCE × 1 (3 test cases) |

## §3 구현 세부

### bl-detector.ts 변경

**detectGiftImplementation** (신규 함수, ~25 lines):
- 검출 조건: `sendGift` 또는 `createGift` 함수 식별자가 sourceFile AST에 존재 → PRESENCE (0 markers)
- 미존재 시 → 1 marker (ABSENCE, BL-G001)
- 위치: `detectAtomicTransaction` 함수 이후에 추가

**BL_DETECTOR_REGISTRY 추가** (Sprint 316 F482 주석 블록):
```typescript
// Sprint 316 (F482) — lpon-settlement BL-031/032 + lpon-gift BL-G001 gap fill
// BL-031: runBatchSettlement 안 db.transaction(UPSERT) — atomic
// BL-032: settlement.ts 내 추가 atomic 패턴 (heuristic)
// BL-G001: gift.ts에 sendGift/createGift 미구현 → ABSENCE marker
"BL-031": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BL-031"),
"BL-032": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BL-032"),
"BL-G001": (sf, fn) => withRuleId(detectGiftImplementation(sf, fn), "BL-G001"),
```

**detectGiftImplementation** 검출 로직:
1. `ts.SourceFile` 전체 AST에서 FunctionDeclaration / ArrowFunction / FunctionExpression 탐색
2. 함수명이 `sendGift` 또는 `createGift`이면 `foundImpl = true`
3. `foundImpl == false` → 1 marker 반환 (ABSENCE)
4. `foundImpl == true` → 0 markers 반환 (PRESENCE)

### bl-detector.test.ts 변경

**sorted array 갱신** (line 680 근처):
- `"exposes 247 detectors"` → `"exposes 250 detectors"`
- 배열에 `"BL-031"`, `"BL-032"`, `"BL-G001"` 순서 삽입

**신규 describe 블록** (파일 맨 끝 before closing):
```typescript
describe("BL-031~032 + BL-G001 — settlement/gift gap fill (Sprint 316 F482)", () => {
  const settlementWithAtomicSrc = `...`; // db.transaction 포함 settlement 소스
  
  it("BL-031 PRESENCE — db.transaction(UPSERT) → 0 markers", ...);
  it("BL-032 PRESENCE — db.transaction 존재 → 0 markers", ...);
  it("BL-G001 ABSENCE — sendGift 미구현 → 1 marker with ruleId BL-G001", ...);
});
```

## §4 Gap Analysis 기준

| 체크포인트 | 기준 |
|-----------|------|
| BL_DETECTOR_REGISTRY 247→250 | 3 entry 추가 (BL-031/032/G001) |
| tests 353→356 PASS | +3 cases (2 PRESENCE + 1 ABSENCE) |
| typecheck PASS | tsc --noEmit (turbo bypass, S337) |
| detect-bl coverage | 255/260 = 98.1% (F481 완료 가정) |

## §5 Worker 매핑 (단일 구현)

단일 파일 2개 수정, Worker 병렬화 불필요.
