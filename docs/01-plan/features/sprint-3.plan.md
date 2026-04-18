---
sprint: 3
title: Sprint 3 Plan — T3 결정적 생성 PoC 2종 + 재평가 Gate + ES-CHARGE-004/005/008 Fill
req: AIF-REQ-035
created: 2026-04-19
status: confirmed
timebox: ~90분
---

# Sprint 3 Plan — T3 결정적 생성 PoC 2종 + 재평가 Gate + ES-CHARGE-004/005/008 Fill

**상위 REQ**: `AIF-REQ-035` (Decode-X v1.3 본 개발, IN_PROGRESS)
**선행 Sprint**: Sprint 2 ✅ PASS (`R2 LLM 예산 + T2 Shadow Mode + ES-CHARGE-001/002/003 Fill 완성`)
**작성일**: 2026-04-19
**시간 예산**: ~90분

---

## 1. Sprint 3 목표 (SMART)

| ID | 목표 | Measurable | Timebox |
|:--:|------|-----------|---------|
| S3-T3 | T3 결정적 생성 PoC 2종 | Temperature=0 전략 검증 문서 + Seed 고정 전략 검증 문서 각 1건 | ~30분 |
| S3-F | Empty Slot Fill 잔여 3건 | ES-CHARGE-004/005/008 × 3자(rules+tests+runbooks) = 9파일 생성 | ~45분 |
| S3-G | 재평가 Gate 판정 | T1 green 누적 + T3 2종 동작 확인 → GO/NO-GO 판정 | ~15분 |

---

## 2. 스코프

### 2.1 In Scope
- T3 결정적 생성 전략 2종: Temperature=0 + Seed 고정 PoC
- ES-CHARGE-004 Fill (자동충전 중복 실행 방지 락)
- ES-CHARGE-005 Fill (명절/이벤트 기간 충전 한도 일시 증량)
- ES-CHARGE-008 Fill (이중 출금 감지 — 타임아웃 후 재호출)
- Phase 1 재평가 Gate 판정 (Sprint 4~5 진행 여부 결정)

### 2.2 Out of Scope (Sprint 4+)
- Self-Consistency Voting PoC (T3 3번째 기법 — Sprint 4 검토)
- ES-CHARGE-006/007/009 Fill
- T2 Shadow Mode 실 인프라 (Cloudflare Queue 연동)
- Tier-A 나머지 서비스(예산/구매/결제/환불/선물/정산)

---

## 3. 과업 분해

### 3.1 T3 결정적 생성 PoC (S3-T3)

| 작업 | 산출물 | 분 |
|------|--------|:--:|
| Temperature=0 전략 검증 | `docs/poc/sprint-3-t3-deterministic-poc.md` §1 | 15 |
| Seed 고정 전략 검증 | `docs/poc/sprint-3-t3-deterministic-poc.md` §2 | 15 |

### 3.2 Empty Slot Fill (S3-F)

| 작업 | 산출물 | 분 |
|------|--------|:--:|
| ES-CHARGE-004 Fill (자동충전 중복 락) | rules+tests+runbooks 3파일 | 15 |
| ES-CHARGE-005 Fill (명절 한도 증량) | rules+tests+runbooks 3파일 | 15 |
| ES-CHARGE-008 Fill (이중 출금 감지) | rules+tests+runbooks 3파일 | 15 |

### 3.3 재평가 Gate (S3-G)

| 작업 | 산출물 | 분 |
|------|--------|:--:|
| Gate 판정 기준 점검 | T1 green 회차 + T3 동작 확인 | 5 |
| Sprint 3 출구 점검 작성 | `docs/poc/sprint-3-exit-check.md` | 10 |

---

## 4. 성공 기준

| 항목 | 기준 |
|------|------|
| T3 PoC | 2종 전략 검증 문서 + 재현성 결과 기록 |
| Fill 완성도 | 3건 × 3자(rules+tests+runbooks) = 9파일 |
| 재평가 Gate | GO 또는 CONDITIONAL-GO 판정 + 근거 기록 |

---

## 5. Sprint 4 이관

- Self-Consistency Voting PoC (T3 3번째)
- ES-CHARGE-006/007/009 Fill (또는 다음 도메인 이동)
- B/T/Q Spec Schema 완결성 검증
