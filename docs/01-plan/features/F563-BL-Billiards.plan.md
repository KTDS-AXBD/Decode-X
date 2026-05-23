# Plan: F563 BL Billiards — 94번째 도메인 / 83번째 신규 산업

**Sprint**: 391  
**F-item**: F563  
**Domain**: BL Billiards (당구장)  
**Rule prefix**: BI (BIlliards) — "BL" is reserved for lpon business logic rules (BL-001~042)  
**Milestone**: 🎱 단일 클러스터 25 도메인 첫 사례 + 21 Sprint 연속 첫 사례 신기록 도전

---

## 목표

BL Billiards (당구장) 산업 신규 도메인 부트스트래핑.

- `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/billiards.ts`
- `.decode-x/spec-containers/billiards/`
- DOMAIN_MAP 94번째 entry
- parser BI prefix (BL_ID_PATTERN 90 → 91)
- REGISTRY BI-001~006

**주의**: 규칙 prefix는 BI (BIlliards). SPEC에서 "BL-001~006"으로 표기되었으나 "BL" prefix는 lpon payment rules(BL-001~042, BL-G001~G006)에 기존 사용 중 → conflict 회피를 위해 "BI"로 구현.

---

## 당구 산업 BL (BI-001~006)

| ID | Rule | Type | Description |
|----|------|------|-------------|
| BI-001 | 동시 active table 한도 | Threshold (Path A) | `active_tables >= MAX_CONCURRENT_TABLES_PER_HALL` |
| BI-002 | 회원 일일 hour 한도 | Threshold (Path B) | `var-vs-var`, `hourLimit` keyword |
| BI-003 | table 예약 atomic | AtomicTransaction | billiards_sessions+table_schedules+session_payments+cue_inventory |
| BI-004 | session 상태 전환 | StatusTransition | reserved→started→playing→ended/abandoned/cancelled |
| BI-005 | ended session batch expire | StatusTransition (batch) | batch: ended→expired |
| BI-006 | session 환불 atomic | AtomicTransaction | 단체 환불 + cue 파손 변상 정책 |

---

## DoD (13/13)

1. billiards.ts 305 lines + 6 함수 (reserveTable / applyHourLimit / processTableBooking / transitionSessionStatus / expireEndedSessionBatch / processSessionRefund + BilliardsError)
2. spec-container 3 files (provenance + billiards-rules.md 마크다운 테이블 형식 + BI-001.yaml tests)
3. DOMAIN_MAP 94번째 entry (billiards container)
4. rules-parser.ts BI prefix 추가 (BL_ID_PATTERN 90 → 91)
5. REGISTRY BI-001~006 (Threshold × 2 + Atomic × 2 + Status × 2, withRuleId × 6)
6. utils test 보강 5축:
   - (a) exposes 428 → 434 detectors
   - (b) sorted keys array에 BI-001~006 삽입 (BC-006 다음, BK-001 앞)
   - (c) BI-001~006 registered describe block
   - (d) billiards domain PRESENCE describe block 6 tests
   - (e) findDomainMapping("billiards") 검증
7. pnpm test --run utils 769 → 776 PASS (+7)
8. npx tsc --noEmit PASS (S337 cache 우회)
9. detect-bl 560 → 566/566 = 100.0% (94 containers, 83 신규 산업 0 ABSENCE)
10. Match ≥ 95%
11. PR + CI 4/4 green (Migration + Domain Sprint Guard + E2E + Typecheck) = 6축 (f) 12회차
12. auto-merge
13. 자체 검증: git show HEAD --stat | grep domain-source-map.ts + runtime detect-bl --domain billiards | grep BI- 6 BLs

---

## fs 실측 baseline (S283 audit 47회차)

- BI prefix 충돌: 0건 ✅ (BI not in BL_ID_PATTERN, not in BL_DETECTOR_REGISTRY)
- billiards.ts: 미존재 ✅
- spec-containers/billiards: 미존재 ✅
- DOMAIN_MAP: 93 entries baseline (arcade = 93번째)
- utils test: 769 PASS baseline
- detect-bl: 560/560 baseline
