# Handoff Package — 포맷 명세 (PoC)

> **상태**: PoC 포맷 명세 (2026-04-17 임원 발표용)
> **목적**: 이 문서는 구현 가이드가 아닌 형식·데이터 구조 확정 문서입니다.

---

## 1. 목적

Decode-X 파이프라인이 생성한 SkillPackage와 AI-Ready 채점 결과를 **수행팀(개발팀)이 즉시 착수할 수 있는 형태**로 패키징하여 전달한다.

Handoff Package는 다음 조건을 모두 충족한 시점에만 생성된다:
- AI-Ready 6기준 채점 전체 통과 (overall ≥ 0.8)
- 수요기관 담당자 서명 (HITL 최종 승인)
- 원천 문서 추적성 100% 연결

---

## 2. 패키지 구조

파일명 형식: `handoff-{orgId}-{skillId}-{date}.zip`

예시: `handoff-LPON-pension-wd-001-20260417.zip`

```
handoff-{orgId}-{skillId}-{date}.zip
├── spec-business.md          # 업무 스펙 (자연어 + 정책 목록)
├── spec-technical.md         # 기술 스펙 (API, DB, 인터페이스)
├── spec-quality.md           # 품질 스펙 (SLA, 성능, 보안 요건)
├── ai-ready-report.json      # AI-Ready 6기준 채점 결과
├── kg-links.json             # Knowledge Graph 연결 정보
├── source-manifest.json      # 원천 문서 목록 + 추적 정보
└── README.md                 # 패키지 사용 가이드
```

---

## 3. 컴포넌트별 스키마

### 3.1 spec-business.md (업무 스펙)

마크다운 구조화 문서. 주요 섹션:

```markdown
# 업무 스펙 — {skillId}

## 개요
- 도메인: {domain}
- 버전: {version}
- 생성일: {date}

## 핵심 업무 규칙
| 코드 | 규칙 | 조건 | 결과 |
|------|------|------|------|
| POL-PENSION-WD-HOUSING-001 | 무주택자 중도인출 | 무주택 확인서 제출 | 인출 허용 |

## 예외 케이스
...

## 용어 사전 (온톨로지 참조)
...
```

### 3.2 spec-technical.md (기술 스펙)

마크다운 구조화 문서. 주요 섹션:

```markdown
# 기술 스펙 — {skillId}

## API 인터페이스
| 엔드포인트 | 메서드 | 설명 | 요청/응답 스키마 |

## 데이터 모델
| 테이블명 | 컬럼 | 제약조건 | 설명 |

## 시스템 연동
| 외부 시스템 | 연동 방식 | SLA |

## 배치 처리
...
```

### 3.3 spec-quality.md (품질 스펙)

마크다운 구조화 문서. 주요 섹션:

```markdown
# 품질 스펙 — {skillId}

## 성능 요건
| 기능 | 목표 응답 시간 | 기준 (p50/p99) | 부하 |

## 가용성 / SLA
## 보안 요건
## 데이터 보존 정책
## 규제 준수 (컴플라이언스)
```

### 3.4 ai-ready-report.json (AI-Ready 채점)

```json
{
  "reportId": "AIR-{orgId}-{skillId}-{date}",
  "skillId": "pension-wd-001",
  "orgId": "LPON",
  "generatedAt": "ISO 8601",
  "scores": {
    "machineReadable":      { "score": 0.95, "threshold": 0.90, "pass": true },
    "semanticConsistency":  { "score": 0.82, "threshold": 0.70, "pass": true },
    "testable":             { "score": 0.76, "threshold": 0.70, "pass": true },
    "traceable":            { "score": 0.88, "threshold": 0.80, "pass": true },
    "completeness":         { "score": 0.64, "threshold": 0.50, "pass": true },
    "humanReviewable":      { "score": 0.79, "threshold": 0.60, "pass": true }
  },
  "overall": {
    "score": 0.81,
    "threshold": 0.80,
    "pass": true,
    "verdict": "APPROVED"
  },
  "failingCriteria": [],
  "reviewedBy": "REVIEWER-[MASKED]",
  "reviewedAt": "ISO 8601"
}
```

### 3.5 kg-links.json (Knowledge Graph 연결)

```json
{
  "skillId": "pension-wd-001",
  "neo4jVersion": "5.x",
  "nodes": [
    { "id": "n:Policy:POL-PENSION-WD-HOUSING-001", "label": "Policy", "name": "무주택자 중도인출 정책" },
    { "id": "n:Process:PROC-WD-APPLY-001",         "label": "Process", "name": "중도인출 신청 프로세스" },
    { "id": "n:Term:TERM-PENSION-NHOWNER",         "label": "Term",    "name": "무주택자" }
  ],
  "relationships": [
    { "from": "n:Policy:POL-PENSION-WD-HOUSING-001", "type": "GOVERNS", "to": "n:Process:PROC-WD-APPLY-001" },
    { "from": "n:Policy:POL-PENSION-WD-HOUSING-001", "type": "USES_TERM", "to": "n:Term:TERM-PENSION-NHOWNER" }
  ],
  "cypherQuery": "MATCH (p:Policy {skillId: 'pension-wd-001'})-[r]->(n) RETURN p, r, n"
}
```

