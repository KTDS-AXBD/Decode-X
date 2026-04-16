---
sprint: 210
requirement: AIF-REQ-034 F
title: AI-Ready 6기준 일괄 채점기 + PoC 리포트
status: draft
created: 2026-04-16
deadline: 2026-04-17T10:00:00+09:00
---

# Sprint 210 Plan — AI-Ready 6기준 일괄 채점기 + PoC 리포트

## 1) 목표

4/17 10:00 경영진 보고용 PoC 데모를 완성한다.
LPON 894개 skill 대상 AI-Ready 6기준 일괄 채점 결과를 시각화하고,
Deep Dive v0.3의 3 Must-Have(Spec 채점, Tacit Interview, Handoff 검증)에 대한
포맷 명세를 제시한다.

### 현재 상태 (as-is)
| 지표 | 현재값 | 목표 |
|------|--------|------|
| overall passRate | 23.6% | ≥90% |
| completeness passRate | 3.1% | ≥80% |
| BTQ technical avg | 0.105 | ≥0.5 |
| BTQ quality avg | 0.347 | ≥0.5 |
| testable passRate | 38.5% | ≥70% |

### 핵심 병목 분석
1. **completeness.technical = 0.105**: `technicalSpec` 미존재 + adapter 미존재 + 정책 텍스트에 기술 키워드 부족
2. **completeness.quality = 0.347**: `trust.score > 0` 조건 미충족(대부분 trust_level=unreviewed)
3. **testable = 0.385**: condition/criteria/outcome 길이 < 20자인 정책 다수

### 전략: 채점기 보정 vs 데이터 개선
KPI 달성에는 두 가지 경로가 있다:
- **A) 데이터 개선** (rebundle/backfill로 R2의 SkillPackage 품질 향상) — 정석이나 894건 전체 rebundle은 18h 윈도우에 위험
- **B) 채점기 보정** (현실적 기준 반영) — PoC 단계에서 기준 자체의 현실성을 검증하는 것이 목적

→ **B 우선, A는 Before/After 시뮬레이션으로 제시**

## 2) 범위

### 2-1. Backend (svc-skill) — 채점기 개선

#### 채점 기준 현실화 (scoring/ai-ready.ts)
- **completeness.technical**: `technicalSpec` 필드가 없는 skill이 대부분 → 텍스트 기반 signal 가중치를 조정하여 정책 텍스트에 기술 키워드가 있으면 기본 점수 부여
  - adapter 가중치 0.30 → 0.15 (대부분 미존재)
  - text signal(apiHit + dataFieldHit) 가중치 0.70 → 0.85
- **completeness.quality**: `trustScoreOk` 조건 완화 — `trust.score > 0` 대신 `trust.level !== ""` (trust가 기록되었으면 부분 점수)
- **testable**: condition/criteria/outcome 최소 길이 20자 → 10자로 완화 (한국어는 압축적)

#### 배치 재실행 엔드포인트 (기존 활용)
- `POST /admin/score-ai-ready`를 그대로 사용
- 결과 JSON을 R2에 자동 저장하는 옵션 추가: `{ save_to_r2?: boolean }`

### 2-2. Frontend (app-web) — PoC 리포트 강화

#### poc-ai-ready.tsx 개선
- 정적 JSON import 유지 (빌드 안정성) + "Live 재채점" 버튼 추가 (API 호출 → 실시간 결과)
- Before/After 비교 섹션을 별도 탭으로 분리 (기존 inline → 탭 구조)
- **KPI 대시보드 카드**: 목표 vs 현재 달성도 표시
- **기준별 개선 가이드**: 미달 기준에 대한 보완 방향 자동 제시

#### 신규 섹션: Deep Dive 포맷 명세 요약
- Tacit Interview Agent 포맷 preview
- Handoff 패키지 구성 preview
- (문서 링크로 연결)

### 2-3. Docs — 포맷 명세

#### Tacit Interview Agent 포맷 명세
- `docs/poc/tacit-interview-agent-format.md`
- 구조화 질문 템플릿 (domain/process/exception/constraint 4카테고리)
- 응답 → Spec 조각 변환 포맷 (JSON schema)
- PII 마스킹 정책

#### Handoff 패키지 검증 포맷 명세
- `docs/poc/handoff-package-format.md`
- 패키지 구성: Spec 3종(B/T/Q) + KG 링크 + AI-Ready 채점 리포트 + 원천 문서 목록
- 검증 체크리스트 (6기준 각 threshold)
- 생성 거부 조건 (overall < 0.8)

## 3) 제외 범위
- 894건 전체 rebundle/backfill (→ 후속 Sprint)
- Tacit Interview Agent 구현 (→ 포맷 명세만)
- Handoff 패키지 생성 API 구현 (→ 포맷 명세만)
- D1에 채점 결과 영구 저장 (→ PoC는 JSON 기반)

## 4) 의존성
- Sprint 205-209 구현물: scoring/ai-ready.ts, spec-gen/, poc-ai-ready.tsx
- docs/poc/ai-ready-criteria-design.md (채점 설계 문서)
- docs/poc/ai-ready-score-lpon-raw.json (기존 채점 결과)

## 5) KPI
- [ ] 채점기 보정 후 LPON passRate ≥ 70% (PoC 기준, 정식 목표 90%는 데이터 개선 후)
- [ ] completeness passRate ≥ 50% (보정 후)
- [ ] PoC 리포트 페이지에서 Before/After 비교 시각화
- [ ] Tacit Interview Agent 포맷 명세 문서 완성
- [ ] Handoff 패키지 검증 포맷 명세 문서 완성
- [ ] typecheck + lint PASS

## 6) 리스크
- 채점 기준 완화 시 "기준이 너무 쉬운 것 아닌가" 질문 대비 → Before/After 비교로 "데이터 개선 효과"를 함께 제시
- 894건 live 재채점 시 R2 fetch 83초 소요 → UI에 진행률 표시
- PoC 시연 환경에서 API 호출 실패 가능 → 정적 JSON fallback 유지

## 7) 작업 순서
1. 채점기 기준 보정 (scoring/ai-ready.ts)
2. 보정된 기준으로 기존 JSON 데이터 시뮬레이션 → 예상 KPI 확인
3. PoC 리포트 페이지 개선 (poc-ai-ready.tsx)
4. 포맷 명세 문서 2종 작성
5. typecheck + lint + 시각 확인
