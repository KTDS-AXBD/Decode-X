import { buildHeaders } from "./headers";

const API_BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "/api";

function headers(organizationId: string): Record<string, string> {
  return buildHeaders({ organizationId });
}

// ── Types ───────────────────────────────────────

export interface OrgSpecSection {
  id: string;
  title: string;
  content: string;
  order: number;
}

export interface OrgSpecMetadata {
  domain: string;
  totalPolicies: number;
  avgTrustScore: number;
  aiReadyScore: { business: number; technical: number; quality: number };
}

export interface OrgSpecDocument {
  organizationId: string;
  type: "business" | "technical" | "quality";
  generatedAt: string;
  skillCount: number;
  sections: OrgSpecSection[];
  metadata: OrgSpecMetadata;
}

// ── API Functions ───────────────────────────────

export async function fetchOrgSpec(
  organizationId: string,
  type: "business" | "technical" | "quality",
  options?: { llm?: boolean; limit?: number },
): Promise<OrgSpecDocument> {
  const qs = new URLSearchParams();
  if (options?.llm === false) qs.set("llm", "false");
  if (options?.limit) qs.set("limit", String(options.limit));
  const query = qs.toString();

  const url = `${API_BASE}/skills/org/${organizationId}/spec/${type}${query ? `?${query}` : ""}`;
  const res = await fetch(url, { headers: headers(organizationId) });

  if (!res.ok) {
    throw new Error(`Org spec fetch failed: ${res.status}`);
  }

  const body = (await res.json()) as { success: boolean; data: OrgSpecDocument };
  return body.data;
}

export async function fetchAllOrgSpecs(
  organizationId: string,
  options?: { llm?: boolean; limit?: number },
): Promise<OrgSpecDocument[]> {
  const qs = new URLSearchParams();
  if (options?.llm === false) qs.set("llm", "false");
  if (options?.limit) qs.set("limit", String(options.limit));
  const query = qs.toString();

  const url = `${API_BASE}/skills/org/${organizationId}/spec/all${query ? `?${query}` : ""}`;
  const res = await fetch(url, { headers: headers(organizationId) });

  if (!res.ok) {
    throw new Error(`Org spec fetch failed: ${res.status}`);
  }

  const body = (await res.json()) as { success: boolean; data: { organizationId: string; specs: OrgSpecDocument[] } };
  return body.data.specs;
}

/** Skill 개별 Spec (기존 API) */
export async function fetchSkillSpec(
  organizationId: string,
  skillId: string,
  type: "business" | "technical" | "quality" | "all",
  options?: { llm?: boolean },
): Promise<unknown> {
  const qs = new URLSearchParams();
  if (options?.llm === false) qs.set("llm", "false");
  const query = qs.toString();

  const url = `${API_BASE}/skills/${skillId}/spec/${type}${query ? `?${query}` : ""}`;
  const res = await fetch(url, { headers: headers(organizationId) });

  if (!res.ok) {
    throw new Error(`Skill spec fetch failed: ${res.status}`);
  }

  const body = (await res.json()) as { success: boolean; data: unknown };
  return body.data;
}
