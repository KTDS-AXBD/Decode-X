---
id: AIF-DSGN-096
title: Sprint 377 Design — F549 OB Observatory 81번째 도메인
type: design
status: active
created: "2026-05-19"
updated: "2026-05-19"
author: autopilot
sprint: 377
feature: F549
---

# Sprint 377 Design — F549 OB Observatory 81번째 도메인

## §1 개요

garden.ts 거울 변환 34회차. OB 차별성: 시간 슬롯 운영 + 야간 관측 + 기상 의존 모델.  
telescope 슬롯이 핵심 — `observatory_observations` + `telescope_schedules` 2-테이블 atomic.

## §2 데이터 스키마

| 테이블 | 주요 컬럼 |
|--------|----------|
| `observatories` | id, name, max_concurrent_observations, active_observations, status |
| `observatory_memberships` | id, member_id, observatory_id, membership_type, telescope_limit, telescope_used, status, expires_at |
| `observatory_observations` | id, observatory_id, membership_id, telescope_id, payment_id, status, scheduled_at |
| `telescope_schedules` | id, observatory_id, observation_id, telescope_no, status, started_at |
| `observation_payments` | id, observation_id, telescope_id, amount, status, paid_at |
| `cancelled_fee_records` | id, member_id, observation_id, observation_cost, cancellation_rate, cancellation_amount, status |
| `observation_refunds` | id, fee_record_id, member_id, amount, status, refunded_at |

## §3 상수

- `MAX_CONCURRENT_OBSERVATIONS_PER_OBSERVATORY = 200` (천문대별 동시 active 관측 한도 — 일반 천문대 기준, GR 3000보다 훨씬 작음)

## §4 상태 머신

```
observatory_observations: reserved → observed (OB-003 atomic)
observatory_observations: observed → ended (OB-004 transition)
observatory_observations: observed → closed (OB-004 transition)
observatory_observations: reserved | observed → cancelled (OB-004 transition)
observatory_observations: closed → ended (OB-005 batch)
cancelled_fee_records: pending → calculated → refunded (OB-006 atomic)
```

## §5 구현 파일 매핑

| 파일 | 내용 |
|------|------|
| `observatory.ts` | 6 함수 + 인터페이스 + ObservatoryError |
| `provenance.yaml` | SYNTHETIC 선언 + detection 6건 |
| `observatory-rules.md` | BL 테이블 + 상태 머신 + 차별성 |
| `OB-001.yaml` | 테스트 시나리오 OB-001~OB-006 |
| `domain-source-map.ts` | DOMAIN_MAP 81번째 entry |
| `rules-parser.ts` | OB prefix BL_ID_PATTERN |
| `bl-detector.ts` | OB-001~006 withRuleId 6 entries |
| `bl-detector.test.ts` | 5축 test 보강 |

## §6 OB 차별성 비교

| 항목 | MS (박물관) | GR (식물원) | OB (천문대) |
|------|------------|------------|------------|
| 핵심 활동 | 전시물 관람 | 구역별 식물 관찰 | telescope 관측 |
| 입장 구조 | 전시 구역 | zone 분리 구역 | telescope 슬롯 |
| 시간 제약 | 없음 | 없음 | 야간 시간 슬롯 필수 |
| 기상 의존 | 없음 | 낮음 | 높음 (구름/날씨) |
| 동시 한도 | 1500 | 3000 | 200 (telescope 수 제한) |
