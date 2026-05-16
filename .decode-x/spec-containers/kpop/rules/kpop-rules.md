# Spec Container — KPP-001 (K-pop 콘서트/팬미팅 합성 도메인)

**Skill ID**: KPP-001
**Domain**: K-pop (콘서트/팬미팅 산업 — 아레나entry한도/fandailyentry한도/입장batchatomic/entry상태전환/만료postponedentry일괄/concert환불atomic)
**Source**: SYNTHETIC — 세션 306 후속7 F539, withRuleId 재사용 71번째 도메인 PoC (Golf 다음 산업, 60번째 신규, 한국 특화) 🏆 71번째 도메인 마일스톤
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (KP-001 ~ KP-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| KP-001 | 신규 ticket 예매 요청 시 | `arena.active_entries < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_ACTIVE_ENTRIES_PER_ARENA) | ticket 예매 허용 + arena.active_entries 증가 | `E422-ARENA-CAPACITY-EXCEEDED` |
| KP-002 | 팬 entry 요청 시 | `contract.fan_used + entry < dailyFanLimit` (var-vs-var, `limit` keyword) | entry 적용 + fan_used 증가 | `E422-DAILY-FAN-LIMIT-EXCEEDED` |
| KP-003 | 콘서트 입장 atomic 요청 시 | `concert_schedules.status = 'booked'` | atomic: entries INSERT + concert_schedules UPDATE + entry_payments INSERT | `E404-SCHEDULE` |
| KP-004 | entry 상태 전환 (booked → admitted → updated → ended / postponed / cancelled) | 허용 매트릭스 충족 | `concert_schedules.status` UPDATE | `E404-SCHEDULE`, `E409-SCHEDULE` |
| KP-005 | postponed entry 일괄 만료 처리 | `entries.status = 'postponed'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| KP-006 | concert 환불 (postponed) atomic 요청 시 | `entries.status = 'postponed'` | atomic: entry_refund_records INSERT + entry_refunds INSERT + entry_refund_records UPDATE | `E404-POSTPONED-ENTRY` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `arenas` | active_entries 증가 (KP-001) | bookTicket |
| `concert_schedules` | INSERT (KP-001), status 갱신 (KP-003/KP-004) | bookTicket / processConcertAdmission / transitionEntryStatus |
| `fan_contracts` | fan_used 증가 (KP-002) | applyFanLimit |
| `entries` | INSERT (KP-003), batch expire (KP-005) | processConcertAdmission / expirePostponedEntryBatch |
| `entry_payments` | INSERT (KP-003) | processConcertAdmission |
| `entry_refund_records` | INSERT + status='refunded' (KP-006) | processConcertRefund |
| `entry_refunds` | INSERT (KP-006) | processConcertRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_ACTIVE_ENTRIES_PER_ARENA = 50000` (KP-001 아레나별 동시 active entry 기본 한도, 대형 아레나 잠실 종합운동장급 수용 인원)
- `dailyFanLimit = fan_contracts.fan_limit` (KP-002 팬 등급별 일일 entry 한도, 팬클럽 멤버십 정책 연계)

---

## 상태 머신

```
concert_schedules: booked → admitted (KP-003 atomic)
concert_schedules: admitted ↔ updated (KP-004 transition, 좌석 변경)
concert_schedules: admitted|updated → ended (KP-004 transition, 정상 콘서트 종료)
concert_schedules: booked|admitted → postponed (KP-004 transition, 콘서트 연기/멤버 부상)
concert_schedules: booked|admitted → cancelled (KP-004 transition)

entries: admitted → updated → ended (정상 종료)
entries: postponed → expired (KP-005 batch — 데이터 보관 기간 만료)
entries: admitted → postponed (콘서트 긴급 연기, KP-006 concert 환불 대상)

entry_refund_records: pending → calculated → refunded (KP-006 atomic)
```

---

## 의존 함수 (kpop.ts)

| BL | 함수 | detector |
|----|------|----------|
| KP-001 | `bookTicket` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| KP-002 | `applyFanLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| KP-003 | `processConcertAdmission` | AtomicTransaction (`db.transaction(...)`) |
| KP-004 | `transitionEntryStatus` | StatusTransition (matrix) |
| KP-005 | `expirePostponedEntryBatch` | StatusTransition (batch) |
| KP-006 | `processConcertRefund` | AtomicTransaction (`db.transaction(...)`) |
