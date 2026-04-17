/**
 * OpenRouter HTTP Client — OpenAI 호환 Chat Completions API
 *
 * svc-llm-router를 거치지 않고 직접 OpenRouter를 호출.
 * Spec 문서 생성기 등 경량 LLM 호출용.
 */

export interface OpenRouterEnv {
  OPENROUTER_API_KEY: string;
}

export interface OpenRouterOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface OpenRouterResult {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

const DEFAULT_MODEL = "anthropic/claude-haiku-4-5";

/**
 * Call OpenRouter Chat Completions API. Returns the content string.
 */
export async function callOpenRouter(
  env: OpenRouterEnv,
  prompt: string,
  options?: OpenRouterOptions,
): Promise<string> {
  const result = await callOpenRouterWithMeta(env, prompt, options);
  return result.content;
}

/**
 * Call OpenRouter Chat Completions API. Returns content + model + usage metadata.
 */
export async function callOpenRouterWithMeta(
  env: OpenRouterEnv,
  prompt: string,
  options?: OpenRouterOptions,
): Promise<OpenRouterResult> {
  const messages: Array<{ role: string; content: string }> = [];
  if (options?.system) {
    messages.push({ role: "system", content: options.system });
  }
  messages.push({ role: "user", content: prompt });

  const body = {
    model: options?.model ?? DEFAULT_MODEL,
    messages,
    max_tokens: options?.maxTokens ?? 512,
    temperature: options?.temperature ?? 0.3,
  };

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://decode-x.ktds-axbd.workers.dev",
      "X-Title": "Decode-X",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter error ${response.status}: ${text}`);
  }

  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const content = json.choices?.[0]?.message?.content ?? "";
  const usage = json.usage;

  return {
    content,
    model: json.model ?? options?.model ?? DEFAULT_MODEL,
    usage: {
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    },
  };
}
