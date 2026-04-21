# Executive Overview 사용 가이드

> **대상**: Executive 역할 (본부장, 임원)  
> **목표**: Foundry-X 실사례 3분 내 파악

---

## 1. 시작하기

1. `https://decode-x.ktds-axbd.workers.dev` 접속
2. Google 계정으로 로그인
3. `executive` 역할이면 **Executive Overview** 화면으로 자동 이동

---

## 2. Foundry-X 핸드오프 타임라인 (S220+)

> **주의**: Executive View는 Sprint 220(S220) 이후 활성화됩니다.

타임라인에서 확인할 수 있는 것:

- **퇴직연금 LPON 도메인**: 충전·환불·선물 등 6개 서비스 핸드오프 실사례
- **AI-Ready Score**: 각 도메인별 자동화 준비도 (0~1.0)
- **Drift 지표**: 자가보고 vs 독립 검증 차이값
- **담당자**: 각 Skill 담당 엔지니어

### 3분 설득 플로우

1. `Executive Overview` 화면 진입
2. Foundry-X 타임라인에서 `충전(lpon-charge)` 카드 hover
3. HandoffDetail에서 AI-Ready Score + Round-trip 확인
4. `[Engineer View에서 자세히 →]` 링크로 상세 역추적 가능

---

## 3. 주요 KPI 해석

| 지표 | 기준값 | 의미 |
|------|:------:|------|
| AI-Ready Score | ≥ 0.80 | 자동화 투입 가능 수준 |
| Policy Count | 퇴직연금 8+ | 핵심 업무 규칙 추출 완료 |
| Round-trip | Gate Pass | Decode-X → Foundry-X 실증 완료 |
| Drift | < 5% | 자가보고와 독립 검증 신뢰 일치 |
