# Tacit Interview Agent — 포맷 명세 (PoC)

> **상태**: PoC 포맷 명세 (2026-04-17 임원 발표용)
> **목적**: 이 문서는 구현 가이드가 아닌 형식·데이터 구조 확정 문서입니다.

---

## 1. 목적

도메인 SME(Subject Matter Expert)의 **암묵지(Tacit Knowledge)**를 구조화된 인터뷰를 통해 수집하고, 기계 판독 가능한 Spec Fragment로 변환한다.

Decode-X의 5단계 역공학 파이프라인은 코드·문서에서 명시적 스펙을 추출한다. 그러나 업무 담당자의 머릿속에만 존재하는 **예외 처리 로직, 암묵적 규칙, 운영 노하우**는 문서화되지 않아 파이프라인이 포착할 수 없다. Tacit Interview Agent는 이 공백을 채운다.

```
문서·코드 (명시지)   ──→ 5-Stage Pipeline ──→ SkillPackage
SME 인터뷰 (암묵지)  ──→ Interview Agent  ──→ Spec Fragment ──→ SkillPackage 보강
```

---

## 2. 인터뷰 프로토콜

### 2.1 카테고리 분류

| 카테고리 | 코드 | 수집 대상 | 예시 질문 |
|----------|------|-----------|-----------|
| **Domain** | `D` | 업무 규칙, 예외 케이스, 암묵적 업무 흐름 | "이 화면에서 실제로 어떤 경우에 오류가 발생하나요?" |
| **Process** | `P` | 처리 절차, 분기 조건, 타임라인 | "이 프로세스에서 승인 단계가 필요한 기준은 무엇인가요?" |
| **Exception** | `E` | 장애 상황, 우회 방안, 대체 프로세스 | "시스템이 다운됐을 때 수동으로 처리하는 방법이 있나요?" |
| **Constraint** | `C` | 규제 요건, SLA, 성능 제약, 보안 정책 | "이 데이터 보존 기간이 몇 년인지, 근거 법령은 무엇인가요?" |

### 2.2 질문 흐름

```
[시작] 컨텍스트 확인 (담당 업무 범위, 경력)
  ↓
[Domain] 핵심 업무 규칙 확인 (필수 3건 이상)
  ↓
[Process] 정상 흐름 → 분기 조건 탐색
  ↓
[Exception] 예외·장애 시나리오 추출
  ↓
[Constraint] 규제·SLA 확인
  ↓
[마무리] 추가 확인 사항, 관련 담당자 연결
```

### 2.3 세션 목표

| 지표 | 목표값 |
|------|--------|
| 세션 시간 | 30분 이내 |
| Spec Fragment 추출 건수 | 10건 이상 |
| 카테고리 커버리지 | 4카테고리 모두 1건 이상 |
| confidence ≥ 0.7 비율 | 70% 이상 |

---

## 3. Spec Fragment 스키마

인터뷰 응답 하나(Q&A 쌍)는 하나의 **Spec Fragment**로 변환된다.

```json
{
  "fragmentId": "TIF-{DOMAIN}-{SEQ}",
  "category": "domain | process | exception | constraint",
  "question": "에이전트가 SME에게 질문한 내용",
  "answer": "SME의 원문 응답",
  "specFragment": {
    "type": "business | technical | quality",
    "content": "응답에서 추출한 스펙 텍스트 (자연어, 정규화됨)",
    "confidence": 0.85,
    "policyCode": "POL-{DOMAIN}-{TYPE}-{SEQ}"
  },
  "metadata": {
    "interviewId": "INT-{ORGID}-{DATE}-{SEQ}",
    "smeId": "SME-{MASKED_ID}",
    "timestamp": "ISO 8601",
    "duration": 180
  }
}
```

### 3.1 fragmentId 형식

```
TIF-{DOMAIN}-{SEQ}

예시:
  TIF-PENSION-001    퇴직연금 도메인 첫 번째 Fragment
  TIF-VOUCHER-023    온누리상품권 도메인 23번째 Fragment
```

### 3.2 specFragment.type 정의

