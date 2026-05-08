---
code: AIF-REQI-deepseek-feedback
title: "deepseek feedback"
version: 1.0
status: active
category: req-interview
created: 2026-04-21
updated: 2026-04-21
author: Sinclair Seo
---

## DeepSeek 검토의견
**모델:** deepseek/deepseek-chat-v3
**역할:** 기술적 실현 가능성, 아키텍처 리뷰
**소요:** 30.3초
**시도:** 1회
**착수 판단:** Conditional
---
### 기술 검토 의견

#### 1. 기술적 실현 가능성
- **긍정적 요소**:
  - Cloudflare Workers 기반의 서버리스 아키텍처는 경량 API 연동(M-1/M-2)에 적합
  - LLM 연동(AI-Ready 채점)은 기존 `llm-client.ts` 인프라 재사용 가능
- **우려사항**:
  - **Tree-sitter WASM 호환성**: Cloudflare Workers의 WASM 제한(메모리 128MB)에서 Java grammar 파싱 가능성 미검증
  - **LLM 비용 폭증**: 5,214점 채점 시 Opus 기준 $100+ 예상. 샘플링 전략 없으면 예산 초과 리스크
  - **교차 PR deadlock**: Decode-X ↔ Foundry-X 동시 변경 시 버전 불일치 가능성 높음

#### 2. 아키텍처 적합성
- **개선 필요 항목**:
  - **비동기 작업 처리**: 대량 LLM 호출(S-1) 시 Queue 기반 병렬화 미고려 → Workers 10ms CPU 제한 위험
  - **데이터 정합성**: `handoff_jobs` INSERT(idempotency)가 트랜잭션 보장 없음. 동시 요청 시 중복 row 가능
  - **모니터링 부재**: DIVERGENCE 마커 발행 현황을 실시간 추적할 감사 로그 시스템 미구축

#### 3. 구현 복잡도
- **과소평가된 요소**:
  - **Java 파서 전환(S-3)**: regex → Tree-sitter는 AST 재구성 필요. 기존 하드코딩 로직(TC-REFUND-002)과 충돌 가능성
  - **AgentResume 세션 복구(S-2)**: Foundry-X Orchestrator 상태 동기화 프로토콜 미정의. 분산 트랜잭션 문제 발생 가능
  - **자동 채점(S-1)**: 6기준 평가를 위한 프롬프트 엔지니어링 복잡도. False Positive/Negative율 15% 초과 시 수동 검수 필요

#### 4. 기술 리스크
- **최우선 리스크 3건**:
  1. **Tree-sitter WASM 메모리 오버플로**: Java 대용량 소스 파싱 시 OOM 발생 → PoC 없이 S-3 진입 금지
  2. **교차 PR deadlock**: M-2에서 양측 리포지토리 동시 변경 필요 → merge 순서 프로토콜 필수
  3. **LLM 비용 폭주**: 일 $30 한도에서 S-1 20%만 실행해도 초과 가능 → 채점 배치를 주간 단위로 분할 필요

#### 5. 착수 전 필수 조건
- **Tree-sitter WASM PoC 완료**: S-3 계획 수립 전 Workers 환경에서 Java grammar 로드/파싱 검증
- **교차 PR 프로토콜 정의**: M-2에서 Foundry-X 팀과 merge 순서/충돌 해결 절차 명문화
- **LLM 비용 가드레일**: 일일 한도 초과 시 자동 중단/샘플링 전환 로직 구현

---

### 착수 판단: **Conditional**
- **전제조건**: Tree-sitter WASM PoC 성공 + 교차 PR 프로토콜 합의 + LLM 비용 제어장치 구현 완료 시에만 착수 권장
- **즉시 조치 필요**: Phase 3 Sprint 1을 WASM PoC/프로토콜 정의 전용으로 할당, 이후 본 개발 진행
---
*토큰: {"prompt_tokens":9092,"completion_tokens":871,"total_tokens":9963,"cost":0.0047691,"is_byok":false,"prompt_tokens_details":{"cached_tokens":0,"cache_write_tokens":0,"audio_tokens":0,"video_tokens":0},"cost_details":{"upstream_inference_cost":0.0047691,"upstream_inference_prompt_cost":0.0036368,"upstream_inference_completions_cost":0.0011323},"completion_tokens_details":{"reasoning_tokens":0,"image_tokens":0,"audio_tokens":0}}*
*파싱 품질: verdict=true, truncated=true*