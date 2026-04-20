export type ReconcileMarker = "SOURCE_MISSING" | "DOC_ONLY" | "DIVERGENCE";

export interface DocEndpointSpec {
  path: string;
  method: string;
  description?: string;
  params?: Array<{ name: string; type: string; required: boolean }>;
}

export interface DocApiSpec {
  projectName: string;
  endpoints: DocEndpointSpec[];
}

export interface ReconcileResult {
  marker: ReconcileMarker;
  subject: string;
  httpMethod?: string | undefined;
  sourceDetail?: string | undefined;
  docDetail?: string | undefined;
  divergenceReason?: string | undefined;
}

export interface ReconciliationReport {
  projectName: string;
  analyzedAt: string;
  results: ReconcileResult[];
  summary: {
    sourceMissing: number;
    docOnly: number;
    divergences: number;
    total: number;
  };
}
