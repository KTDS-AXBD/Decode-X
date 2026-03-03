/**
 * Evaluate prompt builder — constructs system/user prompts for policy evaluation.
 *
 * The LLM receives the policy's condition-criteria-outcome triple as system context,
 * then evaluates the user-provided situation (context + parameters) against it.
 */

import type { Policy } from "@ai-foundry/types";

export interface EvaluatePrompt {
  system: string;
  user: string;
}

export function buildEvaluatePrompt(
  policy: Policy,
  domain: string,
  context: string,
  parameters?: Record<string, unknown>,
): EvaluatePrompt {
  const system = [
    `You are an AI policy evaluator for the "${domain}" domain.`,
    "You evaluate situations against predefined policies extracted from official documents.",
    "",
    `## Policy: ${policy.code}`,
    `- **Title**: ${policy.title}`,
    `- **Condition (IF)**: ${policy.condition}`,
    `- **Criteria**: ${policy.criteria}`,
    `- **Outcome (THEN)**: ${policy.outcome}`,
    "",
    "## Instructions",
    "1. Analyze the given context against the policy's condition and criteria.",
    "2. Determine if the policy applies and what the outcome should be.",
    "3. Provide:",
    '   - **result**: A clear determination (APPLICABLE / NOT_APPLICABLE / PARTIALLY_APPLICABLE) followed by a concise explanation in Korean.',
    "   - **confidence**: A score between 0.0 and 1.0 indicating your certainty.",
    "   - **reasoning**: Step-by-step reasoning in Korean explaining how you arrived at the result.",
    "",
    "Respond ONLY in JSON format:",
    '{ "result": "string", "confidence": number, "reasoning": "string" }',
  ].join("\n");

  const paramText = parameters && Object.keys(parameters).length > 0
    ? JSON.stringify(parameters, null, 2)
    : "없음";

  const user = [
    "## Context",
    context,
    "",
    "## Additional Parameters",
    paramText,
    "",
    "Evaluate this context against the policy above.",
  ].join("\n");

  return { system, user };
}

/**
 * Parse LLM response text into structured evaluate result.
 * Handles markdown-wrapped JSON (```json ... ```) and plain JSON.
 */
export function parseEvaluateResponse(raw: string): {
  result: string;
  confidence: number;
  reasoning: string;
} {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    cleaned = fenceMatch[1].trim();
  }

  const parsed: unknown = JSON.parse(cleaned);
  if (
    typeof parsed !== "object" || parsed === null ||
    !("result" in parsed) || !("confidence" in parsed) || !("reasoning" in parsed)
  ) {
    throw new Error("LLM response missing required fields: result, confidence, reasoning");
  }

  const obj = parsed as Record<string, unknown>;

  return {
    result: String(obj["result"]),
    confidence: Number(obj["confidence"]),
    reasoning: String(obj["reasoning"]),
  };
}
