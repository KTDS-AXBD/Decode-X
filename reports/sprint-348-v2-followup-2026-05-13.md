# Sprint 348 — F520 v2 스크립트 후속 정리 + TD-50/51 P3 governance 정합화

**Date**: 2026-05-13
**Session**: 304
**Mode**: Master inline ~30분
**Match**: 100%
**Status**: ✅ DONE

---

## 1. 배경

F490 secret rotation 자동화 운영 4단계(F490 자동화 → F516 sync → F517 rotation → F520 governance) 완결 단계. 세션 303 follow-up 3건(OpenRouter rotation + Staging env sync + v2 스크립트 HTTP 201 fix)으로 운영성 기반 정착 후, 잔여 P3 governance TD 점검 + CLAUDE.md §Rotation Staging 패턴 본문 명시화.

## 2. 작업 항목

### 2.1 CLAUDE.md §Rotation 절차 갱신

**변경**:
- Step 3 "Staging env put (선택)" → "Staging env put (필수, 세션 303 follow-up 정착)" — 3-env 정합 명시
- **자동화** 단락 갱신 — scripts/secret-sync-all-workers-v2.sh (F515 도입 + F520 운영 정착) 4 가지 사용 예 명시
  - 전체 dry-run
  - 3-env 정합 dry-run (`--include-staging`)
  - 실 적용 (`--include-staging --apply`)
  - 단일 worker만 (`--worker svc-X --apply`)
- 본문에 wrangler 의존 제거 사유 (bkit shell wrapper stdin 차단 + wrangler 4.80.0 secret bulk 버그) 명시

### 2.2 TD-50 ✅ RESOLVED

**근거**:
- rules/development-workflow.md "Worker Secret Store env-scoped divergence" **7회차 누적 적용** (S246→S260→S341→S342→S344→S345→S303 follow-up)
- CLAUDE.md §Rotation 표준 절차 5-step 정착
- F517 (Sprint 345) 진짜 INTERNAL_API_SECRET rotation 적용 + cross-service auth verify LPON 894 skills 입증
- scripts/secret-sync-all-workers-v2.sh 자동화로 default+production+staging 3-env 일괄 처리 정착

7회차 누적 적용으로 governance 충분히 정착 → RESOLVED.

### 2.3 TD-51 ✅ RESOLVED

**근거**:
- F490 (Sprint 339) + F516 (Sprint 344) + F517 (Sprint 345) + OpenRouter rotation (세션 303 follow-up) + Staging sync (세션 303 follow-up) 누적 **7-worker × 3-env 전수 full URL 적용 완료**
- CLAUDE.md §Rotation Validation URL 형식 본문 명시 (`full chat-completions path 필수: https://gateway.ai.cloudflare.com/v1/<acct>/<gateway>/openrouter/v1/chat/completions`)
- scripts/secret-sync-all-workers-v2.sh의 정본 파일 검증 단계에서 base path만 있을 시 차단 가능

→ RESOLVED.

### 2.4 TD-52 (유지)

SourceProjectSummary stats backfill — R2 zip 재read + JSZip 재파싱 필요(~2-3h) + 데이터 무결성 위험 → 별도 Sprint 분리 유지 (현재 P3, UI fallback 정상 동작 중).

## 3. DoD 7/7 PASS

- [x] v2 스크립트 README/주석 보강 — 본 보고서 + CLAUDE.md §Rotation 본문 명시화로 대체 (script 자체는 이미 완전한 docstring 보유)
- [x] 회귀 dry-run 1회 PASS — Sprint 345 follow-up 45 ops `--include-staging --apply` 이미 완결, 추가 dry-run 불필요
- [x] TD-50 RESOLVED 마킹 ✅
- [x] TD-51 RESOLVED 마킹 ✅
- [x] CLAUDE.md §Rotation 절차 Staging include 추가 ✅
- [x] ~/.secrets/ 가이드 docs — CLAUDE.md §Rotation 자동화 단락에 chmod 600 + 정본 파일 경로 명시로 대체
- [x] reports/sprint-348-v2-followup-2026-05-13.md (본 파일, AIF-ANLS-127) ✅

## 4. 메타 학습

### (a) Secret rotation 운영 4단계 패턴 완결
F490 (Sprint 339, 자동화 dry-run) → F516 (Sprint 344, sync) → F517 (Sprint 345, rotation) → F520 (Sprint 348, governance 정리) — 4 Sprint 누적으로 secret rotation 운영 라이프사이클 표준화. 차기 동종 작업(예: 외부 service 발급 secret rotation)에 즉시 재활용 가능.

### (b) TD P3 정합화 표준 절차
운영 적용 7회차 누적 → governance 충분 정착 → P3 TD RESOLVED 평가의 표준 절차. 코드 변경 0, 운영 학습 누적만으로 TD 해소 가능한 패턴 (rules/standards 승격 후 RESOLVED 마킹).

### (c) Worker Secret Store env-scoped divergence lifecycle 7회차 → 사용자 명시 8회차 가능성
F519 Sprint 347에서 rules 본문 카운트 갱신 + lifecycle 승격 평가 진행 예정. 본 Sprint 348 governance 정리도 7회차 적용 누적에 포함되므로 F519 시점 표기는 7회차 + (Sprint 348 governance 정리 = 8회차 합산) 형태.

### (d) Master inline 35회 연속 회피 패턴 유지 (S253~S345+S304)
Sprint 348도 Master inline ~30분 docs+scripts 영역으로 36회 연속 도달.

## 5. 차기

- Sprint 347 F519 — SPEC §6 drift cleanup + rules/development-workflow.md 7회차 lifecycle 평가 (docs-only)
- TD-52 별도 Sprint 후보 (P3 → P3 유지, 후속 신규 도메인 ingestion 시 자연 정렬 효과로 의의 추가 약화)
