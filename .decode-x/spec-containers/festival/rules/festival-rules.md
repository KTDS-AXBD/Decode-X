# Spec Container — FESTIVAL-001 (페스티벌 합성 도메인)

**Skill ID**: FESTIVAL-001
**Domain**: Festival (페스티벌 산업 — 동시참가한도/멤버일일stage한도/stage입장atomic/참가상태전환/closed참가일괄만료/참가환불atomic)
**Source**: SYNTHETIC — 세션 307 후속5 F547, withRuleId 재사용 79번째 도메인 PoC (Park 다음 산업, 68번째 신규) 🎪 단일 클러스터 10 도메인 첫 사례 round 마일스톤
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (FE-001 ~ FE-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| FE-001 | 신규 페스티벌 참가 예약 요청 시 | `festival.active_entries < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_FESTIVAL_ENTRIES) | 참가 예약 허용 + festival.active_entries 증가 | `E422-FESTIVAL-ENTRY-LIMIT-EXCEEDED` |
| FE-002 | 멤버 stage 요청 시 | `pass.stage_used + stages < stageLimit` (var-vs-var, `limit` keyword) | stage 적용 + stage_used 증가 | `E422-DAILY-STAGE-LIMIT-EXCEEDED` |
| FE-003 | stage 입장 atomic 요청 시 | `festival_entries.status = 'reserved'` | atomic: stage_schedules INSERT + festival_entries UPDATE + entry_payments INSERT | `E404-ENTRY` |
| FE-004 | 참가 상태 전환 (reserved → entered → exited → ended / closed / cancelled) | 허용 매트릭스 충족 | `festival_entries.status` UPDATE | `E404-ENTRY`, `E409-ENTRY` |
| FE-005 | closed 참가 일괄 만료 처리 | `festival_entries.status = 'closed'` AND `scheduled_at <= now` | `status='ended'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| FE-006 | 참가 환불 atomic 요청 시 | `festival_entries.status = 'cancelled'` | atomic: cancelled_fee_records INSERT + entry_refunds INSERT + cancelled_fee_records UPDATE | `E404-CANCELLED-ENTRY` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `festivals` | active_entries 증가 (FE-001) | reserveEntry |
| `festival_entries` | INSERT (FE-001), status 갱신 (FE-003/FE-004/FE-005) | reserveEntry / processStageEntry / transitionEntryStatus / expireClosedEntryBatch |
| `festival_passes` | stage_used 증가 (FE-002) | applyStageLimit |
| `stage_schedules` | INSERT (FE-003) | processStageEntry |
| `entry_payments` | INSERT (FE-003) | processStageEntry |
| `cancelled_fee_records` | INSERT + status='refunded' (FE-006) | processEntryRefund |
| `entry_refunds` | INSERT (FE-006) | processEntryRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_FESTIVAL_ENTRIES = 5000` (FE-001 페스티벌별 동시 active 참가 기본 한도, 대형 페스티벌 5000인 기준)
- `stageLimit = festival_passes.stage_limit` (FE-002 패스 유형별 일일 stage 한도, day/weekend/full pass 정책 연계)

---

## 상태 머신

```
festival_entries: reserved → entered (FE-003 atomic)
festival_entries: entered → exited (FE-004 transition, stage 완료)
festival_entries: exited → ended (FE-004 transition, 정산 완료)
festival_entries: entered → closed (FE-004 transition, 페스티벌 운영 종료)
festival_entries: reserved|entered → cancelled (FE-004 transition)

stage_schedules: active → completed (정상 완료)
stage_schedules: active → cancelled (취소)

festival_entries: closed → ended (FE-005 batch — 운영 종료 후 자동 처리)

cancelled_fee_records: pending → calculated → refunded (FE-006 atomic)
```

---

## FE 차별성 (KP 콘서트와 분리)

| 항목 | KP (K-pop Concert) | FE (Festival) |
|------|-------------------|---------------|
| 일정 | 단일 날짜 | 다일정 (multi-date, 복수 날짜) |
| 공연 구성 | 단일 아티스트/공연 | 멀티 stage 동시 운영 |
| 입장권 | 단일 콘서트 티켓 | festival pass (day/weekend/full) |
| 한도 | 공연별 좌석 수 | 동시 참가 인원 |
| 핵심 활동 | 공연 관람 | stage별 자유 이동 + 멀티 체험 |
| 상태 종료 | ended | closed → ended (FE-005 batch) |

---

## 의존 함수 (festival.ts)

| BL | 함수 | detector |
|----|------|----------|
| FE-001 | `reserveEntry` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| FE-002 | `applyStageLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| FE-003 | `processStageEntry` | AtomicTransaction (`db.transaction(...)`) |
| FE-004 | `transitionEntryStatus` | StatusTransition (matrix) |
| FE-005 | `expireClosedEntryBatch` | StatusTransition (batch) |
| FE-006 | `processEntryRefund` | AtomicTransaction (`db.transaction(...)`) |
