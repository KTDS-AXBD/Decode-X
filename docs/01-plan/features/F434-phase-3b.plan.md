---
id: AIF-PLAN-065
title: "F434 — F358 Phase 3b: BL-level Production 통합 + F356-A 재평가 + LPON 35 R2 재패키징 + TD-28 해소"
sprint: 267
f_items: [F434]
status: ACTIVE
created: 2026-05-06
---

# AIF-PLAN-065 — F434 Phase 3b

## §1 배경

- **Phase 1 ✅** Sprint 254: Tree-sitter Workers 호환성 PASS, 17건 silent drift 검출
- **Phase 2 ✅** Sprint 257 PR #52: production 통합 MERGED (Master 독립 검증 PASS)
- **Phase 3a ✅** Sprint 258: Production smoke + Drift 정량화 (17→0) + F354 자동화 분석
- **Phase 3b (本 Sprint)**: 잔여 — BL-level production 통합 + F356-A 재평가 + LPON R2 재패키징 + TD-28 해소

누적 인프라 현황:
- `BL_DETECTOR_REGISTRY` 31종 (Sprint 259~266 누적)
- `detect-bl --all-domains` CLI (scripts/divergence/detect-bl.ts)
- `write-provenance --all-domains --apply` CLI (scripts/divergence/write-provenance.ts)
- DOMAIN_MAP 7개 도메인, 전부 `sourceCodeStatus: "present"`
- `evaluate.ts` F356-A 채점기 (scripts/ai-ready/evaluate.ts, 정확도 83.3%)
- `CLOUDFLARE_API_TOKEN_KTDS` 환경변수 (bashrc)

## §2 목표

| ID | 워크스트림 | 우선순위 |
|----|-----------|---------|
| WS-1 | BL-level production 통합 — detect-bl + write-provenance 7 containers 일괄 | P0 |
| WS-2 | DIVERGENCE 5건 production 매트릭스 — 분석 문서 신설 | P0 |
| WS-3 | F356-A 재평가 — 7 spec-containers 평가 reports | P1 |
| WS-4 | LPON 35 R2 재패키징 — rebundle wrapper 실행 | P1 |
| WS-5 | TD-28 ✅ 해소 + SPEC 갱신 | P0 |

## §3 DoD

1. **WS-1**: `write-provenance --all-domains --dry-run` + `--apply` 실행 결과 7 containers 출력 기록 (ABSENCE markers 0건 = PRESENCE 전원 자동 입증)
2. **WS-2**: `docs/03-analysis/features/F358-phase-3b-divergence.analysis.md` 신설 — DIVERGENCE 5건 × (BL-ID / severity / detector status / production 상태) 매트릭스
3. **WS-3**: `reports/sprint-267-f356a-evaluation-YYYY-MM-DD.{json,md}` 실파일 생성 — 7 containers 채점 결과 (정확도 목표 ≥ 80% avg)
4. **WS-4**: LPON 도메인별 rebundle 실행 + R2 sample 5건 HTTP 200 verify (`GET /skills/{id}` + AI-Ready evaluate 1건)
5. **WS-5**: SPEC.md §8 `TD-28` → `~~TD-28~~` 취소선 + RESOLVED 마킹, F434 `[~]` → `[x]` 마킹
6. **공통**: typecheck + lint clean + Match ≥ 90%

## §4 구현 순서

```
Step 1: detect-bl --all-domains (7 containers 일괄 실측)                [WS-1, 30m]
Step 2: write-provenance --all-domains --dry-run → --apply              [WS-1, 20m]
Step 3: DIVERGENCE 5건 매트릭스 분석 문서 작성                           [WS-2, 30m]
Step 4: F356-A evaluate.ts 실행 (7 containers, OpenRouter API)          [WS-3, 60m]
Step 5: LPON rebundle wrapper 실행 (CF API token)                       [WS-4, 60m]
Step 6: R2 sample 5건 HTTP verify                                       [WS-4, 20m]
Step 7: SPEC TD-28 RESOLVED + F434 DONE 마킹                            [WS-5, 20m]
Step 8: reports 정리 + commit                                            [공통, 20m]
```

## §5 파일 매핑

| 파일 | 변경 유형 | WS |
|------|-----------|----|
| `scripts/divergence/detect-bl.ts` | 신규 실행 (코드 변경 없음) | WS-1 |
| `scripts/divergence/write-provenance.ts` | 신규 실행 (코드 변경 없음) | WS-1 |
| `.decode-x/spec-containers/*/provenance.yaml` | write-provenance --apply 결과 (0 ABSENCE = 변경 없음 예상) | WS-1 |
| `docs/03-analysis/features/F358-phase-3b-divergence.analysis.md` | 신규 생성 | WS-2 |
| `scripts/divergence/rebundle-all-domains.ts` | 신규 생성 (LPON rebundle wrapper) | WS-4 |
| `reports/sprint-267-f356a-evaluation-*.{json,md}` | 신규 생성 | WS-3 |
| `reports/sprint-267-phase-3b-summary.md` | 신규 생성 | WS-5 |
| `SPEC.md` | TD-28 RESOLVED + F434 DONE 마킹 | WS-5 |

## §6 위험 관리

| 위험 | 대응 |
|------|------|
| F356-A 평가 LLM 비용 초과 ($25 warn 내) | evaluate.ts cost guard 활성화 (Sprint 232 설계) |
| LPON rebundle LLM 비용 ($1~3) | 도메인별 순차 실행, 중간 실패 시 중단 가능 |
| write-provenance --apply가 예상치 않은 변경 발생 | dry-run 결과 확인 후 --apply |
| CF token 권한 부족 (R2 PUT) | CLOUDFLARE_API_TOKEN_KTDS wrangler r2 write 권한 사전 확인 |

## §7 범위 밖

- 전수 LPON Java 소스 재파싱 (5개 샘플 외 원본 Java 미보유 — Phase 4 이관)
- D1 policies 재추출 (re-ingestion 불필요, D1은 Tree-sitter 전환 후 신규 ingestion 대상)
- LPON 35 개별 .skill.json Tree-sitter 기반 spec 업데이트 (정책 레벨은 D1 기반, endpoint 레벨은 별도)
