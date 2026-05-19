# Spec Container — PLANETARIUM-001 (천문관 합성 도메인)

**Skill ID**: PLANETARIUM-001  
**Domain**: Planetarium (천문관 산업 — 돔좌석한도/상영좌석한도/돔상영atomic/세션상태전환/closed세션일괄만료/세션환불atomic)  
**Source**: SYNTHETIC — 세션 308 F550, withRuleId 재사용 82번째 도메인 PoC (Observatory 다음 산업, 71번째 신규) 🔭 단일 클러스터 13 도메인 첫 사례 마일스톤 도전  
**Version**: 1.0.0  
**Status**: active  

---

## 비즈니스 룰 (PL-001 ~ PL-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| PL-001 | 신규 planetarium session 예약 요청 시 | `planetarium.active_sessions < max_concurrent_sessions` (UPPERCASE fallback MAX_CONCURRENT_SESSIONS_PER_PLANETARIUM) | 세션 예약 허용 + planetarium.active_sessions 증가 | `E422-PLANETARIUM-SESSION-LIMIT-EXCEEDED` |
| PL-002 | 회원 돔 좌석 사용 요청 시 | `membership.seat_used + seats < seatLimit` (var-vs-var, `limit` keyword) | 좌석 적용 + seat_used 증가 | `E422-DOME-SEAT-LIMIT-EXCEEDED` |
| PL-003 | 돔 상영 atomic 요청 시 | `planetarium_sessions.status = 'reserved'` | atomic: dome_schedules INSERT + planetarium_sessions UPDATE + session_payments INSERT | `E404-SESSION` |
| PL-004 | 세션 상태 전환 (reserved → screened → ended / closed / cancelled) | 허용 매트릭스 충족 | `planetarium_sessions.status` UPDATE | `E404-SESSION`, `E409-SESSION` |
| PL-005 | closed 세션 일괄 만료 처리 | `planetarium_sessions.status = 'closed'` AND `scheduled_at <= now` | `status='ended'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| PL-006 | 세션 환불 atomic 요청 시 | `planetarium_sessions.status = 'cancelled'` | atomic: cancelled_fee_records INSERT + session_refunds INSERT + cancelled_fee_records UPDATE | `E404-CANCELLED-SESSION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `planetariums` | active_sessions 증가 (PL-001) | bookSession |
| `planetarium_sessions` | INSERT (PL-001), status 갱신 (PL-003/PL-004/PL-005) | bookSession / processDomeScreening / transitionSessionStatus / expireClosedSessionBatch |
| `planetarium_memberships` | seat_used 증가 (PL-002) | applyDomeSeatLimit |
| `dome_schedules` | INSERT (PL-003) | processDomeScreening |
| `session_payments` | INSERT (PL-003) | processDomeScreening |
| `cancelled_fee_records` | INSERT + status='refunded' (PL-006) | processSessionRefund |
| `session_refunds` | INSERT (PL-006) | processSessionRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_SESSIONS_PER_PLANETARIUM = 300` (PL-001 천문관별 동시 active 세션 기본 한도 — 돔 좌석 수 기반, 일반 천문관 300석, OB 200보다 크고 MV 800보다 작음)
- `seatLimit = planetarium_memberships.seat_limit` (PL-002 멤버십 유형별 좌석 한도, standard/premium/annual 멤버십 정책 연계)

---

## 상태 머신

```
planetarium_sessions: reserved → screened (PL-003 atomic)
planetarium_sessions: screened → ended (PL-004 transition, 상영 완료)
planetarium_sessions: screened → closed (PL-004 transition, 천문관 운영 종료)
planetarium_sessions: reserved | screened → cancelled (PL-004 transition)

dome_schedules: active → completed (정상 완료)
dome_schedules: active → cancelled (취소)

planetarium_sessions: closed → ended (PL-005 batch — 운영 종료 후 자동 처리)

cancelled_fee_records: pending → calculated → refunded (PL-006 atomic)
```

---

## PL 차별성 (OB 천문대, MV 영화관과 분리)

| 항목 | OB (천문대) | MV (영화관) | PL (천문관) |
|------|------------|------------|------------|
| 핵심 활동 | 실 천체 telescope 관측 | 일반 영화 상영 | 돔 영상 시뮬레이션 |
| 입장 구조 | telescope 슬롯 | 좌석 예약 | 돔 좌석 + 정기 시간대 |
| 시간 제약 | 야간 시간 슬롯 필수 | 자유 | 정기 프로그램 상영 시간 |
| 기상 의존 | 높음 (구름/날씨) | 없음 | 없음 (실내 돔) |
| 동시 한도 | 200 (telescope 수 제한) | 800 | 300 (돔 좌석 수) |
| 핵심 차별 단어 | telescope/observation/야간 | movie/seat/genre | dome/screening/program/vr |

---

## 의존 함수 (planetarium.ts)

| BL | 함수 | detector |
|----|------|----------|
| PL-001 | `bookSession` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| PL-002 | `applyDomeSeatLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| PL-003 | `processDomeScreening` | AtomicTransaction (`db.transaction(...)`) |
| PL-004 | `transitionSessionStatus` | StatusTransition (matrix) |
| PL-005 | `expireClosedSessionBatch` | StatusTransition (batch) |
| PL-006 | `processSessionRefund` | AtomicTransaction (`db.transaction(...)`) |
