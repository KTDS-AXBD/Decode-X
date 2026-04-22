/**
 * sample-loader.ts — LPON skill 샘플 로더 (F356-A PoC)
 *
 * GET /skills (X-Organization-Id: LPON) 엔드포인트에서 skill 메타를 로드.
 * SVC_SKILL_URL, INTERNAL_API_SECRET 환경변수 필요.
 */

export interface SkillMeta {
  id: string;
  name: string;
  domain: string;
  subdomain: string;
  sourceCode: string;
  metadata: {
    provenanceYaml: string;
    contracts: string;
    rules: string[];
  };
}

interface SkillListItem {
  id: string;
  name: string;
  domain: string;
  subdomain: string;
  organization_id: string;
}

interface SkillDetail {
  id: string;
  name: string;
  domain: string;
  subdomain: string;
  source_code?: string;
  provenance?: { yaml?: string };
  contracts?: string;
  rules?: string[];
}

const TIER_A_SUBDOMAINS = [
  "charge",
  "budget",
  "gift",
  "payment",
  "purchase",
  "refund",
  "settlement",
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const copy = [...arr];
  const rng = seededRandom(seed);
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i];
    const other = copy[j];
    if (tmp !== undefined && other !== undefined) {
      copy[i] = other;
      copy[j] = tmp;
    }
  }
  return copy;
}

async function fetchSkillList(
  baseUrl: string,
  secret: string,
  orgId: string,
  domain?: string,
  limit = 200,
): Promise<SkillListItem[]> {
  const url = new URL(`${baseUrl}/skills`);
  if (domain) url.searchParams.set("domain", domain);
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), {
    headers: {
      "X-Organization-Id": orgId,
      "X-Internal-Secret": secret,
    },
  });

  if (!res.ok) {
    throw new Error(`GET /skills failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { skills?: SkillListItem[]; data?: SkillListItem[] };
  return json.skills ?? json.data ?? [];
}

async function fetchSkillDetail(
  baseUrl: string,
  secret: string,
  orgId: string,
  skillId: string,
): Promise<SkillDetail> {
  const res = await fetch(`${baseUrl}/skills/${skillId}`, {
    headers: {
      "X-Organization-Id": orgId,
      "X-Internal-Secret": secret,
    },
  });
  if (!res.ok) {
    throw new Error(`GET /skills/${skillId} failed: ${res.status}`);
  }
  return (await res.json()) as SkillDetail;
}

function toSkillMeta(detail: SkillDetail): SkillMeta {
  return {
    id: detail.id,
    name: detail.name,
    domain: detail.domain,
    subdomain: detail.subdomain,
    sourceCode: detail.source_code ?? "",
    metadata: {
      provenanceYaml: detail.provenance?.yaml ?? "",
      contracts: detail.contracts ?? "{}",
      rules: detail.rules ?? [],
    },
  };
}

export async function loadTierASkills(count: number, seed = 20260422): Promise<SkillMeta[]> {
  const baseUrl = process.env["SVC_SKILL_URL"] ?? "http://localhost:8787";
  const secret = process.env["INTERNAL_API_SECRET"] ?? "";
  const orgId = "LPON";

  const perSubdomain = Math.ceil(count / TIER_A_SUBDOMAINS.length);
  const allItems: SkillListItem[] = [];

  for (const subdomain of TIER_A_SUBDOMAINS) {
    const items = await fetchSkillList(baseUrl, secret, orgId, subdomain, perSubdomain * 3);
    const shuffled = shuffleWithSeed(items, seed + allItems.length);
    allItems.push(...shuffled.slice(0, perSubdomain));
  }

  const selected = shuffleWithSeed(allItems, seed).slice(0, count);
  return Promise.all(selected.map((s) => fetchSkillDetail(baseUrl, secret, orgId, s.id).then(toSkillMeta)));
}

export async function loadRandomSkills(
  count: number,
  domains = ["pension", "giftvoucher"],
  seed = 20260422,
): Promise<SkillMeta[]> {
  const baseUrl = process.env["SVC_SKILL_URL"] ?? "http://localhost:8787";
  const secret = process.env["INTERNAL_API_SECRET"] ?? "";
  const orgId = "LPON";

  const perDomain = Math.ceil(count / domains.length);
  const allItems: SkillListItem[] = [];

  for (const domain of domains) {
    const items = await fetchSkillList(baseUrl, secret, orgId, domain, perDomain * 3);
    const shuffled = shuffleWithSeed(items, seed + allItems.length);
    allItems.push(...shuffled.slice(0, perDomain));
  }

  const selected = shuffleWithSeed(allItems, seed).slice(0, count);
  return Promise.all(selected.map((s) => fetchSkillDetail(baseUrl, secret, orgId, s.id).then(toSkillMeta)));
}
