import { buildHeaders } from "./headers";

export interface Policy {
  policy_id: string;
  policy_code: string;
  title: string;
  condition: string;
  criteria: string;
  outcome: string;
  status: string;
  trust_score: number;
  trust_level: string;
  tags: string[];
  source_document_id: string;
  source_excerpt?: string;
  created_at: string;
}

export async function fetchPolicies(
  orgId: string,
  opts?: { status?: string; limit?: number; offset?: number },
): Promise<{ policies: Policy[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  const res = await fetch(`/api/policies${qs ? `?${qs}` : ""}`, {
    headers: buildHeaders(orgId),
  });
  if (!res.ok) throw new Error(`Policy fetch failed: ${res.status}`);
  return res.json() as Promise<{ policies: Policy[]; total: number }>;
}

export async function fetchPolicy(
  orgId: string,
  policyId: string,
): Promise<Policy> {
  const res = await fetch(`/api/policies/${policyId}`, {
    headers: buildHeaders(orgId),
  });
  if (!res.ok) throw new Error(`Policy detail failed: ${res.status}`);
  const data = (await res.json()) as { policy: Policy };
  return data.policy;
}

export interface PolicyStats {
  total: number;
  byStatus: { approved: number; candidate: number; rejected: number };
  byDomain: Record<string, number>;
}

export async function fetchPolicyStats(orgId: string): Promise<PolicyStats> {
  const res = await fetch("/api/policies/stats", {
    headers: buildHeaders(orgId),
  });
  if (!res.ok) throw new Error(`Policy stats failed: ${res.status}`);
  return res.json() as Promise<PolicyStats>;
}
