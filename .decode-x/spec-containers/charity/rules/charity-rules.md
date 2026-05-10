# Spec Container — CHARITY-001 (비영리 산업 합성 도메인)

**Skill ID**: CHARITY-001
**Domain**: Charity (비영리 산업 — 영수증한도/보조금한도/기금집행atomic/캠페인상태전환/자원봉사배치/세금증명atomic)
**Source**: SYNTHETIC — Sprint 308 F474, withRuleId 재사용 38번째 도메인 PoC (Sports 다음 산업, 27번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (CH-001 ~ CH-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| CH-001 | 기부 영수증 발급 요청 시 | `amount < MAX_RECEIPT_AMOUNT` (UPPERCASE 상수, 10,000,000) | 영수증 발급 허용 + donation_receipts INSERT | `E422-RECEIPT-LIMIT-EXCEEDED` (영수증 발급 한도 초과) |
| CH-002 | 보조금 신청 시 | `requestedAmount <= grantTierLimit` (var-vs-var, `limit` keyword 매칭) | 보조금 승인 | `E422-GRANT-TIER-EXCEEDED` (보조금 한도 초과) |
| CH-003 | 기금 집행 요청 시 | `grants.status = 'approved'` | atomic: `fund_disbursements` INSERT + `grants` UPDATE + `disbursement_receipts` INSERT + `fund_disbursements.status` UPDATE | `E404-GRANT` |
| CH-004 | 캠페인 상태 전환 (draft → active → closed → reported → audited) | 허용 매트릭스 충족 | `campaigns.status` UPDATE + 타임스탬프 기록 | `E404-CAMPAIGN`, `E409-CAMPAIGN` |
| CH-005 | 자원봉사 일정 일괄 처리 | `volunteer_schedules.scheduled_date <= scheduledBefore` AND `status = 'pending'` | `status='assigned', synced_at=NOW()` 일괄 UPDATE | 대상 없으면 syncedCount=0 |
| CH-006 | 세금증명 발급 요청 시 | 기부 내역 존재 필수 | atomic: `tax_certificates` INSERT + `donations` UPDATE + `tax_reports` INSERT + `tax_certificates.reported_at` UPDATE | 조회 실패 시 CharityError |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `donations` | INSERT (CH-001), status 갱신 (CH-006) | recordDonation / issueTaxCertificate |
| `donation_receipts` | INSERT (CH-001) | recordDonation |
| `grants` | INSERT (CH-002), status 갱신 (CH-003) | applyGrant / disburseFund |
| `fund_disbursements` | INSERT + status 갱신 (CH-003) | disburseFund |
| `disbursement_receipts` | INSERT (CH-003) | disburseFund |
| `campaigns` | status + 타임스탬프 갱신 (CH-004) | transitionCampaignStatus |
| `volunteer_schedules` | status='assigned' 일괄 갱신 (CH-005) | markVolunteerSchedule |
| `tax_certificates` | INSERT + reported_at 갱신 (CH-006) | issueTaxCertificate |
| `tax_reports` | INSERT (CH-006) | issueTaxCertificate |

---

## 임계값 / 상수

- `MAX_RECEIPT_AMOUNT = 10_000_000` (CH-001 영수증 발급 최대 한도, KRW 1천만)
- `grantTierLimit = grant_tiers.grantTierLimit` (CH-002 단계별 보조금 한도)

---

## 상태 머신

```
campaigns: draft → active (CH-004 transition)
campaigns: active → closed (CH-004 transition)
campaigns: closed → reported (CH-004 transition)
campaigns: reported → audited (CH-004 transition)

volunteer_schedules: pending → assigned (CH-005 batch)

fund_disbursements: initiated → disbursed (CH-003 atomic)
grants: approved → disbursed (CH-003 atomic)
```

---

## 권한

- **recordDonation**: 기부접수 SYSTEM / 기부 담당
- **applyGrant**: 보조금관리 SYSTEM
- **disburseFund**: 기금집행 SYSTEM (승인 필수)
- **transitionCampaignStatus**: 캠페인관리 SYSTEM / 운영관리자
- **markVolunteerSchedule**: 봉사관리 SYSTEM (배치)
- **issueTaxCertificate**: 세금증명 SYSTEM / 회계담당

---

## 관련 문서

- `rules/CH-001.md` ~ `rules/CH-006.md` — 개별 BL detail
- `runbooks/CH-001.md` ~ `runbooks/CH-006.md` — operational runbooks
- `tests/CH-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/charity.ts` — 합성 source
