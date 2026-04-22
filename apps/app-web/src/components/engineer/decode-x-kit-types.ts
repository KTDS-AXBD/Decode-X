/**
 * Generic type interfaces for Decode-X Kit components.
 * These types are independent of Decode-X API internals and can be used
 * when contributing SpecSourceSplitView / ProvenanceInspector to external registries.
 */

export interface PolicyItem {
  code: string;
  title: string;
  condition: string;
  criteria: string;
  outcome: string;
  confidence: number;
}

export interface SourceItem {
  type: "reverse-engineering" | "inference";
  path?: string;
  section?: string;
  confidence: number;
  documentId?: string;
}

export interface TermItem {
  termId: string;
  label: string;
  definition?: string;
}

/** Generic data shape consumed by SpecSourceSplitView and ProvenanceInspector */
export interface SpecSourceData {
  skillId: string;
  domain: string;
  extractedAt: string;
  sources: SourceItem[];
  policies: PolicyItem[];
  terms: TermItem[];
  documentIds: string[];
  pipelineStages: string[];
}

export type HandoffStatus = "completed" | "pending" | "failed";

export interface ComplianceCheck {
  label: string;
  passed: boolean;
}

/** Generic data shape consumed by StageReplayer (FoundryXTimeline) */
export interface StageItem {
  id: string;
  name: string;
  nameDisplay?: string;
  status: HandoffStatus;
  completedAt?: string;
  aiReadyScore?: number;
  policyCount?: number;
  compliance?: ComplianceCheck[];
  roundTripSummary?: string;
}

export interface StageReplayerProps {
  items: StageItem[];
  title?: string;
  subtitle?: string;
  dataSource?: string;
}
