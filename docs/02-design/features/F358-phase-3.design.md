---
id: AIF-DSGN-056
title: "F425 Design — F358 Phase 3a 산출물 구조 + reconcile sanity + F354 자동화 분류"
sprint: 258
f_items: [F425]
req: AIF-REQ-035
plan: AIF-PLAN-056
td: [TD-24, TD-28]
status: Active
created: "2026-05-05"
author: "Master (session 270, Sprint 258)"
---

# F425 Design — F358 Phase 3a 설계

## §1 개요

Sprint 258은 코드 변경 0~최소(분석 문서 + reports/ 산출만 의도). 따라서 본 Design은 **산출물 schema + 측정 절차 + 분석 분류 기준** 정의가 핵심.

## §2 산출물 schema

### 2.1 `reports/sprint-258-drift-quantification-2026-05-05.json`

```jsonc
{
  "sprint": 258,
  "fItem": "F425",
  "measuredAt": "2026-05-05T...",
  "samples": [
    {
      "file": "PaymentController.java",
      "complexity": "simple",
      "regexResult": {
        "controllers": 1, "endpoints": 4,
        "issuesDetected": ["base_path_missing"]
      },
      "treeSitterResult": {
        "controllers": 1, "endpoints": 4,
        "endpointsFullPath": ["/api/v1/lpon/payment/charge", "/api/v1/lpon/payment/balance/{accountNo}", "..."],
        "issuesDetected": []
      },
      "driftRegression": {
        "base_path_missing": "RESOLVED",
        "path_incomplete": "n/a",
        "return_type_generic_loss": "n/a",
        "mapper_skipped": "n/a"
      }
    }
    // ... 5 samples 누적
  ],
  "summary": {
    "totalSamples": 5,
    "siltentDriftPoCCount": 17,
    "siltentDriftCurrentCount": 0,
    "regressionStatus": "PASS",
    "byCategory": {
      "base_path_missing": { "poc": 2, "current": 0 },
      "path_incomplete": { "poc": 7, "current": 0 },
      "return_type_generic_loss": { "poc": 7, "current": 0 },
      "mapper_skipped": { "poc": 1, "current": 0 }
    }
  },
  "reconcileSanity": {
    "mockDocSpec": "5 endpoints with 2 missing in source + 1 paramCount diff",
    "markersProduced": { "SOURCE_MISSING": 0, "DOC_ONLY": 2, "DIVERGENCE": 1 },
    "status": "PASS"
  }
}
```

### 2.2 `reports/sprint-258-drift-quantification-2026-05-05.md`

- §1 측정 요약 표
- §2 5 샘플 endpoint full path 검증
- §3 reconcile sanity 결과
- §4 production smoke 결과 (Step 3)

### 2.3 `docs/03-analysis/features/sprint-258-divergence-automation.analysis.md` (AIF-ANLS-056)

F354 5건 BL-level marker 자동화 분류 표 + 패턴 정형화 초안 + 차기 Sprint 권고.

## §3 측정 절차 정의

### 3.1 silent drift 4종 검출 기준

| 카테고리 | 검출 방법 |
|----------|-----------|
| `base_path_missing` | controller-level `@RequestMapping` value vs endpoint full path prefix 매칭 — class base path 없이 method path만 산출 시 결함 |
| `path_incomplete` | endpoint full path가 `value="..."` 명시값과 매칭하지 않을 때 (path variable 손실 등) |
| `return_type_generic_loss` | endpoint return type이 `"Object"` 또는 base type만으로 축약될 때 (`ResponseEntity<List<T>>` → `Object` 등) |
| `mapper_skipped` | `@Mapper` 인터페이스가 controller/service 어느 쪽도 분류 안 되어 누락될 때 |

Phase 1 PoC 측정값 (`reports/F358-phase-1-poc-2026-05-04.json` 또는 동등 위치):
- base_path_missing: 2
- path_incomplete: 7
- return_type_generic_loss: 7
- mapper_skipped: 1
- **합계 17**

본 Sprint에서는 동일 5 샘플 기준 모두 0 회귀 입증.

### 3.2 reconcile sanity check 절차

mock DocApiSpec를 다음과 같이 구성:

