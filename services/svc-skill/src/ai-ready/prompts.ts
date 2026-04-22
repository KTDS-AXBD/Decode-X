import type { AIReadyCriterion } from "@ai-foundry/types";

// Spec-container content loaded from .decode-x/spec-containers/lpon-*/
export interface SpecContent {
  rules: string[];              // rules/*.md (전체) — originalRules + emptySlotRules 합집합, 기존 호환성 유지
  originalRules?: string[];     // rules/{skill}-rules.md — provenance businessRules 원본 표 (BL-XXX). 분리 로더에서 제공.
  emptySlotRules?: string[];    // rules/ES-*.md — Empty Slot 보완 규칙 (condition-criteria-outcome-exception). 분리 로더에서 제공.
  runbooks: string[];           // runbooks/*.md — operational guides per rule
  tests: string[];              // tests/*.yaml — given/when/then scenarios
  contractYaml: string;         // tests/contract/*.yaml — business contract scenarios
  provenanceYaml: string;       // provenance.yaml — sources, inputCompleteness, confidence
}

export interface PromptInput {
  specContent: SpecContent;
  skillName: string;      // e.g., "lpon-charge"
}

interface CriterionDef {
  korean: string;
  definition: string;
  rubric: string;
}

const CRITERION_DEFS: Record<AIReadyCriterion, CriterionDef> = {
  source_consistency: {
    korean: "소스코드 정합성",
    definition:
      "spec-container의 originalRules(`{skill}-rules.md`의 BL-XXX 원본 표)가 provenance.yaml의 businessRules 목록과 1:1로 매핑되며 내용이 일치하는가. Empty Slot 보완 규칙(`ES-*.md`)은 원본 BL의 빈 슬롯을 채우는 **추가분**이므로 정합성 판정 기준이 아니라 **참고 맥락**으로만 활용한다.",
    rubric: `**평가 대상 분리 원칙**: originalRules(BL 원본)만 provenance.businessRules와 대조한다. emptySlotRules(ES-XXX)는 BL 원본에 없는 예외/엣지 케이스 보완이므로 "BL에 없어도" 불일치가 아니다. 각 ES 규칙 본문의 "빈 슬롯 설명" 섹션이 참조하는 BL-XXX가 originalRules에 존재하면 정합.
- 0.9+: provenance의 모든 BL이 originalRules 표에 condition-criteria-outcome-exception으로 완전히 존재. 표기 변동 없음. ES 규칙들이 참조하는 BL이 모두 originalRules에 존재.
- 0.75~0.9: 1~2개 minor 불일치 (표현 차이, exception 열 공란 수준). BL 누락 0건.
- 0.5~0.75: 3~5개 불일치 또는 1개 BL 누락/드리프트 (조건 누락, outcome 변경). 또는 ES가 참조하는 BL 1건이 원본에 없음.
- <0.5: 다수 BL 누락 또는 originalRules 내용이 provenance 출처와 구조적으로 불일치. originalRules 자체 부재.`,
  },
  comment_doc_alignment: {
    korean: "주석·문서 일치",
    definition:
      "rules/*.md의 각 규칙에 대응하는 runbooks/*.md 운영 가이드가 존재하며, 내용이 rule의 condition-criteria-outcome을 정확히 반영하는가.",
    rubric: `- 0.9+: 모든 rule에 대응하는 runbook 존재. runbook 내용이 rule의 condition/outcome을 정확히 설명.
- 0.75~0.9: 대부분 커버됨. 1~2개 rule의 runbook이 없거나 내용이 일부 불일치.
- 0.5~0.75: runbook 누락 30% 이하 또는 내용 불일치 다수.
- <0.5: runbook 대부분 없거나 rule 내용과 무관한 설명.`,
  },
  io_structure: {
    korean: "입출력 구조 명확성",
    definition:
      "tests/contract/*.yaml의 given/when/then 시나리오에서 입력(given) 필드와 출력(then) 필드가 명확히 정의되어 있으며, 필드 타입과 의미를 파악할 수 있는가.",
    rubric: `- 0.9+: given 필드가 구체적 값/타입으로 명시됨. then 필드가 상태 변화와 응답 형태를 완전히 정의.
- 0.75~0.9: I/O 구조는 명확하나 1~2개 필드의 타입 또는 의미가 불명확.
- 0.5~0.75: given/then 필드 일부 추상적 또는 boolean only로 타입 소실.
- <0.5: given/then 구조 정의 부재 또는 시나리오에서 I/O 경계를 파악 불가.`,
  },
  exception_handling: {
    korean: "예외·에러 핸들링",
    definition:
      "rules/*.md의 exception/else 절이 충분히 정의되어 있으며, tests/*.yaml에 예외 시나리오(error_code, 비정상 상태)가 커버되어 있는가.",
    rubric: `- 0.9+: 각 rule의 exception/else 케이스 명시. tests에서 error_code 포함 예외 시나리오 존재.
- 0.75~0.9: 주요 예외 처리됨. 1~2개 rule의 exception 절 누락 또는 tests에서 일부 미커버.
- 0.5~0.75: exception 절 부분적. happy path만 있고 예외 시나리오 희소.
- <0.5: exception/else 거의 없거나 tests에서 에러 케이스 전혀 없음.`,
  },
  srp_reusability: {
    korean: "업무루틴 분리·재사용성",
    definition:
      "spec-container의 각 rule(ES-XXX)이 단일 업무 책임을 가지며, 독립적으로 참조·적용 가능한가. 규칙 간 중복 정의나 모순이 없는가.",
    rubric: `- 0.9+: 각 ES rule이 단일 condition 그룹 처리. rule 간 중복 없음. 독립 참조 가능.
- 0.75~0.9: 대부분 SRP 준수. 1~2개 rule이 복수 조건을 혼합하거나 중복 설명 존재.
- 0.5~0.75: 여러 rule에 동일 condition 중복 또는 1개 rule에 다수 책임 혼재.
- <0.5: rule 경계 불명확, 대부분 중복 또는 모순 관계.`,
  },
  testability: {
    korean: "테스트 가능성 및 단위테스트 적합성",
    definition:
      "tests/*.yaml 시나리오가 happy path, edge case, error case를 충분히 커버하며, 각 시나리오의 given/when/then이 자동화 테스트로 구현 가능한 수준으로 구체적인가.",
    rubric: `- 0.9+: happy path + edge case + error case 균형 커버. given/when/then이 구체적 값으로 자동화 가능.
- 0.75~0.9: happy path + 일부 edge/error. then이 구체적이나 1~2개 시나리오 추상적.
- 0.5~0.75: happy path 위주. edge/error 희소. given 조건이 "충분히 있을 때" 같은 추상 표현.
- <0.5: 시나리오 수 부족 (2건 미만) 또는 then이 전부 boolean으로만 표현.`,
  },
};

