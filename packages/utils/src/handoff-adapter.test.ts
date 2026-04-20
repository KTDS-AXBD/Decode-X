import { describe, it, expect } from "vitest";
import {
  checkHandoffGate,
  buildFoundryXPayload,
} from "./handoff-adapter.js";
import type { HandoffManifest } from "./handoff-adapter.js";

function makeManifest(overrides?: Partial<HandoffManifest>): HandoffManifest {
  return {
    reportId: "HPK-LPON-lpon-payment-abc123",
    packageVersion: "1.0.0",
    skillId: "lpon-payment",
    orgId: "LPON",
    domain: "lpon-payment",
    generatedAt: "2026-04-20T00:00:00Z",
    validUntil: "2026-07-19T00:00:00Z",
    aiReadyScore: {
      overall: 0.89,
      passAiReady: true,
      scores: {
        machineReadable: true,
        semanticConsistency: true,
        testable: true,
        traceable: true,
        completeness: true,
        humanReviewable: true,
      },
    },
    specSummary: {
      policyCount: 7,
      skillVersion: "1.0.0",
      hasBusinessSpec: true,
      hasTechnicalSpec: true,
    },
    sourceManifest: {
      documentCount: 3,
      documentIds: ["doc-1", "doc-2", "doc-3"],
      linkedPolicies: ["POL-PAYMENT-001", "POL-PAYMENT-002"],
      traceabilityScore: 1.0,
    },
    verdict: "APPROVED",
    ...overrides,
  };
}

describe("checkHandoffGate", () => {
  it("passes when overall >= 0.75 and verdict is not DENIED", () => {
    const result = checkHandoffGate(makeManifest());
    expect(result.pass).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("fails when overall < 0.75", () => {
    const result = checkHandoffGate(makeManifest({ aiReadyScore: { overall: 0.74, passAiReady: false, scores: {} } }));
    expect(result.pass).toBe(false);
    expect(result.reasons[0]).toMatch(/0\.74.*< 0\.75/);
  });

  it("fails when verdict is DENIED", () => {
    const result = checkHandoffGate(makeManifest({ verdict: "DENIED" }));
    expect(result.pass).toBe(false);
    expect(result.reasons.some((r) => r.includes("DENIED"))).toBe(true);
  });

  it("accumulates multiple failure reasons", () => {
    const result = checkHandoffGate(
      makeManifest({ aiReadyScore: { overall: 0.50, passAiReady: false, scores: {} }, verdict: "DENIED" }),
    );
    expect(result.pass).toBe(false);
    expect(result.reasons).toHaveLength(2);
  });

  it("passes at the exact boundary 0.75", () => {
    const result = checkHandoffGate(makeManifest({ aiReadyScore: { overall: 0.75, passAiReady: true, scores: {} } }));
    expect(result.pass).toBe(true);
  });
});

describe("buildFoundryXPayload", () => {
  const opts = { decodeXBaseUrl: "https://svc-skill.ktds-axbd.workers.dev" };

  it("builds correct prdTitle with service label", () => {
    const payload = buildFoundryXPayload(makeManifest(), opts);
    expect(payload.prdTitle).toContain("LPON");
    expect(payload.prdTitle).toContain("lpon-payment");
  });

  it("uses provided specBusinessContent as prdContent", () => {
    const content = "# My Spec\n\nDetailed content.";
    const payload = buildFoundryXPayload(makeManifest(), { ...opts, specBusinessContent: content });
    expect(payload.prdContent).toBe(content);
  });

  it("generates stub prdContent when specBusinessContent is absent", () => {
    const payload = buildFoundryXPayload(makeManifest(), opts);
    expect(payload.prdContent).toContain("LPON");
    expect(payload.prdContent).toContain("lpon-payment");
    expect(payload.prdContent).toContain("89%");
  });

  it("sets correct metadata fields", () => {
    const manifest = makeManifest();
    const payload = buildFoundryXPayload(manifest, opts);
    expect(payload.metadata.handoffPackageId).toBe(manifest.reportId);
    expect(payload.metadata.serviceId).toBe("lpon-payment");
    expect(payload.metadata.orgId).toBe("LPON");
    expect(payload.metadata.contractVersion).toBe("FX-SPEC-003/1.0");
    expect(payload.metadata.aiReadyOverall).toBe(0.89);
  });

  it("builds callbackUrl from decodeXBaseUrl and reportId", () => {
    const payload = buildFoundryXPayload(makeManifest(), opts);
    expect(payload.metadata.callbackUrl).toBe(
      `https://svc-skill.ktds-axbd.workers.dev/callback/${makeManifest().reportId}`,
    );
  });

  it("strips trailing slash from decodeXBaseUrl", () => {
    const payload = buildFoundryXPayload(makeManifest(), { decodeXBaseUrl: "https://svc-skill.workers.dev/" });
    expect(payload.metadata.callbackUrl).not.toContain("//callback");
  });
});
