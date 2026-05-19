# Spec Container — OBSERVATORY-001 (천문대 합성 도메인)

**Skill ID**: OBSERVATORY-001  
**Domain**: Observatory (천문대 산업 — 동시관측한도/telescope한도/telescope관측atomic/관측상태전환/closed관측일괄만료/관측환불atomic)  
**Source**: SYNTHETIC — 세션 307 후속7 F549, withRuleId 재사용 81번째 도메인 PoC (Garden 다음 산업, 70번째 신규) 🔭 단일 클러스터 12 도메인 첫 사례 마일스톤  
**Version**: 1.0.0  
**Status**: active  

---

## 비즈니스 룰 (OB-001 ~ OB-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| OB-001 | 신규 observatory observation 예약 요청 시 | `observatory.active_observations < max_concurrent_observations` (UPPERCASE fallback MAX_CONCURRENT_OBSERVATIONS_PER_OBSERVATORY) | 관측 예약 허용 + observatory.active_observations 증가 | `E422-OBSERVATORY-OBSERVATION-LIMIT-EXCEEDED` |
| OB-002 | 회원 telescope 사용 요청 시 | `membership.telescope_used + telescopes < telescopeLimit` (var-vs-var, `limit` keyword) | telescope 적용 + telescope_used 증가 | `E422-TELESCOPE-LIMIT-EXCEEDED` |
| OB-003 | telescope 관측 atomic 요청 시 | `observatory_observations.status = 'reserved'` | atomic: telescope_schedules INSERT + observatory_observations UPDATE + observation_payments INSERT | `E404-OBSERVATION` |
| OB-004 | 관측 상태 전환 (reserved → observed → ended / closed / cancelled) | 허용 매트릭스 충족 | `observatory_observations.status` UPDATE | `E404-OBSERVATION`, `E409-OBSERVATION` |
| OB-005 | closed 관측 일괄 만료 처리 | `observatory_observations.status = 'closed'` AND `scheduled_at <= now` | `status='ended'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| OB-006 | 관측 환불 atomic 요청 시 | `observatory_observations.status = 'cancelled'` | atomic: cancelled_fee_records INSERT + observation_refunds INSERT + cancelled_fee_records UPDATE | `E404-CANCELLED-OBSERVATION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `observatories` | active_observations 증가 (OB-001) | reserveObservation |
| `observatory_observations` | INSERT (OB-001), status 갱신 (OB-003/OB-004/OB-005) | reserveObservation / processTelescopeObservation / transitionObservationStatus / expireClosedObservationBatch |
| `observatory_memberships` | telescope_used 증가 (OB-002) | applyTelescopeLimit |
| `telescope_schedules` | INSERT (OB-003) | processTelescopeObservation |
| `observation_payments` | INSERT (OB-003) | processTelescopeObservation |
| `cancelled_fee_records` | INSERT + status='refunded' (OB-006) | processObservationRefund |
| `observation_refunds` | INSERT (OB-006) | processObservationRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_OBSERVATIONS_PER_OBSERVATORY = 200` (OB-001 천문대별 동시 active 관측 기본 한도 — telescope 수 기반, 일반 천문대 200슬롯, GR 3000/PA 2000보다 훨씬 작음)
- `telescopeLimit = observatory_memberships.telescope_limit` (OB-002 멤버십 유형별 telescope 한도, night/monthly/annual 멤버십 정책 연계)

---

## 상태 머신

```
observatory_observations: reserved → observed (OB-003 atomic)
observatory_observations: observed → ended (OB-004 transition, 관측 완료)
observatory_observations: observed → closed (OB-004 transition, 천문대 운영 종료)
observatory_observations: reserved | observed → cancelled (OB-004 transition)

telescope_schedules: active → completed (정상 완료)
telescope_schedules: active → cancelled (취소)

observatory_observations: closed → ended (OB-005 batch — 운영 종료 후 자동 처리)

cancelled_fee_records: pending → calculated → refunded (OB-006 atomic)
```

---

## OB 차별성 (MS 박물관, GR 식물원과 분리)

| 항목 | MS (박물관) | GR (식물원/수목원) | OB (천문대) |
|------|------------|-----------------|------------|
| 핵심 활동 | 전시물 관람 | 구역별 식물 관찰 | telescope 관측 |
| 입장 구조 | 전시 구역 | zone 분리 구역 | telescope 슬롯 |
| 시간 제약 | 없음 | 없음 | 야간 시간 슬롯 필수 |
| 기상 의존 | 없음 | 낮음 | 높음 (구름/날씨) |
| 동시 한도 | 1500 | 3000 | 200 (telescope 수 제한) |
| 핵심 차별 단어 | 전시물/exhibition | zone/seasonal | telescope/observation/야간 |

---

## 의존 함수 (observatory.ts)

| BL | 함수 | detector |
|----|------|----------|
| OB-001 | `reserveObservation` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| OB-002 | `applyTelescopeLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| OB-003 | `processTelescopeObservation` | AtomicTransaction (`db.transaction(...)`) |
| OB-004 | `transitionObservationStatus` | StatusTransition (matrix) |
| OB-005 | `expireClosedObservationBatch` | StatusTransition (batch) |
| OB-006 | `processObservationRefund` | AtomicTransaction (`db.transaction(...)`) |
