/**
 * Handoff Adapter — Sprint 215 (AIF-REQ-035 Phase 2 E)
 *
 * Converts a Decode-X Handoff Package manifest into the Foundry-X
 * POST /prototype-jobs (F353) request payload.
 *
 * FX-SPEC-003 §5.1: prdTitle + prdContent + metadata
 * Gate conditions (§4.2): aiReadyOverall ≥ 0.75
 */

export interface HandoffManifest {
  reportId: string;
  packageVersion: string;
  skillId: string;
  orgId: string;
  domain: string;
  generatedAt: string;
  validUntil: string;
  aiReadyScore: {
    overall: number;
    passAiReady: boolean;
    scores: Record<string, boolean>;
  };
  specSummary: {
    policyCount: number;
    skillVersion: string;
    hasBusinessSpec: boolean;
    hasTechnicalSpec: boolean;
  };
  sourceManifest: {
    documentCount: number;
    documentIds: string[];
    linkedPolicies: string[];
    traceabilityScore: number;
  };
  verdict: "APPROVED" | "DENIED" | "DRAFT";
}

export interface FoundryXPayload {
  prdTitle: string;
  prdContent: string;
  metadata: {
    handoffPackageId: string;
    serviceId: string;
    orgId: string;
    contractVersion: string;
    aiReadyOverall: number;
    callbackUrl: string;
  };
}

export interface GateResult {
  pass: boolean;
  reasons: string[];
}

/** FX-SPEC-003 §4.2 Gate: aiReadyOverall ≥ 0.75 */
export function checkHandoffGate(manifest: HandoffManifest): GateResult {
  const reasons: string[] = [];

  if (manifest.aiReadyScore.overall < 0.75) {
    reasons.push(
      `AI-Ready overall ${manifest.aiReadyScore.overall.toFixed(2)} < 0.75 (gate minimum)`,
    );
  }

  if (manifest.verdict === "DENIED") {
    reasons.push("Handoff manifest verdict is DENIED");
  }

  return { pass: reasons.length === 0, reasons };
}

/**
 * Builds the Foundry-X POST /prototype-jobs payload from a Handoff manifest.
 *
 * specBusinessContent: markdown content of spec-business.md (policyCount
 * summaries, EARS rules). If absent, a structured stub is generated from
 * the manifest's specSummary.
 */
export function buildFoundryXPayload(
  manifest: HandoffManifest,
  opts: {
    specBusinessContent?: string;
    decodeXBaseUrl: string;
  },
): FoundryXPayload {
  const { specBusinessContent, decodeXBaseUrl } = opts;
  const serviceLabel = manifest.domain.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const prdContent =
    specBusinessContent ??
    buildSpecStub(manifest, serviceLabel);

  const callbackUrl = `${decodeXBaseUrl.replace(/\/$/, "")}/callback/${manifest.reportId}`;

  return {
    prdTitle: `LPON ${serviceLabel} Working Prototype — ${manifest.skillId}`,
    prdContent,
    metadata: {
      handoffPackageId: manifest.reportId,
      serviceId: manifest.skillId,
      orgId: manifest.orgId,
      contractVersion: "FX-SPEC-003/1.0",
      aiReadyOverall: manifest.aiReadyScore.overall,
      callbackUrl,
    },
  };
}

function buildSpecStub(manifest: HandoffManifest, serviceLabel: string): string {
  const policies = manifest.sourceManifest.linkedPolicies
    .map((p) => `- ${p}`)
    .join("\n") || "- (no policies linked)";

  return `# ${serviceLabel} Service Specification

## Overview
- Org: ${manifest.orgId}
- Skill ID: ${manifest.skillId}
- AI-Ready Score: ${(manifest.aiReadyScore.overall * 100).toFixed(0)}%
- Policy Count: ${manifest.specSummary.policyCount}
- Generated: ${manifest.generatedAt}

## Policies
${policies}

## Source Traceability
- Documents: ${manifest.sourceManifest.documentCount}
- Traceability Score: ${(manifest.sourceManifest.traceabilityScore * 100).toFixed(0)}%
`;
}
