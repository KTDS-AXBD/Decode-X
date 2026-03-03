# Plan: retirement-pension-batch-analysis

> 퇴직연금 프로젝트 전체 문서 일괄 분석 계획

## 1. Overview

### 목표
`docs/retirement-pension-source/퇴직연금 프로젝트/` 하위 **764개 xlsx + 7개 docx + 1개 pptx = 총 772개 파싱 가능 문서**를 AI Foundry 파이프라인으로 분석한다.

### 제약 조건
- **LLM API 비용 최소화**: Stage 2~5 LLM 호출을 선별적으로 실행
- **내부 파서 우선**: svc-ingestion의 커스텀 xlsx 파서 활용 (API 비용 0)
- **Unstructured.io 허용**: docx/pptx/erwin 등 비-xlsx 파일에 사용 가능
- **Ralph Loop 활용**: 자율 태스크 루프로 단계별 자동 실행

### 결정 사항
- **대상 환경**: Production 직접 업로드
- **Organization ID**: `Miraeasset`
- **Stage 2+ 범위**: Tier 1+2 (38건)까지 Stage 2 (Structure Extraction) 실행, 예상 비용 ~$2

### 제외 대상
| 유형 | 수량 | 사유 |
|------|------|------|
| mp4 (동영상) | 50개 | 텍스트 추출 불가 |
| jpg (이미지) | 5개 | 컨설팅 사진, 정보가치 낮음 |
| zip (이미 해제) | 13개 | 해제된 파일을 개별 처리 |
| ~$temp 파일 | ~2개 | Excel 임시 파일 |

### ERwin 파일 처리 전략
- `퇴직연금_20211018_수정.erwin` (16MB) — ERwin Data Modeler 바이너리
- 바이너리에서 **827개 테이블 코드** 추출 확인 (INVENTORY.md §9.1)
- 접근법: ERwin 바이너리에서 텍스트 패턴 추출 → Markdown 변환 → txt로 업로드
- 테이블정의서(xlsx)와 교차 검증

---

## 2. 비용 분석

### Stage별 API 비용

| Stage | 처리 방식 | 비용 | 비고 |
|-------|----------|------|------|
| **Stage 1 (Ingestion)** | 내부 xlsx 파서 764건 | **$0** | screen-design + generic xlsx |
| Stage 1 (Ingestion) | Unstructured.io 8건 (docx 7 + pptx 1) | ~$0.08 | 건당 ~$0.01 (fallback) |
| **Stage 1 대안** | 내부 docx 파서 신규 개발 | **$0** | mammoth.js 활용, 장기 비용 절감 |
| Stage 1 (Ingestion) | ERwin 바이너리→txt 변환 후 업로드 | ~$0.01 | 1건 |
| Stage 2 (Extraction) | LLM (Sonnet/Haiku) | ~$15-30 | 772건 × ~$0.02-0.04/건 |
| Stage 3 (Policy) | LLM (Opus) | ~$50-100 | 선별 실행 권장 |
| Stage 4 (Ontology) | Workers AI (embedding) | **~$0** | 무료 tier |
| Stage 5 (Skill) | LLM (Sonnet) | ~$5-10 | 생성 건수에 따라 |

### 권장 전략
1. **Stage 1 전량 처리** (비용 ~$0) — 내부 파서로 772건 전부 파싱
2. **Stage 2 선별 처리** — Tier 1 (11건) + Tier 2 (16건) 우선
3. **Stage 3~5 점진적** — 파싱 품질 확인 후 확대

---

## 3. 문서 인벤토리 (772건)

### Tier 1: 프로젝트 산출물 — 핵심 문서 (22건, 업무개발 제외)