const SYSTEM_PREAMBLE = `당신은 spec-container 기반 AI-Ready 품질 평가 전문가입니다.
spec-container(rules/runbooks/tests)를 분석하여 지정된 기준 하나에만 집중해 0~1 점수와 근거를 제시하세요.
출력은 반드시 JSON만 반환합니다. 다른 텍스트는 절대 포함하지 마세요.`;

export function buildPrompt(criterion: AIReadyCriterion, input: PromptInput): string {
  const def = CRITERION_DEFS[criterion];
  const { specContent, skillName } = input;

  const originalRulesText =
    specContent.originalRules && specContent.originalRules.length > 0
      ? specContent.originalRules.join("\n\n---\n\n")
      : "(제공되지 않음)";
  const emptySlotRulesText =
    specContent.emptySlotRules && specContent.emptySlotRules.length > 0
      ? specContent.emptySlotRules.join("\n\n---\n\n")
      : "(Empty Slot 규칙 없음)";
  const runbooksText = specContent.runbooks.join("\n\n---\n\n");
  const testsText = specContent.tests.join("\n\n---\n\n");

  return `${SYSTEM_PREAMBLE}

## 평가 기준: ${def.korean}
${def.definition}

## 평가 가이드 (점수 구간)
${def.rubric}

## 평가 대상 Skill: ${skillName}

### Provenance (출처 메타데이터 — businessRules 선언 포함)
${specContent.provenanceYaml}

### Original Rules (BL 원본 표 — provenance.businessRules와 1:1 대응)
${originalRulesText}

### Empty Slot Rules (ES-* — BL이 정의하지 않은 예외/엣지 케이스 보완)
${emptySlotRulesText}

### Runbooks (운영 가이드)
${runbooksText}

### Test Scenarios (단위 테스트 시나리오)
${testsText}

### Contract Tests (계약 테스트)
${specContent.contractYaml}

## 출력 형식 (JSON만 반환)
{"score": 0.XX, "rationale": "spec 내용을 구체적으로 인용한 150~250단어 근거"}`;
}

export function buildSystemPrompt(): string {
  return SYSTEM_PREAMBLE;
}
