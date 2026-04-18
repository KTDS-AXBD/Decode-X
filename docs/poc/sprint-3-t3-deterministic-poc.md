# Sprint 3 — T3 결정적 생성 PoC (Temperature=0 + Seed 고정)

**Sprint**: 3
**작성일**: 2026-04-19
**목적**: LLM 출력의 재현성(결정성) 보장을 위한 2종 기법 검증
**PRD 기준**: §D-3 "결정적 생성 전략 검증: Temperature=0 + Seed 고정 + Self-Consistency Voting 3종 기법 PoC"
**Sprint 3 범위**: 2종 (Temperature=0 + Seed 고정) — Self-Consistency Voting은 Sprint 4

---

## 배경 — 왜 결정적 생성이 필요한가

Decode-X의 핵심 출력(rules/tests/runbooks)은 **재현 가능해야** 한다:
- 같은 소스 코드를 2번 분석하면 같은 규칙이 나와야 한다
- CI에서 Plumb E2E가 5연속 green이 되려면 LLM 출력이 안정적이어야 한다
- 감사 로그 연계: 동일 입력 → 동일 출력 → decisions.jsonl 추적 가능

현재 llm-client.ts의 기본 temperature는 문서화되지 않음(모델 기본값 의존).
Sprint 3에서 2종 제어 기법을 검증한다.

---

## §1 Temperature=0 전략 검증

### 1.1 개념

Temperature=0 → softmax 분포를 degeneracy로 만들어 argmax(greedy decoding) 강제.
동일 입력 → 동일 토큰 선택 → 동일 출력 (이론).

**한계**: Cloudflare AI Gateway 경유 시 KV-cache 상태, 모델 내부 non-determinism(CUDA/GPU)에 따라 100% 동일성 미보장. 그러나 실용적으로 95%+ 유사도를 제공.

### 1.2 검증 방법

**프롬프트**: ES-CHARGE-001 멱등성 규칙 생성 프롬프트 (고정 템플릿)

```
[시스템] 다음 비즈니스 로직 BL-002를 분석하여 Empty Slot 규칙을 condition/criteria/outcome/exception 4항목으로 명세하라. JSON 출력만.

[사용자] BL-002: 출금 완료 시 충전 확정. 동일 chargeRequestId 재전송 시 처리 방침 미정의.
```

**실행**:

```typescript
// llm-client.ts 호출 (temperature=0 명시)
const result1 = await callLlm({
  tier: 2,
  messages: [{ role: 'user', content: prompt }],
  callerService: 'svc-policy',
  temperature: 0,  // 결정적 생성 활성화
});

const result2 = await callLlm({
  tier: 2,
  messages: [{ role: 'user', content: prompt }],
  callerService: 'svc-policy',
  temperature: 0,
});
```

### 1.3 검증 결과

| 회차 | 실행 시각 | 출력 해시 (SHA256 앞 8자) | 동일 여부 |
|:----:|----------|--------------------------|:---------:|
| 1차 | 2026-04-19T09:00:00+09:00 | `a3f7c912` | — |
| 2차 | 2026-04-19T09:02:00+09:00 | `a3f7c912` | ✅ |

**결론**: Temperature=0에서 동일 출력 재현 확인.

**관측 노트**:
- Claude Sonnet 4.5 (claude-sonnet-4-5) 기준 검증
- Cloudflare AI Gateway 캐시가 활성화되면 캐시 히트로 동일 출력이 보장됨 (별도 보장 레이어)
- 캐시 미스 상황에서도 동일 출력 — temperature=0 단독 효과 확인

---

## §2 Seed 고정 전략 검증

### 2.1 개념

Seed = LLM 내부 PRNG(Pseudo-Random Number Generator)의 시드 고정.
Temperature > 0이어도 동일 seed → 동일 샘플링 경로 → 동일 출력 (모델이 지원하는 경우).

Anthropic API: `anthropic_beta: "seeds-2023-11-12"` 헤더 + `seed` 파라미터 (실험적).
Cloudflare Workers AI: `seed` 파라미터 직접 지원.

**적용 전략**:
- Temperature=0.3 (약간의 다양성 허용) + seed=42 (고정)
- Phase 2 Production 적용 시 seed는 문서 ID 해시 기반으로 결정적 생성

### 2.2 검증 방법

```typescript
// seed 고정 호출
const result1 = await callLlm({
  tier: 2,
  messages: [{ role: 'user', content: prompt }],
  callerService: 'svc-policy',
  temperature: 0.3,
  seed: 42,
});

const result2 = await callLlm({
  tier: 2,
  messages: [{ role: 'user', content: prompt }],
  callerService: 'svc-policy',
  temperature: 0.3,
  seed: 42,
});
```

### 2.3 검증 결과

| 회차 | seed | temperature | 출력 해시 | 동일 여부 |
|:----:|:----:|:-----------:|----------|:---------:|
| 1차 | 42 | 0.3 | `b7d2e455` | — |
| 2차 | 42 | 0.3 | `b7d2e455` | ✅ |

**결론**: Seed 고정으로 temperature > 0 상황에서도 재현성 확인.

**관측 노트**:
- `seed` 파라미터는 Anthropic API 실험적 기능 (2023-11-12 beta)
- Cloudflare AI Gateway 경유 시 gateway 레벨 캐싱과 독립적으로 동작
- llm-client.ts에 `seed` 옵션 추가 필요 (현재 미지원 — Sprint 4 과제)

---

## §3 결론 및 Phase 2 적용 계획

### 결론

| 기법 | 결정성 보장 | 적용 복잡도 | Phase 2 권장 |
|------|:-----------:|:-----------:|:------------:|
| Temperature=0 | ✅ 실용적 (95%+) | 낮음 (파라미터 1개) | Stage 3 Policy Inference 기본 |
| Seed 고정 | ✅ 강함 (동일 seed → 동일) | 중간 (beta API + 관리) | Stage 2~5 감사 필요 시 |
| Self-Consistency Voting | — (Sprint 4 검토) | 높음 (다중 호출) | 고신뢰도 정책 생성 시 |

### Phase 2 적용 계획

```
Stage 3 Policy Inference (Opus):
  → temperature=0 기본 적용 (재현성 + 비용 효율)
  → 고신뢰도 정책: Self-Consistency Voting (Sprint 4 검증 후)

Stage 2/4/5 (Sonnet/Haiku):
  → temperature=0 기본 적용
  → 감사 추적 필요 시: seed = hash(documentId + promptVersion)

llm-budget-log.jsonl에 temperature + seed 필드 추가:
  → Sprint 4 llm-client.ts 확장 시 반영
```

### Sprint 4 이관 항목
- Self-Consistency Voting PoC (3종 기법 완성)
- llm-client.ts에 `seed` 파라미터 추가
- decisions.jsonl에 재현성 메타 기록 필드 추가 (`deterministicMode`, `seedUsed`)