| # | 카테고리 | 파일 수 | 형식 | 파서 |
|---|----------|---------|------|------|
| 1 | 요구사항정의서 | 1 | xlsx | generic-xlsx |
| 2 | Gap분석서 | 1 | xlsx | generic-xlsx |
| 3 | 인터페이스목록 | 1 | xlsx | generic-xlsx |
| 4 | 메뉴구조도 | 1 | xlsx | generic-xlsx |
| 5 | 테이블설계서 (3건) | 3 | xlsx | generic-xlsx |
| 6 | 코드설계서 | 1 | xlsx | generic-xlsx |
| 7 | 요구사항추적표 | 1 | xlsx | generic-xlsx |
| 8 | 통합테스트시나리오 (3건) | 3 | xlsx | generic-xlsx |
| 9 | 테스트계획서 | 1 | pptx | unstructured.io 또는 내부 |
| 10 | 개발가이드문서 (7건) | 7 | docx | unstructured.io 또는 내부 |
| | **소계** | **20** | | |

### Tier 2: 업무별 목록류 (16건)

각 업무 영역의 화면목록 + 배치JOB목록 파일 (업무개발관련문서 내 `01. 상세설계/03. 화면목록`, `04. 배치JOB목록` 경로)

| 업무 영역 | 화면목록 | 배치JOB목록 |
|-----------|---------|------------|
| 01. 신계약 | 1 | 1 |
| 02. 운용지시 | 1 | 1 |
| 03. 지급 | 2 | 1 |
| 04. 적립금수수료 | 1 | 1 |
| 05. 업무공통 | 1 | 1 |
| 06. 상품제공 | 1 | 1 |
| 07. 법인영업정보 | 3 | — |
| **소계** | **11** | **5** |

### Tier 3: 화면설계서 — 462건

| 업무 영역 | 화면설계서 수 | 파서 |
|-----------|-------------|------|
| 01. 신계약 | 112 | screen-design |
| 02. 운용지시 | 51 | screen-design |
| 03. 지급 | 59 | screen-design |
| 04. 적립금수수료 | 45 | screen-design |
| 05. 업무공통 | 86 | screen-design |
| 06. 상품제공 | 24 | screen-design |
| 07. 법인영업정보 | 79 | screen-design |
| 모바일패드 | 6 | screen-design |
| **소계** | **462** | |

### Tier 4: 프로그램설계서 + 배치설계서 — 153건

| 유형 | 건수 | 파서 |
|------|------|------|
| 프로그램설계서 | 136 | generic-xlsx (siSubtype=프로그램설계) |
| 배치설계서 | 17 | generic-xlsx (siSubtype=배치설계) |

### Tier 5: 단위테스트케이스 — 129건

| 유형 | 건수 | 파서 | 비고 |
|------|------|------|------|
| 단위테스트케이스 | 129 | generic-xlsx | 검증용 보조 자료 |

---

## 4. 실행 계획

### Phase A: 배치 업로드 스크립트 개발 (Day 1)

**목표**: 772개 파일을 svc-ingestion에 자동 업로드하는 스크립트 작성

**태스크**:
1. `scripts/batch-upload.sh` — curl 기반 일괄 업로드 스크립트
   - 입력: 디렉토리 경로 + organization ID
   - 파일별 순차 업로드 (Rate limit 대응: 100ms 간격)
   - 진행률 표시 + 실패 재시도 (최대 3회)
   - 결과 로그: `batch-upload-{timestamp}.log`
2. `scripts/batch-status.sh` — 업로드 상태 확인 스크립트
   - GET /documents로 전체 문서 목록 조회
   - status=pending/parsed/failed 집계
3. 내부 DOCX 파서 추가
   - `mammoth` 또는 직접 XML 파싱으로 docx→text 변환
   - `svc-ingestion/src/parsing/docx.ts` 신규 개발
   - queue.ts 라우팅 로직에 docx→내부 파서 분기 추가
   - Unstructured.io는 fallback으로 유지
4. ERwin 바이너리→텍스트 변환 스크립트
   - `scripts/erwin-extract.sh` — ERwin 바이너리에서 테이블 코드 추출
   - 결과를 `erwin-tables.md`로 변환 후 txt 업로드

**비용**: $0 (스크립트 + 파서 개발만)

### Phase B: Tier 1 업로드 + 파싱 (Day 1)

**목표**: 핵심 문서 22건 + ERwin 1건 Stage 1 처리 완료

