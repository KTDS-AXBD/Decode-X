# Spec Container — MEDIA-001 (미디어 산업 합성 도메인)

**Skill ID**: MEDIA-001
**Domain**: Media (미디어 산업 — 구독tier한도/시청한도/라이선싱atomic/콘텐츠상태전환/만료배치/takedown atomic)
**Source**: SYNTHETIC — Sprint 298 F464, withRuleId 재사용 28번째 도메인 PoC (Banking 다음 산업, 17번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (MD-001 ~ MD-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| MD-001 | 스트리밍 요청 시 | `concurrentStreamCount < MAX_CONCURRENT_STREAMS` (UPPERCASE 상수) AND 구독 status='active' | 스트리밍 허용 + 세션 활성화 | `E422-STREAM-LIMIT` (동시 시청 한도 초과) |
| MD-002 | 콘텐츠 시청 시 | `viewedCount <= viewQuotaLimit` (var-vs-var, `limit` keyword 매칭) | 시청 허용 + 카운트 증가 | `E422-VIEW-QUOTA` (무료 시청 한도 초과) |
| MD-003 | 콘텐츠 라이선스 요청 시 | `content.status = 'published'` AND `license_count > 0` | atomic: `license_count` 차감 + `licenses` INSERT | `E404-CONTENT`, `E409-CONTENT`, `E422-LICENSE-EXHAUSTED` |
| MD-004 | 콘텐츠 상태 전환 (draft → reviewing → published → archived/expired) | 허용 매트릭스 충족 | `contents.status` UPDATE + 타임스탬프 기록 | `E404-CONTENT`, `E409-CONTENT` |
| MD-005 | 만료 콘텐츠 일괄 처리 (배치) | `contents.status = 'published'` AND `expires_at <= expirationCutoffDate` | `contents.status='expired'` 일괄 UPDATE | 대상 없으면 markedCount=0 |
| MD-006 | 콘텐츠 테이크다운 처리 시 | `content.status != 'archived'` AND `report` 존재 | atomic: `contents.status='archived'` + `reports.status='resolved'` + `licenses` 무효화 + `refunds` INSERT | `E404-CONTENT`, `E404-REPORT`, `E409-CONTENT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `subscriptions` | status 확인 (MD-001) | activateMediaSubscription |
| `contents` | license_count 차감 (MD-003) / status 전환 (MD-004/MD-005/MD-006) / archived_at (MD-006) | processLicensing / transitionContentStatus / markExpiringContent / processTakedown |
| `licenses` | INSERT (MD-003) / status='revoked' (MD-006) | processLicensing / processTakedown |
| `reports` | status='resolved' / resolved_at (MD-006) | processTakedown |
| `refunds` | INSERT (MD-006) | processTakedown |

---

## 임계값 / 상수

- `MAX_CONCURRENT_STREAMS = 4` (MD-001 최대 동시 스트림 수, premium 기준)
- `viewQuotaLimit = 10/50/200/999` (MD-002 tier별 월간 시청 한도 — free/basic/standard/premium)

---

## 상태 머신

```
contents: [created] → draft (초기 상태)
contents: draft → reviewing (MD-004 transition)
contents: reviewing → published (MD-004 transition)
contents: reviewing → archived (MD-004 transition)
contents: published → archived (MD-004 transition)
contents: published → expired (MD-004 / MD-005 batch)
contents: archived → expired (MD-004 transition)

licenses: [created] → active (MD-003 atomic)
licenses: active → consumed (시청 완료)
licenses: active → revoked (MD-006 takedown)

reports: [created] → pending (초기 상태)
reports: pending → reviewing (검토 시작)
reports: reviewing → resolved (MD-006 takedown)
reports: reviewing → dismissed (기각)

subscriptions: [created] → active (가입)
subscriptions: active → suspended (결제 실패)
subscriptions: active → cancelled (해지)
subscriptions: active → expired (기간 만료)
```

---

## 권한

- **activateMediaSubscription**: 구독자 / 스트리밍 SYSTEM
- **checkViewQuota**: 구독자 / 시청 SYSTEM
- **processLicensing**: 구독자 / 라이선스 SYSTEM
- **transitionContentStatus**: 콘텐츠관리자 / 콘텐츠 SYSTEM
- **markExpiringContent**: 만료관리 SYSTEM (배치)
- **processTakedown**: 콘텐츠모더레이션 SYSTEM

---

## 관련 문서

- `rules/MD-001.md` ~ `rules/MD-006.md` — 개별 BL detail
- `runbooks/MD-001.md` ~ `runbooks/MD-006.md` — operational runbooks
- `tests/MD-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/media.ts` — 합성 source