### 3.6 source-manifest.json (원천 문서 추적)

```json
{
  "skillId": "pension-wd-001",
  "sources": [
    {
      "sourceId": "SRC-001",
      "fileName": "퇴직연금_업무처리기준_v3.2.pdf",
      "type": "policy-document",
      "hash": "sha256:abc123...",
      "uploadedAt": "ISO 8601",
      "r2Key": "ingestion/LPON/SRC-001.pdf",
      "linkedFragments": ["TIF-PENSION-001", "TIF-PENSION-003"],
      "linkedPolicies": ["POL-PENSION-WD-HOUSING-001"]
    }
  ],
  "traceabilityScore": 0.92,
  "untracedPolicies": []
}
```

---

## 4. AI-Ready 6기준 및 임계값

| # | 기준 | 설명 | 임계값 |
|---|------|------|--------|
| 1 | **machineReadable** | JSON Schema 준수, 파싱 가능 여부 | ≥ 0.90 |
| 2 | **semanticConsistency** | 용어·온톨로지 일관성 | ≥ 0.70 |
| 3 | **testable** | 테스트 케이스 도출 가능성 | ≥ 0.70 |
| 4 | **traceable** | 원천 문서 → 스펙 추적 연결 | ≥ 0.80 |
| 5 | **completeness** | 필수 스펙 항목 충족률 | ≥ 0.50 |
| 6 | **humanReviewable** | 사람이 검토·승인 가능한 형태 | ≥ 0.60 |
| — | **overall** (가중 평균) | 위 6기준 종합 | ≥ 0.80 |

가중치 (기본값):

```
machineReadable × 0.20 + semanticConsistency × 0.20 + testable × 0.15
+ traceable × 0.20 + completeness × 0.15 + humanReviewable × 0.10
```

---

## 5. 패키지 생성 거부 조건

다음 중 하나라도 해당하면 Handoff Package 생성이 **자동 거부**된다.

```
거부 조건 (OR)
  ├── overall < 0.80
  ├── 6기준 중 개별 임계값 미충족 항목 존재
  ├── HITL 최종 승인 미완료
  └── source-manifest 미추적 Policy 존재 (untracedPolicies != [])
```

거부 시 응답 예시:

```json
{
  "verdict": "DENIED",
  "reason": "overall score 0.74 < threshold 0.80",
  "failingCriteria": [
    { "criterion": "semanticConsistency", "score": 0.62, "threshold": 0.70 },
    { "criterion": "testable",            "score": 0.58, "threshold": 0.70 }
  ],
  "action": "failing criteria를 먼저 개선한 후 재채점 요청"
}
```

거부된 패키지는 `DRAFT` 상태로 저장되며, 수정 후 재채점→재승인 사이클을 거쳐야 한다.

---

## 6. 수행팀(개발팀) 수령 워크플로우

```
[Handoff Package 수신]
  ↓
① README.md 확인
    → 패키지 버전, 도메인, AI-Ready 점수 확인
  ↓
② ai-ready-report.json 검토
    → overall ≥ 0.80 + 개별 기준 Pass 확인
    → 주의 항목(0.7~0.8 구간) 파악
  ↓
③ spec-business.md 업무 스펙 리뷰
    → 수요기관 담당자와 정책 코드 기준 검토
  ↓
④ spec-technical.md 기술 스펙으로 Plan/Design 착수
    → API 인터페이스 → DB 설계 → 화면 설계 순
  ↓
⑤ spec-quality.md 기반 테스트 계획 수립
    → SLA·성능 요건을 테스트 케이스로 직접 변환
  ↓
⑥ kg-links.json / source-manifest.json 참조
    → 온톨로지 연결로 용어 불일치 방지
    → 원천 문서 재조회 필요 시 r2Key 사용
```

### 6.1 착수 기준 체크리스트

수행팀이 개발 착수 전 확인해야 하는 최소 조건:

- [ ] `ai-ready-report.json` — overall ≥ 0.80, 모든 기준 Pass
- [ ] `spec-business.md` — 핵심 업무 규칙 + 예외 케이스 섹션 존재
- [ ] `spec-technical.md` — API 인터페이스 + 데이터 모델 섹션 존재
- [ ] `source-manifest.json` — `untracedPolicies: []` 확인
- [ ] 수요기관 담당자 서명 (`ai-ready-report.json` → `reviewedBy` 필드)

---

## 7. 버전 관리

| 필드 | 설명 |
|------|------|
| `packageVersion` | SemVer (1.0.0) — 스펙 변경 시 Minor 이상 bump |
| `skillVersion` | SkillPackage 버전과 동기화 |
| `validUntil` | 패키지 유효기간 (기본 90일) — 만료 시 재채점 필요 |

패키지 수정이 필요한 경우 원본 SkillPackage를 수정 후 재생성한다. 직접 편집은 허용하지 않는다.

---

*PoC 범위: 퇴직연금(PENSION) + 온누리상품권(VOUCHER) 2개 도메인. 4/17 발표 시점 기준.*
