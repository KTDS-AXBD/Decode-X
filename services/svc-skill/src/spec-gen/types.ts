/**
 * B/T/Q Spec Document types — Skill 단위 + Org 단위 Spec 문서 생성용
 */

// ── Spec 문서 구조 ──────────────────────────────

export type SpecType = "business" | "technical" | "quality";

export interface SpecSection {
  id: string;
  title: string;
  content: string; // markdown
  order: number;
}

export interface SpecMetadata {
  domain: string;
  subdomain?: string | undefined;
  policyCount: number;
  aiReadyScore: {
    business: number;
    technical: number;
    quality: number;
  };
}

export interface SpecDocument {
  skillId: string;
  type: SpecType;
  generatedAt: string; // ISO8601
  sections: SpecSection[];
  metadata: SpecMetadata;
}

// ── Skill 단위 데이터 수집 결과 ───────────────────

export interface SkillSpecData {
  skillId: string;
  organizationId: string;
  domain: string;
  subdomain?: string | undefined;

  /** SkillPackage 원본 (R2) */
  policies: PolicySummary[];
  technicalSpec: TechnicalSpecData | null;
  adapters: { mcp?: string | undefined; openapi?: string | undefined };
  trust: { level: string; score: number };
  provenance: ProvenanceSummary;
  ontologyRef: { graphId: string; termUris: string[]; skosConceptScheme?: string | undefined };

  /** Extraction 결과 (D1 via Service Binding) */
  extraction: ExtractionData | null;

  /** Ontology terms (Service Binding) */
  terms: TermSummary[];
}

export interface PolicySummary {
  code: string;
  title: string;
  condition: string;
  criteria: string;
  outcome: string;
  tags: string[];
  source: {
    documentId: string;
    pageRef?: string | undefined;
    excerpt?: string | undefined;
  };
  trust: { level: string; score: number };
}

export interface TechnicalSpecData {
  apis: Array<{
    endpoint: string;
    method: string;
    requestSchema?: string | undefined;
    responseSchema?: string | undefined;
    description?: string | undefined;
  }>;
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      type: string;
      nullable?: boolean | undefined;
      foreignKey?: string | undefined;
    }>;
    description?: string | undefined;
  }>;
  dataFlows: Array<{
    source: string;
    target: string;
    type: string;
    description?: string | undefined;
  }>;
  errors: Array<{
    code?: string | undefined;
    exception?: string | undefined;
    path?: string | undefined;
    handling?: string | undefined;
    severity?: string | undefined;
  }>;
}

export interface ProvenanceSummary {
  sourceDocumentIds: string[];
  organizationId: string;
  extractedAt: string;
  pipeline: { stages: string[]; models: Record<string, string> };
}

export interface ExtractionData {
  processes: Array<{ name: string; description: string; steps: string[] }>;
  entities: Array<{ name: string; type: string; attributes: string[] }>;
  relationships: Array<{ from: string; to: string; type: string }>;
  rules: Array<{ condition: string; outcome: string; domain: string }>;
}

export interface TermSummary {
  label: string;
  definition: string | null;
  skosUri: string | null;
  termType: string;
}

// ── Org 단위 집계 ────────────────────────────────

export interface OrgSpecData {
  organizationId: string;
  domain: string; // 가장 많은 도메인
  skillCount: number;
  allPolicies: PolicySummary[];
  allTechnicalSpecs: TechnicalSpecData[];
  allExtractions: ExtractionData[];
  allTerms: TermSummary[];
  avgTrustScore: number;
  adapters: { mcpCount: number; openapiCount: number };
}

export interface OrgSpecMetadata {
  domain: string;
  totalPolicies: number;
  avgTrustScore: number;
  aiReadyScore: {
    business: number;
    technical: number;
    quality: number;
  };
}

export interface OrgSpecDocument {
  organizationId: string;
  type: SpecType;
  generatedAt: string;
  skillCount: number;
  sections: SpecSection[];
  metadata: OrgSpecMetadata;
}
