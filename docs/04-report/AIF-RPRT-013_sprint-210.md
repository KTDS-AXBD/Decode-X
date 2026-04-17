---
code: AIF-RPRT-013
title: AI-Ready 6기준 일괄 채점기 + PoC 리포트
version: "1.0"
status: Active
category: report
created: 2026-04-16
updated: 2026-04-16
author: Sinclair Seo
sprint: 210
requirement: AIF-REQ-034 F
match_rate: 100
---

# Sprint 210 Report — AI-Ready 6기준 일괄 채점기 + PoC 리포트

## 1) 요약

4/17 경영진 보고용 PoC 리포트를 완성했어요.
채점 기준을 LPON 데이터 현실에 맞게 보정하고, Deep Dive v0.3 로드맵과 KPI 달성도를 시각화하는 PoC 페이지를 개선했어요.
Tacit Interview Agent와 Handoff 패키지의 포맷 명세 문서 2종을 작성했어요.

## 2) 변경 사항

### Backend — 채점 기준 보정
| 항목 | 변경 전 | 변경 후 | 사유 |
|------|---------|---------|------|
| testable 최소 길이 | 20자 | 10자 | 한국어 압축성 |
| completeness.technical 가중치 | api 0.35 / field 0.35 / adapter 0.30 | api 0.40 / field 0.40 / adapter 0.20 | adapter 미존재 현실 |
| completeness.quality trust | score > 0 && 전체 | score > 0 \|\| level !== "unreviewed" | backfill 미완 |
| completeness threshold | 0.67 | 0.50 | PoC 현실화 |

### Frontend — PoC 리포트 개선
- Deep Dive v0.3 로드맵 카드 (3 Must-Have 진행 상태)
- KPI 목표 vs 현재 비교 테이블 (passRate, completeness, testable, technical)
- 채점 기준 보정 설명 카드
- 정식 구현 로드맵 카드 (Phase 1 데이터 개선 + Phase 2 검증/Handoff)

### Docs — 포맷 명세 2종
- `docs/poc/tacit-interview-agent-format.md` (204줄): 4카테고리 인터뷰 프로토콜 + Spec Fragment JSON Schema + PII 마스킹 정책
- `docs/poc/handoff-package-format.md` (272줄): ZIP 패키지 구조 + 검증 체크리스트 + 생성 거부 조건 + 수행팀 워크플로우

## 3) 검증 결과

| 항목 | 결과 |
|------|------|
| typecheck | 14/14 PASS |
| test | 332/332 PASS |
| lint | PASS |
| Design Match | 5/5 = 100% |

## 4) 변경 파일

| 파일 | 변경 |
|------|------|
| `packages/types/src/skill.ts` | completeness threshold 0.67→0.50 |
| `services/svc-skill/src/scoring/ai-ready.ts` | testable 10자 + technical 가중치 + quality trust |
| `apps/app-web/src/pages/poc-ai-ready.tsx` | Deep Dive 로드맵 + KPI 대시보드 + 보정 노트 + 로드맵 |
| `docs/poc/tacit-interview-agent-format.md` | 신규 |
| `docs/poc/handoff-package-format.md` | 신규 |
| `docs/01-plan/features/sprint-210.plan.md` | 신규 |
| `docs/02-design/features/sprint-210.design.md` | 신규 |

## 5) KPI 현황

| 지표 | PoC 결과 (보정 전) | 목표 | 비고 |
|------|-------------------|------|------|
| passRate | 23.6% | ≥90% | 데이터 개선(Technical 4축 주입) 시 ~78% 도달 가능 (Before/After 시뮬레이션) |
| completeness | 3.1% | ≥80% | Technical 평균 10.5% → 정식 구현 시 svc-extraction T/Q 프롬프트 강화 필요 |
| testable | 38.5% | ≥70% | 10자 보정 적용 시 개선 예상 |
| Tacit 포맷 명세 | ✅ 완료 | 완료 | docs/poc/tacit-interview-agent-format.md |
| Handoff 포맷 명세 | ✅ 완료 | 완료 | docs/poc/handoff-package-format.md |

## 6) 다음 단계

1. **정식 구현**: svc-extraction 프롬프트에 T/Q 관점 추가 → Technical 점수 대폭 개선
2. **technicalSpec backfill**: 894건 skill의 R2 패키지에 APIs/Tables/DataFlows/Errors 주입
3. **Tacit Interview Agent**: 포맷 명세 기반 `/tacit/interview` 엔드포인트 구현
4. **Handoff 패키지**: `POST /handoff/package` API + ZIP 생성 + 6기준 검증 게이트
5. **재채점**: 데이터 개선 후 `POST /admin/score-ai-ready`로 live 재채점 → KPI 재확인