**태스크**:
1. Organization: `Miraeasset` (Production 환경)
2. Tier 1 문서 22건 + ERwin 변환본 업로드
3. 파싱 결과 확인 — chunks 품질 검증
4. Classification 정확도 점검

**대상 환경**: Production
**비용**: ~$0 (xlsx 내부 파서) + ~$0.08 (docx/pptx 8건, Unstructured.io fallback)

### Phase C: Tier 2~5 대량 업로드 (Day 1-2)

**목표**: 나머지 750건 Stage 1 처리

**태스크**:
1. Tier 2 (16건) 업로드 — 목록류
2. Tier 3 (462건) 업로드 — 화면설계서 (screen-design 파서)
3. Tier 4 (153건) 업로드 — 프로그램/배치설계서
4. Tier 5 (129건) 업로드 — 단위테스트
5. 전체 파싱 결과 집계: 총 chunks 수, 분류별 분포

**예상 소요**: 772건 × 100ms 간격 = ~77초 업로드 + 큐 비동기 파싱 ~10분
**비용**: $0 (전량 내부 xlsx 파서)

### Phase D: 파싱 품질 리포트 (Day 2)

**목표**: Stage 1 결과 품질 확인 + 후속 파이프라인 투입 여부 결정

**태스크**:
1. 품질 지표 집계 스크립트:
   - 문서별 chunk 수, 평균 word_count
   - classification 분포 (screen_design / erd / requirements / general)
   - 파싱 실패(status=failed) 건수 및 원인
2. 화면설계서 파싱 품질 샘플링 (10건):
   - XlScreenMeta / XlScreenLayout / XlScreenLogic 추출 확인
   - 누락 필드, 잘못된 분류 확인
3. 결정 포인트:
   - Stage 2+ 투입 범위 (Tier 1만 vs 전체)
   - LLM 비용 한도 설정

### Phase E: Stage 2 파이프라인 — Tier 1+2 (Day 2-3)

**목표**: Tier 1 (22건) + Tier 2 (16건) = 38건에 대해 Stage 2 (Structure Extraction) 실행

**전제**: Phase D 리뷰 후 파싱 품질 OK 시 실행
**비용**: ~$2.00 (38건 × Sonnet/Haiku)
**대상 환경**: Production (`Miraeasset`)

---

## 5. Ralph Loop 태스크 설계

Ralph는 아래 태스크를 순차 실행합니다:

```
## Ralph Tasks

### R-1: batch-upload 스크립트 작성
scripts/batch-upload.sh 작성 — curl 기반, 디렉토리 순회, 진행률 표시, 실패 재시도

### R-2: batch-status 스크립트 작성
scripts/batch-status.sh 작성 — 업로드 상태 조회 + 집계 (parsed/pending/failed)

### R-3: 내부 DOCX 파서 개발
services/svc-ingestion/src/parsing/docx.ts — mammoth.js 기반 docx→text+구조 변환
queue.ts 라우팅에 docx→내부 파서 분기 추가, Unstructured.io는 fallback 유지

### R-4: ERwin 바이너리→텍스트 변환
scripts/erwin-extract.sh — ERwin 바이너리에서 테이블 코드 추출 → Markdown 변환 → txt 업로드용

### R-5: 내부 DOCX 파서 테스트
개발가이드 docx 7건으로 파서 정확도 검증, Unstructured.io 결과와 비교

### R-6: Tier 1 문서 업로드 (22건 + ERwin 1건)
staging 환경에 요구사항정의서~개발가이드 + ERwin 변환본 업로드 + 결과 확인

### R-7: Tier 2 목록류 업로드 (16건)
화면목록 + 배치JOB목록 업로드

### R-8: Tier 3 화면설계서 업로드 (462건)
7개 업무영역 화면설계서 일괄 업로드 (screen-design 파서 사용)

### R-9: Tier 4 프로그램/배치설계서 업로드 (153건)
프로그램설계서 136건 + 배치설계서 17건

### R-10: Tier 5 단위테스트 업로드 (129건)
단위테스트케이스 129건 (보조 자료)

### R-11: 파싱 품질 리포트 생성
전체 773건 파싱 결과 집계 + 품질 지표 + 커버리지 리포트 + 다음 Stage 투입 추천
```

