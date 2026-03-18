import { SKILL_CATEGORIES, CATEGORY_IDS } from "./categories.js";
import type { SkillCategory } from "./categories.js";
import type { Env } from "../env.js";

export interface PolicyInput {
  policyId: string;
  policyCode: string;
  title: string;
  condition: string;
  criteria: string;
}

export interface ClassificationResult {
  policyId: string;
  category: SkillCategory;
  confidence: number;
}

const BATCH_SIZE = 50;

const SYSTEM_PROMPT = `You are a policy classifier for a Korean domain knowledge platform.
Classify each policy into exactly one category based on its title, condition, and criteria.

Categories:
${CATEGORY_IDS.map((id) => {
  const cat = SKILL_CATEGORIES[id];
  return `- ${id}: ${cat.label} (${cat.keywords.join(", ")})`;
}).join("\n")}

Respond with a JSON array. Each element: {"policyId": "...", "category": "...", "confidence": 0.0-1.0}
Only output the JSON array, no explanation.`;

function buildUserPrompt(policies: PolicyInput[]): string {
  const items = policies.map((p) => ({
    policyId: p.policyId,
    policyCode: p.policyCode,
    title: p.title,
    condition: p.condition.slice(0, 200),
    criteria: p.criteria.slice(0, 200),
  }));
  return JSON.stringify(items);
}

function stripMarkdownFence(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "");
}

interface LlmResponse {
  success: boolean;
  data?: { content?: string };
  error?: { message?: string };
}

interface RawClassification {
  policyId?: string;
  category?: string;
  confidence?: number;
}

async function callLlm(env: Env, userContent: string): Promise<string> {
  const resp = await env.LLM_ROUTER.fetch(
    "https://svc-llm-router.internal/complete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": env.INTERNAL_API_SECRET,
      },
      body: JSON.stringify({
        tier: "haiku",
        messages: [{ role: "user", content: userContent }],
        system: SYSTEM_PROMPT,
        callerService: "svc-skill",
        maxTokens: 4096,
        temperature: 0.1,
      }),
    },
  );

  if (!resp.ok) {
    throw new Error(`LLM Router error ${resp.status}`);
  }

  const json = (await resp.json()) as LlmResponse;
  if (!json.success) {
    throw new Error(json.error?.message ?? "LLM classification failed");
  }
  return json.data?.content ?? "";
}

function parseResponse(raw: string): ClassificationResult[] {
  const cleaned = stripMarkdownFence(raw.trim());
  const parsed = JSON.parse(cleaned) as RawClassification[];
  const validCategories = new Set<string>(CATEGORY_IDS);

  return parsed
    .filter(
      (item): item is RawClassification & { policyId: string } =>
        typeof item.policyId === "string",
    )
    .map((item) => ({
      policyId: item.policyId,
      category: (validCategories.has(item.category ?? "")
        ? item.category!
        : "other") as SkillCategory,
      confidence: typeof item.confidence === "number" ? item.confidence : 0,
    }));
}

export async function classifyPolicies(
  env: Env,
  policies: PolicyInput[],
): Promise<ClassificationResult[]> {
  if (policies.length === 0) return [];

  const results: ClassificationResult[] = [];

  for (let i = 0; i < policies.length; i += BATCH_SIZE) {
    const batch = policies.slice(i, i + BATCH_SIZE);
    const userContent = buildUserPrompt(batch);
    const raw = await callLlm(env, userContent);
    const parsed = parseResponse(raw);
    results.push(...parsed);
  }

  return results;
}
