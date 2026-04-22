import type { AIReadyCriterion } from "@ai-foundry/types";

export interface PromptInput {
  sourceCode: string;
  metadata: {
    provenanceYaml: string;
    contracts: string;
    rules: string[];
  };
  skillName: string;
}

interface CriterionDef {
  korean: string;
  definition: string;
  rubric: string;
}

const CRITERION_DEFS: Record<AIReadyCriterion, CriterionDef> = {
  source_consistency: {
    korean: "소스코드 정합성",
    definition: "Java 소스가 spec-container 메타데이터(rules/contracts)와 얼마나 일치하는가.",
    rubric: `- 0.9+: 모든 rule/contract 필드가 소스에 1:1 구현. 드리프트 없음.
- 0.75~0.9: 1~2개 minor 드리프트 (네이밍/주석 수준). 기능 드리프트 없음.
- 0.5~0.75: 3~5개 드리프트 또는 1개 기능 드리프트 (누락 필드).
- <0.5: 다수 드리프트 또는 구조적 불일치 (메서드 시그니처 vs contract).`,
  },
  comment_doc_alignment: {
    korean: "주석·문서 일치",
    definition: "Javadoc/inline comment가 rules/runbook 내용과 일치하는가.",
    rubric: `- 0.9+: 모든 public method에 Javadoc 존재, rules 내용과 완전히 일치.
- 0.75~0.9: 주요 메서드에 Javadoc 있으나 1~2개 내용 불일치.
- 0.5~0.75: Javadoc 누락 30% 이하 또는 다수 내용 불일치.
- <0.5: Javadoc 대부분 없거나 실제 구현과 괴리된 주석.`,
  },
  io_structure: {
    korean: "입출력 구조 명확성",
    definition: "API 스키마 + DTO 정의 vs 실 구현 I/O 경계 명확성.",
    rubric: `- 0.9+: DTO 클래스 또는 @RequestBody/@ResponseBody 명확. 입출력 필드 contracts와 완전 일치.
- 0.75~0.9: I/O 구조는 명확하나 1~2개 필드 미명시.
- 0.5~0.75: 입출력 경계 불명확 또는 Map/Object로 타입 소실.
- <0.5: I/O 구조 정의 부재 또는 contracts와 구조적 불일치.`,
  },
  exception_handling: {
    korean: "예외·에러 핸들링",
    definition: "throw/catch 패턴 + error code 체계성.",
    rubric: `- 0.9+: 비즈니스 예외 클래스 분리, error code 체계 존재, 모든 예외 경로 명시적 처리.
- 0.75~0.9: 주요 예외 처리됨, 1~2개 catch-all 또는 error code 미정의.
- 0.5~0.75: 예외 처리 부분적, catch 후 무시 또는 generic Exception 남용.
- <0.5: 예외 처리 거의 없거나 전파되지 않는 silenced exception.`,
  },
  srp_reusability: {
    korean: "업무루틴 분리·재사용성",
    definition: "SRP 준수 + public method 재사용 설계.",
    rubric: `- 0.9+: 단일 책임 원칙 준수. public method가 독립적으로 호출 가능. 공통 로직 추출됨.
- 0.75~0.9: 대부분 SRP 준수, 1~2개 메서드 책임 경계 모호.
- 0.5~0.75: 한 메서드에 여러 책임 혼재 또는 중복 코드 다수.
- <0.5: SRP 미준수 전반적, 비즈니스 로직이 인프라 코드와 결합됨.`,
  },
  testability: {
    korean: "테스트 가능성 및 단위테스트 적합성",
    definition: "외부 의존성 mock 용이성 + 순수 함수 비율.",
    rubric: `- 0.9+: 의존성 주입 설계. 외부 DB/API mock 가능. 순수 함수 메서드 비율 높음.
- 0.75~0.9: 대부분 테스트 가능, 1~2개 정적 메서드 또는 직접 생성 의존성.
- 0.5~0.75: 의존성 하드코딩 다수 또는 테스트 격리 어려움.
- <0.5: new 직접 사용 전반적, static 의존성 강결합, 단위테스트 불가.`,
  },
};

const SYSTEM_PREAMBLE = `당신은 Java 엔터프라이즈 코드의 AI-Ready 품질을 평가하는 시니어 엔지니어입니다.
지정된 기준 하나에만 집중하여 0~1 사이 점수와 근거를 제시하세요.
출력은 반드시 JSON만 반환합니다. 다른 텍스트는 절대 포함하지 마세요.`;

export function buildPrompt(criterion: AIReadyCriterion, input: PromptInput): string {
  const def = CRITERION_DEFS[criterion];
  const rulesText = input.metadata.rules.join("\n");

  return `${SYSTEM_PREAMBLE}

## 평가 기준: ${def.korean}
${def.definition}

## 평가 가이드 (점수 구간)
${def.rubric}

## 평가 대상 Skill: ${input.skillName}

### 소스 코드
\`\`\`java
${input.sourceCode}
\`\`\`

### 메타데이터
#### Provenance
${input.metadata.provenanceYaml}

#### Contracts
${input.metadata.contracts}

#### Rules
${rulesText}

## 출력 형식 (JSON만 반환)
{"score": 0.XX, "rationale": "소스 라인 인용을 포함한 150~250단어 근거"}`;
}

export function buildSystemPrompt(): string {
  return SYSTEM_PREAMBLE;
}
