/**
 * Description Generator — calls Sonnet LLM to produce skill name,
 * description, triggers, and examples for each category.
 */

import type { Env } from "../env.js";
import { callSonnetLlm } from "../llm/caller.js";
import type { SkillCategory } from "./categories.js";

export interface SkillDescription {
  name: string;
  description: string;
  triggers: string[];
  examples: string[];
}

const SYSTEM_PROMPT = `You are an AI Foundry skill description generator.
Given a domain, a category name, and representative policy summaries,
generate a structured JSON object with these fields:
- name: concise Korean skill name (3-8 characters)
- description: one-sentence Korean description of what this skill covers
- triggers: array of 3-5 Korean trigger phrases a user might say
- examples: array of 2-3 usage example sentences in Korean

Respond ONLY with a valid JSON object, no markdown or extra text.`;

function buildUserPrompt(
  domain: string,
  category: string,
  policySummaries: string[],
): string {
  const summaryText = policySummaries.slice(0, 10).join("\n- ");
  return `도메인: ${domain}
카테고리: ${category}

대표 정책 요약:
- ${summaryText}

위 정보를 바탕으로 이 카테고리의 스킬 설명을 생성해주세요.`;
}

/**
 * Generate skill descriptions for each category via Sonnet LLM.
 * Falls back to a minimal description if LLM call or parsing fails.
 */
export async function generateDescriptions(
  env: Env,
  categoryPolicySummaries: Map<SkillCategory, string[]>,
  domain: string,
): Promise<Map<SkillCategory, SkillDescription>> {
  const result = new Map<SkillCategory, SkillDescription>();

  const entries = [...categoryPolicySummaries.entries()];

  // Process sequentially to avoid overwhelming the LLM router
  for (const [category, summaries] of entries) {
    try {
      const userPrompt = buildUserPrompt(domain, category, summaries);
      const raw = await callSonnetLlm(
        SYSTEM_PROMPT,
        userPrompt,
        env.LLM_ROUTER,
        env.INTERNAL_API_SECRET,
      );

      const parsed = JSON.parse(raw) as SkillDescription;

      result.set(category, {
        name: parsed.name ?? category,
        description: parsed.description ?? "",
        triggers: Array.isArray(parsed.triggers) ? parsed.triggers : [],
        examples: Array.isArray(parsed.examples) ? parsed.examples : [],
      });
    } catch {
      // Fallback: use category name as-is
      result.set(category, {
        name: category,
        description: `${domain} ${category} 관련 스킬`,
        triggers: [],
        examples: [],
      });
    }
  }

  return result;
}
