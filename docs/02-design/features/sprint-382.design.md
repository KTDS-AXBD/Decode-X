---
id: AIF-DSGN-158
title: Sprint 382 Design — F554 BC Beach club 85번째 도메인
type: design
status: active
created: "2026-05-20"
updated: "2026-05-20"
author: autopilot
sprint: 382
feature: F554
related:
  - AIF-PLAN-233 (Sprint 382 Plan)
  - AIF-DSGN-155 (Sprint 379 6축 CI Guard)
  - AIF-DSGN-156 (Sprint 380 CV Convention)
  - AIF-DSGN-157 (Sprint 381 WB Wedding hall)
---

# Sprint 382 Design — F554 BC Beach club 85번째 도메인

**Sprint**: 382 | **F-item**: F554 | **Session**: 세션 309 | **Date**: 2026-05-20

---

## §1 요약

BC Beach club 합성 도메인 PoC. 비치클럽 산업: **풀 + 사교 + DJ 공연 + 시즌제 + VIP 프라이빗 + 종일권/시즌권 통합**.
오프라인 엔터 16-클러스터(AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+**BC**) 확장.
거울 변환 38회차 — wedding-hall 패턴 → beach-club 적용.

---

## §2 도메인 비즈니스 룰 (BC-001 ~ BC-006)

| ID | 함수 | Detector | 설명 |
|----|------|----------|------|
| BC-001 | `reserveDayPass` | ThresholdCheck (Path A: var-vs-UPPERCASE, `MAX_CONCURRENT_VISITORS_PER_BEACH_CLUB`) | 비치클럽별 동시 active visitor 한도 검증 |
| BC-002 | `applyCabanaLimit` | ThresholdCheck (Path B: var-vs-var, `cabanaLimit` keyword) | 회원 일일 cabana 한도 비교 |
| BC-003 | `processCabanaBooking` | AtomicTransaction | cabana 예약 atomic — beach_club_visits + cabana_schedules + visit_payments 3-table |
| BC-004 | `transitionVisitStatus` | StatusTransition | visit 상태 전환 (reserved → entered → exited → ended / closed / cancelled) |
| BC-005 | `expireClosedVisitBatch` | StatusTransition (batch) | closed visit 일괄 만료 처리 |
| BC-006 | `processVisitRefund` | AtomicTransaction | visit 환불 atomic — cancelled_fee_records + visit_refunds (VIP 환불 정책) |

BC 차별성 vs WB (S381):
- WB: 단일 예식 (1회성, hall 슬롯), 강한 계약금/위약금
- BC: 종일권 + 시즌권 + 카바나 임대 (반복 방문, VIP 프라이빗 + 음료/식음 옵션)
- BC-001: `MAX_CONCURRENT_VISITORS_PER_BEACH_CLUB` (방문객 기준, WB=3 vs BC=500)
- BC-002: `cabanaLimit` keyword (WB=`hallLimit`, detector Path B 동일 패턴)

---

## §3 스키마 (합성)

```
beach_clubs: id, name, max_concurrent_visitors, active_visitors, status
beach_memberships: id, member_id, club_id, membership_type, cabana_limit, cabana_used, status, expires_at
beach_club_visits: id, club_id, membership_id, cabana_id, payment_id, status, visited_at
cabana_schedules: id, club_id, visit_id, cabana_number, start_time, guest_count, cabana_type, status
visit_payments: id, visit_id, cabana_id, amount, status, paid_at
cancelled_fee_records: id, member_id, visit_id, visit_cost, cancellation_rate, cancellation_amount, status
visit_refunds: id, fee_record_id, member_id, amount, status, refunded_at
```

---

## §4 구현 설계

### 신규 파일

| 파일 | 설명 |
|------|------|
| `반제품-스펙/pilot-lpon-cancel/working-version/src/domain/beach-club.ts` | 305+ lines, 6 함수 + BeachClubError |
| `.decode-x/spec-containers/beach-club/provenance.yaml` | detection 결과 기록 |
| `.decode-x/spec-containers/beach-club/rules/beach-club-rules.md` | BC-001~006 규칙 명세 |
| `.decode-x/spec-containers/beach-club/tests/BC-001.yaml` | threshold 검증 시나리오 |

### 수정 파일

| 파일 | 변경 |
|------|------|
| `scripts/divergence/domain-source-map.ts` | DOMAIN_MAP 85번째 entry 추가 (beach-club) |
| `packages/utils/src/divergence/rules-parser.ts` | BC prefix 추가 (BL_ID_PATTERN 81→82) |
| `packages/utils/src/divergence/bl-detector.ts` | BC-001~006 REGISTRY 추가 (withRuleId × 6) |
| `packages/utils/test/bl-detector.test.ts` | 374→380 detector count + BC 테스트 5축 |

---

## §5 DoD 검증 기준

1. beach-club.ts 305+ lines + 6 함수 + BeachClubError code-in-message
2. spec-container 3 files (provenance.yaml + rules.md + BC-001.yaml)
3. DOMAIN_MAP 85번째 entry (beach-club) — DoD 5축 (e) + 6축 (f) CI Guard 이중
4. BL_ID_PATTERN BC prefix 추가 (81→82)
5. REGISTRY BC-001~006 (Threshold×2 + Atomic×2 + Status×2, withRuleId×6)
6. utils test 5축:
   - (a) `exposes 374` → `exposes 380` detector count
   - (b) sorted keys에 BC-001~006 삽입
   - (c) BC-001~006 registered describe
   - (d) beach-club domain PRESENCE 6 tests
   - (e) findDomainMapping("beach-club") axis-e
7. utils test 695 → 702 PASS (+7)
8. `npx tsc --noEmit` PASS (S337 cache 우회)
9. detect-bl 506 → 512/512 = 100.0% (85 containers, 74 신규 산업 0 ABSENCE)
10. Match ≥ 95%
11. PR + CI 3/3 green + domain-sprint-guard PASS (6축 실감증 3회차)
12. auto-merge
13. `git show HEAD --stat | grep domain-source-map.ts` PASS (DoD 5축 (e) 자체 검증)
