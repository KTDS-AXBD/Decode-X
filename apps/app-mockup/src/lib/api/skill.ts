import { buildHeaders } from "./headers";

export interface SkillSummary {
  skill_id: string;
  domain: string;
  subdomain?: string;
  version: string;
  status: string;
  trust_score: number;
  trust_level: string;
  policy_count: number;
  tags: string[];
  created_at: string;
}

export interface SkillEvaluation {
  evaluationId: string;
  skillId: string;
  policyCode: string;
  result: string;
  confidence: number;
  reasoning: string;
  provider: string;
  model: string;
  latencyMs: number;
}

export async function fetchSkills(
  orgId: string,
  opts?: { domain?: string; tag?: string; status?: string; limit?: number },
): Promise<{ skills: SkillSummary[] }> {
  const params = new URLSearchParams();
  if (opts?.domain) params.set("domain", opts.domain);
  if (opts?.tag) params.set("tag", opts.tag);
  if (opts?.status) params.set("status", opts.status);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const res = await fetch(`/api/skills${qs ? `?${qs}` : ""}`, {
    headers: buildHeaders(orgId),
  });
  if (!res.ok) throw new Error(`Skills fetch failed: ${res.status}`);
  return res.json() as Promise<{ skills: SkillSummary[] }>;
}

export async function fetchSkillDetail(
  orgId: string,
  skillId: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/skills/${skillId}`, {
    headers: buildHeaders(orgId),
  });
  if (!res.ok) throw new Error(`Skill detail failed: ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

export async function evaluateSkill(
  orgId: string,
  skillId: string,
  body: { context: string; policyCode?: string; parameters?: object },
): Promise<SkillEvaluation> {
  const res = await fetch(`/api/skills/${skillId}/evaluate`, {
    method: "POST",
    headers: buildHeaders(orgId),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Skill evaluate failed: ${res.status}`);
  return res.json() as Promise<SkillEvaluation>;
}

export async function fetchSkillTags(orgId: string): Promise<string[]> {
  const res = await fetch("/api/skills/search/tags", {
    headers: buildHeaders(orgId),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { tags: string[] };
  return data.tags;
}

export interface SkillStats {
  totalSkills: number;
  byDomain: Record<string, number>;
  byStatus: Record<string, number>;
  avgTrustScore: number;
}

export async function fetchSkillStats(orgId: string): Promise<SkillStats> {
  const res = await fetch("/api/skills/stats", {
    headers: buildHeaders(orgId),
  });
  if (!res.ok) throw new Error(`Skill stats failed: ${res.status}`);
  return res.json() as Promise<SkillStats>;
}

export interface SkillMcpAdapter {
  serverInfo: Record<string, unknown>;
  instructions: string;
  tools: Record<string, unknown>[];
  metadata: Record<string, unknown>;
}

export async function fetchSkillMcp(
  orgId: string,
  skillId: string,
): Promise<SkillMcpAdapter> {
  const res = await fetch(`/api/skills/${skillId}/mcp`, {
    headers: buildHeaders(orgId),
  });
  if (!res.ok) throw new Error(`Skill MCP fetch failed: ${res.status}`);
  return res.json() as Promise<SkillMcpAdapter>;
}