```typescript
const mockDoc: DocApiSpec = {
  endpoints: [
    { method: "POST", path: "/api/v1/lpon/payment/charge", params: ["body"] },
    { method: "GET", path: "/api/v1/lpon/payment/balance/{accountNo}", params: ["accountNo"] },
    // intentional missing: /cancel /history 2건 (DOC_ONLY 0개 / SOURCE_MISSING 2개 검출 기대)
    { method: "GET", path: "/api/v1/lpon/payment/legacy", params: [] },  // DOC_ONLY 1개
    { method: "POST", path: "/api/v1/lpon/payment/charge", params: ["body", "extra"] }, // DIVERGENCE paramCount 차이
  ],
};
```

기대:
- SOURCE_MISSING: 0 (charge/balance는 source에 존재)
- DOC_ONLY: 1 (legacy는 source에 부재)
- DIVERGENCE: 1 (charge paramCount 1 vs 2)

(엄격한 카운트 매칭이 아닌 ≥1 marker 산출이면 sanity PASS)

### 3.3 production smoke 절차

```
Phase A — /health (필수)
  → HTTP 200 + JSON ok 응답 확인

Phase B — wrangler tail 로그 (가능하면)
  → CLOUDFLARE_API_TOKEN 사용 가능 시 30초 capture
  → Tree-sitter init 또는 extractClasses 호출 흔적 grep

Phase C — 실 ingest 1건 (선택)
  → /upload POST (Internal-Secret 필요) Java 1건
  → 응답 코드 + D1 document_chunks 신규 row 확인
  → 실패해도 Phase A로 cold-start 검증은 충분 (Phase 2 Master smoke 이미 PASS)
```

## §4 F354 5건 자동화 분류 기준

각 BL-level marker를 다음 기준으로 분류:

| 분류 | 정의 |
|------|------|
| **가능** | AST + 단순 패턴 매칭으로 100% 검출 가능 (literal 비교, line count, 함수 부재) |
| **조건부** | spec rules.md를 정량 파싱하는 별도 parser 필요 (NL → 구조화) |
| **불가** | 의미론 추론 LLM 호출 필요 (도메인 컨텍스트 + 산식 변환) |

```
BL-024 (7-day check 누락):
  필요 입력: spec.rules "구매 후 7일 이내" + source AST에서 createdAt diff 분기
  분류: 조건부 (rules.md NL parsing 필요)
  자동화 신뢰도: 60%

BL-026 (캐시백 환불 분기):
  필요 입력: spec.rules ALT 분기 + source AST에서 cashback 분기 함수 검색
  분류: 조건부
  자동화 신뢰도: 50%

BL-027 (approveRefund 부분 구현):
  필요 입력: source AST 함수 body line count + spec policy depth heuristic
  분류: 가능 (heuristic)
  자동화 신뢰도: 70%

BL-028 (exclusionAmount=0 hard-coded):
  필요 입력: source AST literal `0` + assignment target 매칭 + spec 공식 존재
  분류: 가능 (정확 매칭)
  자동화 신뢰도: 95%

BL-029 (강제환불 기준 부재):
  필요 입력: spec.rules ALT 명시 + source 분기 함수 검색
  분류: 조건부
  자동화 신뢰도: 50%
```

평균 자동화 신뢰도: (60+50+70+95+50)/5 = **65%**.
완전 자동화 위해 spec.rules.md NL parser 추가 필요 (Phase 3b 또는 별도 F-item).

## §5 코드 변경 영향도

본 Sprint는 **코드 변경 0건** 의도:
- `scripts/java-ast/` CLI는 기존 Phase 2 후 안정 — 추가 수정 없음
- `packages/utils/src/reconcile.ts` 변경 없음 (sanity check만)
- `services/svc-ingestion/` 변경 없음 (smoke만)

만약 측정 중 신규 silent drift 패턴 발견 시:
- 본 Sprint scope에서는 기록만 (신규 TD 등록 후 차기 Sprint 이관)
- DoD 영향: drift 회귀 0건 미달 시 PARTIAL 마킹

## §6 테스트 계획

본 Sprint는 신규 unit test 추가 없음. 기존 테스트 회귀(`pnpm test`) PASS만 확인.

## §7 Production 검증 (deployment)

- production deploy 신규 X (Sprint 257 deploy 그대로)
- 검증: /health + tail logs only

## §8 Risk 대응

| ID | 리스크 | 대응 |
|----|--------|------|
| R1 | java-ast CLI build 실패 | `npx tsx src/index.ts` fallback |
| R2 | production /upload 401/403 | /health + tail로 downgrade |
| R3 | reconcile.ts sanity 실패 (markers 0건) | mock DocApiSpec 명시적 mismatch 추가 |
| R4 | silent drift 회귀 0건 미달 | TD 신규 등록 + 차기 Sprint 이관 |
