/**
 * LLM-based term classification — entity / relation / attribute.
 * Uses Haiku tier via svc-llm-router service binding.
 * Graceful fallback: on any failure, all terms default to 'entity'.
 */

import type { TermType } from "@ai-foundry/types";
import { TermTypeSchema } from "@ai-foundry/types";
import { createLogger, callLlmRouter } from "@ai-foundry/utils";
import type { Env } from "../env.js";

const logger = createLogger("svc-ontology:classify");

interface TermInput {
  label: string;
  definition: string;
}

export interface ClassifiedTermResult {
  label: string;
  type: TermType;
  definition: string;
}

const SYSTEM_PROMPT = `당신은 퇴직연금 도메인의 온톨로지 전문가입니다.
주어진 용어 목록을 다음 3가지 타입으로 분류하세요:

- entity: 독립적으로 존재하는 개체/명사 (예: 퇴직연금, 근로자, 사업장, 적립금, 계좌)
- relation: 개체 간 관계/동사적 개념 (예: 가입, 해지, 이전, 수령, 신청)
- attribute: 개체의 속성/수식어 (예: 가입기간, 적립비율, 수령액, 세율, 한도)

JSON 배열로만 응답하세요. 각 항목은 {"label": "용어", "type": "entity|relation|attribute"} 형태입니다.
입력 배열의 순서와 개수를 정확히 유지하세요.`;

/**
 * Classify extracted terms using LLM (Haiku tier).
 * Returns terms with type classification. On failure, defaults all to 'entity'.
 */
export async function classifyTermsWithLlm(
  env: Env,
  terms: TermInput[],
  policyTitle: string,
): Promise<ClassifiedTermResult[]> {
  if (terms.length === 0) return [];

  const fallback = terms.map((t) => ({
    label: t.label,
    type: "entity" as TermType,
    definition: t.definition,
  }));

  try {
    const userContent = `정책: "${policyTitle}"\n\n용어 목록:\n${JSON.stringify(terms.map((t) => t.label))}`;

    const content = await callLlmRouter(env, "svc-ontology", "haiku", userContent, {
      system: SYSTEM_PROMPT,
      maxTokens: 2048,
      temperature: 0.1,
    });

    return parseClassificationResponse(content, terms);
  } catch (e) {
    logger.warn("LLM classification error (non-fatal)", { error: String(e) });
    return fallback;
  }
}

/**
 * Parse LLM JSON response into classified terms.
 * Handles JSON extraction from markdown code blocks, length mismatch, invalid types.
 */
export function parseClassificationResponse(
  content: string,
  originalTerms: TermInput[],
): ClassifiedTermResult[] {
  const fallback = originalTerms.map((t) => ({
    label: t.label,
    type: "entity" as TermType,
    definition: t.definition,
  }));

  try {
    // Extract JSON from potential markdown code blocks
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.warn("No JSON array found in LLM response");
      return fallback;
    }

    const parsed: unknown = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      logger.warn("Parsed result is not an array");
      return fallback;
    }

    // Map back to original terms, handling length mismatch
    return originalTerms.map((original, i) => {
      const item = parsed[i] as Record<string, unknown> | undefined;
      if (!item || typeof item !== "object") {
        return { label: original.label, type: "entity" as TermType, definition: original.definition };
      }

      const typeValue = item["type"];
      const parseResult = TermTypeSchema.safeParse(typeValue);
      const termType: TermType = parseResult.success ? parseResult.data : "entity";

      return {
        label: original.label,
        type: termType,
        definition: original.definition,
      };
    });
  } catch (e) {
    logger.warn("JSON parse failed for classification", { error: String(e) });
    return fallback;
  }
}
