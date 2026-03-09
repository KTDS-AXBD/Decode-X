/**
 * Data collector for SI deliverable export (AIF-REQ-017).
 * Fetches data from svc-policy, svc-ontology, svc-extraction via service bindings.
 */
import { createLogger } from "@ai-foundry/utils";

const logger = createLogger("deliverable-collector");

// ─── Types ────────────────────────────────────────────────────────

export interface PolicyRow {
  policyId: string;
  policyCode: string;
  title: string;
  condition: string;
  criteria: string;
  outcome: string;
  sourceDocumentId: string;
  sourcePageRef: string | null;
  sourceExcerpt: string | null;
  status: string;
  trustLevel: string;
  trustScore: number;
  tags: string[];
  organizationId: string;
}

export interface TermRow {
  termId: string;
  ontologyId: string;
  label: string;
  definition: string | null;
  skosUri: string;
  broaderTermId: string | null;
  termType: string;
  embeddingModel: string | null;
}

export interface TermStats {
  totalTerms: number;
  distinctLabels: number;
  ontologyCount: number;
  typeDistribution: Record<string, number>;
}

export interface PerspectiveSummary {
  asIsCount: number;
  toBeCount: number;
  matchedCount: number;
  gapCount: number;
  coveragePct: number;
  items: PerspectiveItem[];
}

export interface PerspectiveItem {
  name: string;
  source: string;
  status: string;
  severity: string;
  detail?: string;
  documentId?: string;
}

export interface GapOverview {
  organizationId: string;
  perspectives: {
    process: PerspectiveSummary;
    architecture: PerspectiveSummary;
    api: PerspectiveSummary;
    table: PerspectiveSummary;
  };
  sourceStats: {
    controllerCount: number;
    endpointCount: number;
    tableCount: number;
    mapperCount: number;
    transactionCount: number;
  };
  generatedAt: string;
}

// ─── Internal fetch helper ────────────────────────────────────────

async function fetchInternal<T>(
  svc: Fetcher,
  path: string,
  secret: string,
): Promise<T> {
  const res = await svc.fetch(new Request(`https://internal${path}`, {
    headers: { "X-Internal-Secret": secret },
  }));
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Internal fetch ${path} failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

// ─── Collectors ──────────────────────────────────────────────────

/**
 * Fetch all approved policies for an org, paginated.
 */
export async function collectPolicies(
  svc: Fetcher,
  secret: string,
  organizationId: string,
): Promise<PolicyRow[]> {
  const all: PolicyRow[] = [];
  let offset = 0;
  const limit = 500;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const data = await fetchInternal<{ policies: PolicyRow[]; total: number }>(
      svc,
      `/policies?status=approved&organizationId=${organizationId}&limit=${limit}&offset=${offset}`,
      secret,
    );
    all.push(...data.policies);
    if (all.length >= data.total || data.policies.length < limit) break;
    offset += limit;
  }
  logger.info("Collected policies", { count: all.length, organizationId });
  return all;
}

/**
 * Fetch all terms for an org, paginated.
 */
export async function collectTerms(
  svc: Fetcher,
  secret: string,
  organizationId: string,
): Promise<{ terms: TermRow[]; stats: TermStats }> {
  const all: TermRow[] = [];
  let offset = 0;
  const limit = 2000;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const data = await fetchInternal<{ terms: TermRow[]; total: number }>(
      svc,
      `/terms?organizationId=${organizationId}&limit=${limit}&offset=${offset}`,
      secret,
    );
    all.push(...data.terms);
    if (all.length >= data.total || data.terms.length < limit) break;
    offset += limit;
  }

  const stats = await fetchInternal<TermStats>(
    svc,
    `/terms/stats?organizationId=${organizationId}`,
    secret,
  );

  logger.info("Collected terms", { count: all.length, organizationId });
  return { terms: all, stats };
}

/**
 * Fetch gap analysis overview for an org.
 */
export async function collectGapAnalysis(
  svc: Fetcher,
  secret: string,
  organizationId: string,
): Promise<GapOverview> {
  const overview = await fetchInternal<GapOverview>(
    svc,
    `/gap-analysis/overview?organizationId=${organizationId}`,
    secret,
  );
  logger.info("Collected gap analysis", { organizationId });
  return overview;
}
