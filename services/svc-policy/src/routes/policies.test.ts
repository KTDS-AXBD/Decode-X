import { describe, it, expect } from "vitest";
import { extractJsonArray, formatPolicyRow, type PolicyRow } from "./policies.js";

// ── extractJsonArray ──────────────────────────────────────────────

describe("extractJsonArray", () => {
  it("returns plain JSON array as-is", () => {
    const input = '[{"title":"test"}]';
    expect(extractJsonArray(input)).toBe('[{"title":"test"}]');
  });

  it("strips markdown json fence", () => {
    const input = '```json\n[{"title":"test"}]\n```';
    expect(extractJsonArray(input)).toBe('[{"title":"test"}]');
  });

  it("strips markdown fence without language", () => {
    const input = '```\n[{"title":"test"}]\n```';
    expect(extractJsonArray(input)).toBe('[{"title":"test"}]');
  });

  it("extracts JSON array from surrounding prose", () => {
    const input = 'Here are the policies:\n[{"title":"test"}]\nDone.';
    expect(extractJsonArray(input)).toBe('[{"title":"test"}]');
  });

  it("handles nested brackets correctly", () => {
    const input = '[{"tags":["a","b"]},{"tags":["c"]}]';
    expect(extractJsonArray(input)).toBe('[{"tags":["a","b"]},{"tags":["c"]}]');
  });

  it("returns empty array string", () => {
    expect(extractJsonArray("[]")).toBe("[]");
  });

  it("handles whitespace around content", () => {
    const input = "  \n  [1, 2, 3]  \n  ";
    expect(extractJsonArray(input)).toBe("[1, 2, 3]");
  });

  it("returns raw text when no brackets found", () => {
    const input = "no json here";
    expect(extractJsonArray(input)).toBe("no json here");
  });

  it("handles markdown fence with extra whitespace", () => {
    const input = '```json  \n  [{"a":1}]  \n  ```';
    expect(extractJsonArray(input)).toBe('[{"a":1}]');
  });
});

// ── formatPolicyRow ──────────────────────────────────────────────

describe("formatPolicyRow", () => {
  const baseRow: PolicyRow = {
    policy_id: "p-001",
    extraction_id: "e-001",
    organization_id: "org-001",
    policy_code: "POL-PENSION-WD-001",
    title: "중도인출 조건",
    condition: "가입 후 5년 경과",
    criteria: "잔액 50% 이내",
    outcome: "중도인출 허용",
    exception: null,
    source_document_id: "doc-001",
    source_page_ref: "p.12",
    source_excerpt: "발췌문",
    status: "candidate",
    trust_level: "unreviewed",
    trust_score: 0,
    tags: '["퇴직연금","중도인출"]',
    created_at: "2026-02-28T00:00:00.000Z",
    updated_at: "2026-02-28T00:00:00.000Z",
  };

  it("maps snake_case DB columns to camelCase", () => {
    const result = formatPolicyRow(baseRow);
    expect(result.policyId).toBe("p-001");
    expect(result.extractionId).toBe("e-001");
    expect(result.organizationId).toBe("org-001");
    expect(result.policyCode).toBe("POL-PENSION-WD-001");
    expect(result.sourceDocumentId).toBe("doc-001");
    expect(result.sourcePageRef).toBe("p.12");
    expect(result.sourceExcerpt).toBe("발췌문");
    expect(result.trustLevel).toBe("unreviewed");
    expect(result.trustScore).toBe(0);
    expect(result.createdAt).toBe("2026-02-28T00:00:00.000Z");
    expect(result.updatedAt).toBe("2026-02-28T00:00:00.000Z");
  });

  it("parses valid JSON tags", () => {
    const result = formatPolicyRow(baseRow);
    expect(result.tags).toEqual(["퇴직연금", "중도인출"]);
  });

  it("returns empty array for invalid tags JSON", () => {
    const row = { ...baseRow, tags: "not-json" };
    const result = formatPolicyRow(row);
    expect(result.tags).toEqual([]);
  });

  it("filters non-string elements from tags", () => {
    const row = { ...baseRow, tags: '["valid", 123, null, "also-valid"]' };
    const result = formatPolicyRow(row);
    expect(result.tags).toEqual(["valid", "also-valid"]);
  });

  it("handles empty tags array", () => {
    const row = { ...baseRow, tags: "[]" };
    const result = formatPolicyRow(row);
    expect(result.tags).toEqual([]);
  });

  it("handles null source fields", () => {
    const row = { ...baseRow, source_page_ref: null, source_excerpt: null };
    const result = formatPolicyRow(row);
    expect(result.sourcePageRef).toBeNull();
    expect(result.sourceExcerpt).toBeNull();
  });
});
