# Spec Container — CONVENTION-001 (컨벤션 합성 도메인)

**Skill ID**: CONVENTION-001  
**Domain**: Convention (컨벤션 산업 — 세션동시한도/부스한도/부스등록atomic/세션상태전환/closed세션일괄만료/세션환불atomic)  
**Source**: SYNTHETIC — 세션 309 F552, withRuleId 재사용 83번째 도메인 PoC (Planetarium 다음 산업, 72번째 신규) ✏️ 단일 클러스터 14 도메인 첫 사례 마일스톤 신기록 도전  
**Version**: 1.0.0  
**Status**: active  

---

## 비즈니스 룰 (CV-001 ~ CV-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| CV-001 | 신규 convention session 예약 요청 시 | `convention.active_sessions < max_concurrent_sessions` (UPPERCASE fallback MAX_CONCURRENT_SESSIONS_PER_CONVENTION) | 세션 예약 허용 + convention.active_sessions 증가 | `E422-CONVENTION-SESSION-LIMIT-EXCEEDED` |
| CV-002 | 회원 부스 예약 요청 시 | `membership.booth_used + booths < boothLimit` (var-vs-var, `limit` keyword) | 부스 적용 + booth_used 증가 | `E422-BOOTH-LIMIT-EXCEEDED` |
| CV-003 | 부스 등록 atomic 요청 시 | `convention_sessions.status = 'reserved'` | atomic: booth_schedules INSERT + convention_sessions UPDATE + session_payments INSERT | `E404-SESSION` |
| CV-004 | 세션 상태 전환 (reserved → ongoing → ended / closed / cancelled) | 허용 매트릭스 충족 | `convention_sessions.status` UPDATE | `E404-SESSION`, `E409-SESSION` |
| CV-005 | closed 세션 일괄 만료 처리 | `convention_sessions.status = 'closed'` AND `scheduled_at <= now` | `status='ended'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| CV-006 | 세션 환불 atomic 요청 시 | `convention_sessions.status = 'cancelled'` | atomic: cancelled_fee_records INSERT + session_refunds INSERT + cancelled_fee_records UPDATE | `E404-CANCELLED-SESSION` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `conventions` | active_sessions 증가 (CV-001) | reserveSession |
| `convention_sessions` | INSERT (CV-001), status 갱신 (CV-003/CV-004/CV-005) | reserveSession / processBoothBooking / transitionSessionStatus / expireClosedSessionBatch |
| `convention_memberships` | booth_used 증가 (CV-002) | applyBoothLimit |
| `booth_schedules` | INSERT (CV-003) | processBoothBooking |
| `session_payments` | INSERT (CV-003) | processBoothBooking |
| `cancelled_fee_records` | INSERT + status='refunded' (CV-006) | processSessionRefund |
| `session_refunds` | INSERT (CV-006) | processSessionRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_SESSIONS_PER_CONVENTION = 200` (CV-001 컨벤션별 동시 active 세션 기본 한도 — 동시 진행 세션 수 기반, B2B 컨벤션 200)
- `boothLimit = convention_memberships.booth_limit` (CV-002 멤버십 유형별 부스 한도, standard/premium/annual 멤버십 정책 연계)

---

## 상태 머신

```
convention_sessions: reserved → ongoing (CV-003 atomic)
convention_sessions: ongoing → ended (CV-004 transition, 세션 완료)
convention_sessions: ongoing → closed (CV-004 transition, 컨벤션 운영 종료)
convention_sessions: reserved | ongoing → cancelled (CV-004 transition)

booth_schedules: active → completed (정상 완료)
booth_schedules: active → cancelled (취소)

convention_sessions: closed → ended (CV-005 batch — 운영 종료 후 자동 처리)

cancelled_fee_records: pending → calculated → refunded (CV-006 atomic)
```

---

## CV 차별성 (MS 박물관, EX 박람회와 분리)

| 항목 | MS (박물관) | EX (박람회) | CV (컨벤션) |
|------|------------|------------|------------|
| 핵심 활동 | 정적 전시 관람 | 단기 박람회 부스 | 다중 트랙 회의/컨벤션 세션 |
| 공간 구조 | 전시홀 | 부스 배치 | 컨벤션홀 + 다중 트랙 |
| 등록 방식 | 입장권 | 부스 임대 | 세션 + 부스 복합 등록 |
| 기간 | 장기 상설 | 단기 (3-7일) | 단기 (1-5일) |
| 동시 한도 | 500 | 400 | 200 (세션별 동시 진행) |
| 핵심 차별 단어 | exhibit/gallery/artwork | booth/exhibitor/trade | session/booth/concurrent/track |

---

## 의존 함수 (convention.ts)

| BL | 함수 | detector |
|----|------|----------|
| CV-001 | `reserveSession` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| CV-002 | `applyBoothLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| CV-003 | `processBoothBooking` | AtomicTransaction (`db.transaction(...)`) |
| CV-004 | `transitionSessionStatus` | StatusTransition (matrix) |
| CV-005 | `expireClosedSessionBatch` | StatusTransition (batch) |
| CV-006 | `processSessionRefund` | AtomicTransaction (`db.transaction(...)`) |
