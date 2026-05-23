# Sprint 389 — F561 BW Bowling 92번째 신규 산업 사전 등록

## 목표

BW Bowling (볼링) 산업 신규 도메인 부트스트래핑 — 92번째 도메인 / 81번째 신규 산업.
🎳 오프라인 엔터 23-클러스터 확장 (AM+…+CA+BW). 단일 클러스터 23 도메인 첫 사례 마일스톤 신기록 도전.

## 구현 범위

### 1. bowling.ts (305 lines)

- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/bowling.ts`
- 6 함수: `reserveLane` / `applyGameLimit` / `processLaneBooking` / `transitionSessionStatus` / `expireClosedSessionBatch` / `processSessionRefund`
- `BowlingError` class (code-in-message 패턴)
- CA Casino 패턴 복제 → lane/game/볼링 식별자로 치환

### 2. spec-container 3 files

- `.decode-x/spec-containers/bowling/provenance.yaml`
- `.decode-x/spec-containers/bowling/rules/bowling-rules.md` (markdown table 형식 필수 — S381 가이드)
- `.decode-x/spec-containers/bowling/tests/BW-001.yaml`

### 3. DOMAIN_MAP 92번째 entry

- `scripts/divergence/domain-source-map.ts` — container: "bowling" 추가 (CA 다음)

### 4. parser BW prefix

- `packages/utils/src/divergence/rules-parser.ts` — BL_ID_PATTERN에 BW 추가 (88 → 89 prefixes)

### 5. REGISTRY BW-001~006

- `packages/utils/src/divergence/bl-detector.ts` — BW-001~BW-006 (withRuleId × 6)

### 6. utils test 보강 5축

- `packages/utils/test/bl-detector.test.ts`:
  - (a) `exposes 416 detectors` → `exposes 422 detectors` (+6)
  - (b) sorted keys에 BW-001~006 알파벳 위치 삽입
  - (c) BW-001~006 registered describe block
  - (d) bowling domain PRESENCE describe block (CA 패턴 복제)
  - (e) `findDomainMapping("bowling")` 검증

## DoD 체크리스트

- [ ] bowling.ts 305 lines + 6 함수
- [ ] spec-container 3 files (provenance + rules markdown table + BW-001.yaml)
- [ ] DOMAIN_MAP 92번째 entry (6축 (f) CI Guard 자동 작동)
- [ ] BL_ID_PATTERN BW prefix (88 → 89)
- [ ] REGISTRY BW-001~006 (withRuleId × 6)
- [ ] utils test 5축 보강
- [ ] utils 753 → ~760 PASS
- [ ] npx tsc --noEmit PASS
- [ ] detect-bl 548 → 554/554 = 100.0%
- [ ] Match ≥ 95%
- [ ] PR + CI 4/4 green (6축 (f) 10회차)

## 의존성

Sprint 388 F560 CA Casino MERGED (`652770e`) — baseline:
- utils 753 PASS
- detect-bl 548/548 = 100.0% (91 containers, 80 신규 산업)
- BL_ID_PATTERN 88 prefixes
