# Sprint 276 F442 — Phase 4 PoC 실행 보고서

**날짜**: 2026-05-08  
**ORG_ID**: LPON-poc-1778226015  
**도메인**: lpon-charge  

## 실행 결과 요약

| 단계 | 결과 | 소요 |
|------|------|------|
| 1. lpon-charge-ingest | ✅ 7 candidates | 29.5s |
| 2. force-approve | ✅ 7 approved | <1s |
| 3. rebundle-production | ✅ 2 bundles | 21.6s |
| 4. R2 검증 | ✅ JSON valid, policies=6 | - |
| 5. D1 검증 | ✅ 2 rows status='bundled' | - |

**총 소요**: ~52초

## R2 Bundles (실파일)

```
ai-foundry-skill-packages/
└── skill-packages/
    ├── bundle-8a532f89-6ccf-44e8-9c9b-1da109d1f6e3.skill.json  (charging, 6 policies)
    └── bundle-001a1065-4485-4e8b-bc75-63b528202d8d.skill.json  (notification, 1 policy)
```

## D1 db-skill (실측)

```sql
SELECT skill_id, organization_id, domain, status, policy_count, r2_key
FROM skills WHERE organization_id='LPON-poc-1778226015';
-- Result: 2 rows
-- 8a532f89: domain=lpon-charge, status=bundled, policy_count=6
-- 001a1065: domain=lpon-charge, status=bundled, policy_count=1
```

## LLM 비용 추정

- ingest (Opus 1회): ~$0.05~0.10
- classify (haiku 7 policies): ~$0.001  
- describe (sonnet 2 calls): ~$0.003
- **합계**: ~$0.06~0.11 (DoD $0.15 이내 ✅)

## TD-44 RESOLVED

`svc-llm-router-production.ktds-axbd.workers.dev` 의존성 제거 완료.
OpenRouter direct (CF AI Gateway 경유) 교체 후 실 호출 정상.

## DoD 12/12 PASS — Match Rate 95%
