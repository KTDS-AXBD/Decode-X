# Sprint 2 — T2 Shadow Mode 설계 (1 라인)

**Sprint**: 2
**작성일**: 2026-04-19
**목적**: T2 Prototype Shadow Mode의 개념 검증. Sprint 3에서 실 인프라 연동.

---

## 개념

Shadow Mode = Plumb E2E를 실제 요청 경로와 **병렬로 실행**하되,
결과를 `decisions.jsonl`에만 기록하고 서비스 응답에 영향을 주지 않는 모드.

```
[이용자 요청]
     │
     ├──── [기존 처리 경로] ──→ [응답]
     │
     └──── [Shadow Plumb 호출] ──→ [decisions.jsonl 기록만]
                                   (응답에 영향 없음)
```

---

## Sprint 2 구현: 1 라인 마커

Sprint 2에서는 실 병렬 실행 없이, `decisions.jsonl`에 shadow 마커 엔트리만 추가한다.
이것이 "1 라인"의 의미 — 인프라 없이 개념 검증.

추가된 엔트리 위치: `.foundry-x/decisions.jsonl` (마지막 줄)

---

## Sprint 3 확장 계획

| 단계 | 내용 |
|------|------|
| Sprint 3 T2-A | `plumb-e2e.sh`에 `--shadow` 플래그 추가 → decisions.jsonl에 mode=shadow 자동 기록 |
| Sprint 3 T2-B | Cloudflare Queue에 shadow 이벤트 발행 → 비동기 Plumb 호출 |
| Sprint 4 | Shadow 결과 대시보드 (decisions.jsonl 통계) |

---

## 판단 기준 (Shadow Mode 전환 조건)

Phase 2에서 실 생산 트래픽에 Shadow Mode 적용 시:
- Shadow Plumb 성공률 ≥ 90% (5연속 green)
- Shadow 응답 지연 < 500ms (p95)
- 기존 경로 응답에 영향 없음 (p99 latency 변화 < 5ms)