---

## 6. 기술 고려사항

### 6.1 내부 DOCX 파서 (R-3)

현재 DOCX는 Unstructured.io로만 처리. 내부 파서 개발:

```
Option A: mammoth.js (추천)
- npm: mammoth (MIT 라이선스)
- DOCX → HTML/Markdown 변환
- 테이블, 목록, 헤딩 보존
- Cloudflare Workers 호환 (pure JS)
- Unstructured.io 대비 latency 개선 (네트워크 왕복 제거)

Option B: 직접 XML 파싱
- DOCX = ZIP(XML) 구조
- JSZip + DOM 파싱
- 더 세밀한 제어 가능하나 개발 비용 높음
- Workers 환경에서 DOM API 제한 주의

구현 계획:
1. svc-ingestion/src/parsing/docx.ts 신규 파일
2. mammoth.js로 DOCX → Markdown 변환
3. Markdown을 UnstructuredElement[] 형태로 변환 (기존 파이프라인 호환)
4. queue.ts에서 fileType === "docx" || fileType === "doc" → parseDocx() 분기
5. Unstructured.io는 mammoth 실패 시 fallback으로 유지
6. 테스트: 개발가이드 7건으로 품질 비교
```

### 6.2 ERwin 바이너리 파싱 (R-4)

```
ERwin 파일 구조:
- AllFusion ERwin Data Modeler GDM 포맷
- 16MB 바이너리, 827개 테이블 코드 존재 (INVENTORY.md §9.1)
- 직접 파싱: 바이너리에서 UTF-8/UTF-16 텍스트 패턴 매칭

변환 계획:
1. scripts/erwin-extract.sh — strings 명령 + 패턴 필터링
2. 테이블 코드 체계별 그룹핑 (TB_RPOM, TB_RPCM 등)
3. Markdown 형식으로 변환
4. .txt 파일로 저장 후 svc-ingestion에 업로드
5. 테이블정의서(xlsx)와 교차 검증
```

### 6.2 대량 업로드 시 주의사항

- **Queue 배치 처리**: max_batch_timeout 30초 → 동시 수십 건 처리 가능
- **D1 write 한도**: Workers Free = 100K writes/day → 772건 × ~10 chunks = ~7,700 writes (한도 내)
- **R2 업로드**: 50MB 제한 → 모든 대상 파일이 제한 내
- **Rate limiting**: 100ms 간격이면 초당 10건 → ~77초 완료

### 6.3 Organization 전략

**결정**: `Miraeasset` — Production 환경에서 단일 Organization으로 관리

---

## 7. 성공 기준

| 지표 | 목표 |
|------|------|
| Stage 1 파싱 성공률 | >= 95% (773건 중 734건 이상) |
| 화면설계서 분류 정확도 | >= 90% (screen_design으로 올바르게 분류) |
| XlScreenLogic 추출률 | >= 80% (화면설계서 462건 중 370건 이상에서 로직 추출) |
| 내부 파서 처리율 | >= 99% (docx 내부 파서 + xlsx 내부 파서로 처리) |
| 외부 API 호출 | <= 2건 (pptx 1건 Unstructured.io + docx fallback) |
| 총 파싱 chunks 수 | >= 10,000 (773건 × 평균 13+ chunks) |
| 전체 소요 시간 | Stage 1 완료까지 < 30분 |

---

## 8. 리스크 & 완화

| 리스크 | 영향 | 완화 방안 |
|--------|------|----------|
| 화면설계서 포맷 불일치 | 파싱 실패 증가 | screen-design 파서의 fallback 경로 확인 |
| D1 write 한도 초과 | 일부 건 미처리 | 배치 간 간격 조절 (Tier별 분리) |
| Queue 백프레셔 | 파싱 지연 | batch_timeout + waitUntil 비동기 |
| Staging vs Production 차이 | 배포 시 불일치 | staging에서 충분히 검증 후 production |
| 대용량 xlsx (>5MB) | 파싱 타임아웃 | MAX_ELEMENTS_XLSX=500 제한 확인 |
