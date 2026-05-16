# Spec Container — SRF-001 (서핑/해양 스포츠 합성 도메인)

**Skill ID**: SRF-001
**Domain**: Surfing (서핑/해양 스포츠 산업 — 스팟board한도/surferdailysession한도/세션batchatomic/board상태전환/만료suspendedboard일괄/session환불atomic)
**Source**: SYNTHETIC — 세션 306 후속8 F540, withRuleId 재사용 72번째 도메인 PoC (K-pop 다음 산업, 61번째 신규) 🏆🏆 1세션 9 Sprint 신기록 동률 도달
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (SF-001 ~ SF-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| SF-001 | 신규 board 예약 요청 시 | `spot.active_boards < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_ACTIVE_BOARDS_PER_SPOT) | board 예약 허용 + spot.active_boards 증가 | `E422-SPOT-CAPACITY-EXCEEDED` |
| SF-002 | 서퍼 session 요청 시 | `contract.session_used + session < dailySessionLimit` (var-vs-var, `limit` keyword) | session 적용 + session_used 증가 | `E422-DAILY-SESSION-LIMIT-EXCEEDED` |
| SF-003 | 서핑 세션 시작 atomic 요청 시 | `session_schedules.status = 'reserved'` | atomic: boards INSERT + session_schedules UPDATE + board_payments INSERT | `E404-SCHEDULE` |
| SF-004 | board 상태 전환 (reserved → riding → updated → finished / suspended / cancelled) | 허용 매트릭스 충족 | `session_schedules.status` UPDATE | `E404-SCHEDULE`, `E409-SCHEDULE` |
| SF-005 | suspended board 일괄 만료 처리 | `boards.status = 'suspended'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| SF-006 | session 환불 (suspended) atomic 요청 시 | `boards.status = 'suspended'` | atomic: board_refund_records INSERT + board_refunds INSERT + board_refund_records UPDATE | `E404-SUSPENDED-BOARD` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `spots` | active_boards 증가 (SF-001) | reserveBoard |
| `session_schedules` | INSERT (SF-001), status 갱신 (SF-003/SF-004) | reserveBoard / processSurfSession / transitionBoardStatus |
| `surfer_contracts` | session_used 증가 (SF-002) | applySessionLimit |
| `boards` | INSERT (SF-003), batch expire (SF-005) | processSurfSession / expireSuspendedBoardBatch |
| `board_payments` | INSERT (SF-003) | processSurfSession |
| `board_refund_records` | INSERT + status='refunded' (SF-006) | processSessionRefund |
| `board_refunds` | INSERT (SF-006) | processSessionRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_ACTIVE_BOARDS_PER_SPOT = 300` (SF-001 서핑 스팟별 동시 active board 기본 한도, 인기 서핑 스팟 안전 수용 인원)
- `dailySessionLimit = surfer_contracts.session_limit` (SF-002 서퍼 등급별 일일 session 한도, 시즌권자 정책 연계)

---

## 상태 머신

```
session_schedules: reserved → riding (SF-003 atomic)
session_schedules: riding ↔ updated (SF-004 transition, 스팟 변경)
session_schedules: riding|updated → finished (SF-004 transition, 정상 세션 종료)
session_schedules: reserved|riding → suspended (SF-004 transition, 기상악화/파도 조건 미달)
session_schedules: reserved|riding → cancelled (SF-004 transition)

boards: riding → updated → finished (정상 종료)
boards: suspended → expired (SF-005 batch — 데이터 보관 기간 만료)
boards: riding → suspended (기상악화/파도 긴급 중단, SF-006 session 환불 대상)

board_refund_records: pending → calculated → refunded (SF-006 atomic)
```

---

## 의존 함수 (surfing.ts)

| BL | 함수 | detector |
|----|------|----------|
| SF-001 | `reserveBoard` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| SF-002 | `applySessionLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| SF-003 | `processSurfSession` | AtomicTransaction (`db.transaction(...)`) |
| SF-004 | `transitionBoardStatus` | StatusTransition (matrix) |
| SF-005 | `expireSuspendedBoardBatch` | StatusTransition (batch) |
| SF-006 | `processSessionRefund` | AtomicTransaction (`db.transaction(...)`) |