| type | 설명 | 예시 |
|------|------|------|
| `business` | 업무 규칙, 정책, 조건 | "중도 인출은 무주택자 요건 충족 시에만 허용" |
| `technical` | 시스템 동작, API 계약, 데이터 처리 | "배치 처리는 매일 02:00 KST에 실행" |
| `quality` | 성능 요건, SLA, 신뢰성 기준 | "조회 응답 시간 3초 이내 (p99)" |

### 3.3 confidence 산정 기준

| 범위 | 의미 | 처리 |
|------|------|------|
| 0.9 ~ 1.0 | 명확한 규칙, 법령 근거 있음 | 자동 Spec 반영 |
| 0.7 ~ 0.89 | 구체적이나 확인 필요 | HITL 검토 후 반영 |
| 0.5 ~ 0.69 | 모호하거나 추가 질문 필요 | 재인터뷰 필요 |
| 0.0 ~ 0.49 | 불명확 — Spec 반영 불가 | 폐기 또는 재수집 |

---

## 4. PII 마스킹 정책

인터뷰 응답은 외부 LLM으로 전달되기 전 반드시 마스킹된다.

### 4.1 마스킹 대상

| 유형 | 패턴 예시 | 마스킹 토큰 형식 |
|------|-----------|-----------------|
| 이름 | 홍길동, 김OO | `[NAME_001]` |
| 전화번호 | 010-1234-5678 | `[PHONE_001]` |
| 이메일 | user@company.com | `[EMAIL_001]` |
| 주민등록번호 | 801231-1234567 | `[SSN_001]` |
| 사원번호 / 직원 ID | EMP-12345 | `[EMPID_001]` |

### 4.2 마스킹 흐름

```
SME 응답 (원문)
  ↓ PII Detector (정규식 + NER)
마스킹 적용 → 토큰 맵 D1 저장 (암호화)
  ↓
LLM Spec Fragment 변환 (마스킹된 텍스트 사용)
  ↓
결과 저장 시 토큰 → 원문 역치환 (권한 있는 사용자만)
```

### 4.3 원문 보관 정책

- 원문 응답: `db-skill` D1에 AES-256 암호화 저장
- 마스킹 토큰 맵: 별도 테이블, 감사 로그 5년 보존
- LLM에는 마스킹본만 전달 (원문 전달 금지)

---

## 5. Interview Session 메타데이터

```json
{
  "interviewId": "INT-LPON-20260417-001",
  "orgId": "LPON",
  "domain": "PENSION",
  "smeProfile": {
    "smeId": "SME-[MASKED]",
    "department": "퇴직연금사업부",
    "yearsOfExperience": 8,
    "role": "업무 담당자"
  },
  "session": {
    "startTime": "2026-04-17T09:00:00+09:00",
    "endTime": "2026-04-17T09:28:00+09:00",
    "durationMin": 28
  },
  "outcome": {
    "totalFragments": 14,
    "byCategory": {
      "domain": 5,
      "process": 4,
      "exception": 3,
      "constraint": 2
    },
    "avgConfidence": 0.81,
    "highConfidenceCount": 10
  },
  "status": "COMPLETED"
}
```

---

## 6. SkillPackage 연동

추출된 Spec Fragment는 Stage 5 Skill Packaging 단계에서 기존 파이프라인 출력과 병합된다.

```
[5-Stage Pipeline 출력]     [Tacit Interview 출력]
  policies[]                    specFragments[]
  entities[]                        ↓
       ↓                    confidence 필터 (≥ 0.7)
       └──────── 병합 ──────────────┘
                 ↓
          .skill.json (보강됨)
          tacitCoverage: {fragmentCount, avgConfidence}
```

병합 규칙:
- `policyCode`가 일치하는 Fragment는 기존 Policy에 `tacitEvidence[]`로 추가
- 신규 Policy가 될 수 있는 Fragment(policyCode 없음)는 `candidatePolicies[]`에 별도 등록
- HITL 검토 후 최종 SkillPackage에 반영

---

*PoC 범위: 퇴직연금(PENSION) + 온누리상품권(VOUCHER) 2개 도메인. 4/17 발표 시점 기준.*
