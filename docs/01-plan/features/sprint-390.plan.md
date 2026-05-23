---
id: AIF-PLAN-390
sprint: 390
f_items: [F562]
status: DONE
created: "2026-05-23"
---

# Sprint 390 Plan — F562 AC Arcade 93번째 도메인

## 목표
AC Arcade (아케이드 게임센터) 산업 신규 도메인 부트스트래핑

## 범위
- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/arcade.ts` (305줄 이상)
- `.decode-x/spec-containers/arcade/` (provenance.yaml + rules/arcade-rules.md + tests/AC-001.yaml)
- `scripts/divergence/domain-source-map.ts` — DOMAIN_MAP 93번째 entry 추가
- `packages/utils/src/divergence/rules-parser.ts` — BL_ID_PATTERN에 AC 추가 (→ 90)
- `packages/utils/src/divergence/bl-detector.ts` — AC-001~006 6 entries 추가
- `packages/utils/test/bl-detector.test.ts` — utils test 보강 5축

## 비즈니스 룰 (AC-001~006)
| ID | 타입 | 설명 |
|----|------|------|
| AC-001 | Threshold | 아케이드 동시 active machine 한도 (MAX_CONCURRENT_MACHINES_PER_ARCADE) |
| AC-002 | Threshold | 회원 일일 token 한도 (var-vs-var, tokenLimit) |
| AC-003 | Atomic | token 충전/사용 atomic (arcade_sessions+token_ledger+session_payments) |
| AC-004 | Status | machine session 상태 전환 (idle → active → paused → ended / fault / cancelled) |
| AC-005 | Status batch | ended machine session 일괄 만료 처리 |
| AC-006 | Atomic | token 환불 atomic (잔여 token 환불 + prize ticket redemption 정책) |

## DoD
1. arcade.ts 305줄 이상 + 6 함수 (enterMachine/applyTokenLimit/processTokenCharge/transitionMachineStatus/expireEndedSessionBatch/processTokenRefund)
2. spec-container 3 files (provenance.yaml + arcade-rules.md 테이블 형식 + AC-001.yaml)
3. DOMAIN_MAP 93번째 entry
4. BL_ID_PATTERN 89 → 90 (AC prefix 추가)
5. BL_DETECTOR_REGISTRY AC-001~006 6 entries
6. utils test 보강 5축 (422→428 count + sorted array + registered block + PRESENCE 6 tests + findDomainMapping)
7. `pnpm test --run` 761 → 768 PASS
8. `npx tsc --noEmit` PASS
9. detect-bl 554/554 → 560/560 = 100.0%
10. Match ≥ 95%
11. PR + CI 4/4 green = 6축 (f) 11회차
12. PR title: `feat: Sprint 390 F562 AC Arcade 93번째 도메인 / 82번째 신규 산업 ...`
13. 자체 검증: `git show HEAD --stat | grep domain-source-map.ts` + `detect-bl --domain arcade | grep AC-` 6 BLs
