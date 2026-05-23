# Sprint 394 Plan — F566 DJ Academy

**Sprint**: 394  
**F-item**: F566  
**Target**: DJ DJ Academy (DJ 학원) — 97번째 도메인 / 86번째 신규 산업  

## 목표
DJ Academy 산업 신규 도메인 부트스트래핑

## DoD (13/13)
1. dj-academy.ts 305+ lines + 6 함수 + DjAcademyError
2. spec-container 3 files (provenance + rules markdown table + DJ-001.yaml tests)
3. DOMAIN_MAP 97번째 entry
4. parser DJ prefix (BL_ID_PATTERN 93 → 94)
5. REGISTRY DJ-001~006
6. utils test 보강 5축
7. pnpm test --run utils 791 → 798 PASS (+7)
8. npx tsc --noEmit PASS
9. detect-bl 578 → 584/584 = 100%
10. Match ≥ 95%
11. PR + CI 4/4 green = 6축 (f) 15회차
12. auto-merge
13. 자체 검증: domain-source-map.ts diff + detect-bl --domain dj-academy | grep DJ- 6 BLs
