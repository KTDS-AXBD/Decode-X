---
id: sprint-214a
title: "Sprint 214a — Track A Fill: 예산 + 구매 spec-container 신규 생성"
req: AIF-REQ-035
phase: Phase 2 D1
sprint: 214a
status: IN_PROGRESS
created: 2026-04-20
---

# Plan — Sprint 214a

## 목표

LPON 온누리상품권 시스템의 **예산(Budget)** 과 **구매(Purchase)** 도메인에 대한
spec-container를 신규 생성한다.

Phase 1의 lpon-charge 방법론을 재활용하여 각 도메인별로 2~3개의 Empty Slot을
발굴하고 condition-criteria-outcome 트리플로 채운다.

## 범위

### 신규 생성 대상

| 도메인 | Skill ID | Empty Slots | 경로 |
|--------|----------|:-----------:|------|
| 예산 관리 | POL-LPON-BUDGET-001 | 3 | `.decode-x/spec-containers/lpon-budget/` |
| 상품권 구매 | POL-LPON-PURCHASE-001 | 3 | `.decode-x/spec-containers/lpon-purchase/` |

### 각 spec-container 구조

```
lpon-{domain}/
├── provenance.yaml          # 출처 추적
├── rules/
│   ├── {domain}-rules.md    # 전체 비즈니스 룰 표
│   └── ES-{DOMAIN}-NNN.md   # Empty Slot 개별 정의
├── runbooks/
│   └── ES-{DOMAIN}-NNN.md   # 운영 가이드
└── tests/
    ├── ES-{DOMAIN}-NNN.yaml  # Empty Slot 테스트 시나리오
    └── contract/
        └── {domain}-contract.yaml  # 계약 테스트
```

## KPI

| 지표 | 목표 |
|------|------|
| 완결성 | ≥95% (각 BL condition-criteria-outcome 완비) |
| AI-Ready 6기준 | ≥70% |
| 소스 출처 추적성 | 100% (provenance.yaml 출처 명시) |

## 소스 원장

- `반제품-스펙/pilot-lpon-cancel/01-business-logic.md` — 핵심 BL 소스
- `반제품-스펙/pilot-lpon-cancel/02-data-model.md` — 데이터 구조
- `반제품-스펙/pilot-lpon-cancel/03-functions.md` — 기능 정의
- AI Foundry db-policy (production) LPON 도메인 정책 44건

## 제외 사항

- 코드(TypeScript) 구현 없음 — spec-container 문서만
- DB migration 없음
- API 엔드포인트 구현 없음 (별도 Sprint 215+ 에서 처리)
