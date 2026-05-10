---
id: AIF-DSGN-096
sprint: 298
feature: F464
title: Media 28번째 도메인 신규 (미디어 산업, 17번째 신규 산업)
status: active
created: 2026-05-10
plan: AIF-PLAN-096
---

# F464 Design — AIF-DSGN-096

## §1 개요

Sprint 297 (Banking F463) 동일 패턴 복제 — 미디어(Media) 산업 28번째 도메인 신규.
withRuleId 재사용 26 Sprint 연속 정점, 신규 detector 0개, 🎯 coverage ≥ 90% 마일스톤 목표.

## §2 BL 설계

| BL | Detector | 함수 | 패턴 |
|----|----------|------|------|
| MD-001 | ThresholdCheck (Path A) | `activateMediaSubscription()` | `concurrentStreamCount >= MAX_CONCURRENT_STREAMS` |
| MD-002 | ThresholdCheck (Path B) | `checkViewQuota()` | `viewedCount > viewQuotaLimit` (limit keyword) |
| MD-003 | AtomicTransaction | `processLicensing()` | `db.transaction()` license_count 차감 + licenses INSERT |
| MD-004 | StatusTransition | `transitionContentStatus()` | draft→reviewing→published→archived/expired |
| MD-005 | StatusTransition (batch) | `markExpiringContent()` | batch status='expired' update |
| MD-006 | AtomicTransaction | `processTakedown()` | `db.transaction()` archived + resolved + revoked + refunds |

## §3 파일 매핑

### 신규 생성
| 파일 | 설명 |
|------|------|
| `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/media.ts` | Media 도메인 source (~280 lines, 6 함수 + MediaError) |
| `.decode-x/spec-containers/media/provenance.yaml` | provenance |
| `.decode-x/spec-containers/media/rules/media-rules.md` | BL 규칙 테이블 |
| `.decode-x/spec-containers/media/rules/MD-001.md` ~ `MD-006.md` | 개별 BL detail (6개) |
| `.decode-x/spec-containers/media/runbooks/MD-001.md` ~ `MD-006.md` | operational runbooks (6개) |
| `.decode-x/spec-containers/media/tests/MD-001.yaml` | 대표 test scenarios |

### 수정
| 파일 | 변경 내용 |
|------|---------|
| `scripts/divergence/domain-source-map.ts` | DOMAIN_MAP 28번째 entry (media) 추가 |
| `packages/utils/src/divergence/rules-parser.ts` | BL_ID_PATTERN에 `MD` prefix 추가 |
| `packages/utils/src/divergence/bl-detector.ts` | BL_DETECTOR_REGISTRY MD-001~MD-006 추가 |
| `packages/utils/test/bl-detector.test.ts` | 테스트 count 147→153, MD expected list + PRESENCE 테스트 추가 |

## §4 parser regex 전략

`BL_ID_PATTERN`에 `MD` 2글자 prefix 추가:
```
/^(?:BL|BB|BP|BG|BS|LP|CC|DV|SB|IN|HC|ED|RE|LG|HO|TR|MF|RT|EN|GV|TC|BK|MD|P|V)-[A-Z]?\d{1,3}$/
```
- `MF`(manufacturing) 뒤, `P` 앞 삽입 — longer match first 누적 입증 (S275~S298)
- `MD`는 2글자로 기존 `MF`와 동일 우선순위 (2글자 alternation)

## §5 DoD 매핑

| DoD # | 항목 | 파일/검증 |
|-------|------|----------|
| 1 | media.ts | `반제품-스펙/.../domain/media.ts` (~280 lines) |
| 2 | spec-container 15 sub-files | `.decode-x/spec-containers/media/` (provenance+rules.md+6 rules+6 runbooks+1 test=15) |
| 3 | DOMAIN_MAP 28번째 | `domain-source-map.ts` container='media' |
| 4 | parser regex MD prefix | `rules-parser.ts` BL_ID_PATTERN |
| 5 | REGISTRY MD-001~006 | `bl-detector.ts` 6 entries |
| 6 | unit test 147→153 | `bl-detector.test.ts` expected list +MD×6 |
| 7 | utils 248 PASS | vitest 242+6 |
| 8 | typecheck PASS | `pnpm turbo typecheck --force` |
| 9 | detect-bl ≥90% coverage | `ts-node detect-bl.ts` 28 containers |
| 10 | write-provenance --apply | 0/28 changes (PRESENCE 자동 입증) |
| 11 | 17 산업 연속 0 ABSENCE | detect-bl output 확인 |
| 12 | Plan + Report + SPEC | AIF-PLAN-096 + AIF-RPRT-096 |
