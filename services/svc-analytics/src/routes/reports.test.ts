import { describe, it, expect, vi } from "vitest";
import {
  handleGetSections,
  handleUpsertSection,
  handleDeleteSection,
  handleSeedSections,
  handleCreateSnapshot,
  handleListSnapshots,
  handleGetSnapshot,
  handleExportMarkdown,
} from "./reports.js";
import type { Env } from "../env.js";

interface ApiOk<T> { success: true; data: T }
interface ApiErr { success: false; error: { code: string; message: string } }

/* ─── Mock helpers ─── */
function mockDb(overrides?: {
  firstResult?: Record<string, unknown> | null;
  allResults?: Record<string, unknown>[];
}) {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(overrides?.firstResult ?? null),
        all: vi.fn().mockResolvedValue({ results: overrides?.allResults ?? [] }),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }),
  } as unknown as D1Database;
}

function mockEnv(dbOverrides?: Parameters<typeof mockDb>[0]): Env {
  return {
    DB_ANALYTICS: mockDb(dbOverrides),
    SECURITY: { fetch: vi.fn() } as unknown as Fetcher,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-analytics",
    INTERNAL_API_SECRET: "test",
    SVC_POLICY: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_ONTOLOGY: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_EXTRACTION: { fetch: vi.fn() } as unknown as Fetcher,
  };
}

/* ─── handleGetSections ─── */
describe("handleGetSections", () => {
  it("requires organizationId", async () => {
    const env = mockEnv();
    const req = new Request("https://test/reports/sections");
    const res = await handleGetSections(req, env);
    expect(res.status).toBe(400);
  });

  it("returns sections sorted by sort_order", async () => {
    const env = mockEnv({
      allResults: [
        {
          section_id: "LPON::core",
          organization_id: "LPON",
          section_key: "core",
          title: "핵심 평가",
          subtitle: null,
          icon_name: "Search",
          content_type: "evaluation_table",
          content: JSON.stringify({ headers: ["A"], rows: [["1"]] }),
          sort_order: 0,
          updated_at: "2026-01-01",
          created_at: "2026-01-01",
        },
      ],
    });
    const req = new Request("https://test/reports/sections?organizationId=LPON");
    const res = await handleGetSections(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{ sections: Array<{ sectionKey: string; contentType: string }> }>;
    expect(body.data.sections).toHaveLength(1);
    expect(body.data.sections[0]?.sectionKey).toBe("core");
    expect(body.data.sections[0]?.contentType).toBe("evaluation_table");
  });
});

/* ─── handleUpsertSection ─── */
describe("handleUpsertSection", () => {
  it("requires organizationId and title", async () => {
    const env = mockEnv();
    const req = new Request("https://test/reports/sections/core", {
      method: "PUT",
      body: JSON.stringify({}),
    });
    const res = await handleUpsertSection(req, env, "core");
    expect(res.status).toBe(400);
  });

  it("validates contentType", async () => {
    const env = mockEnv();
    const req = new Request("https://test/reports/sections/core", {
      method: "PUT",
      body: JSON.stringify({
        organizationId: "LPON",
        title: "Test",
        contentType: "invalid_type",
        content: {},
      }),
    });
    const res = await handleUpsertSection(req, env, "core");
    expect(res.status).toBe(400);
    const body = await res.json() as ApiErr;
    expect(body.error.message).toContain("contentType");
  });

  it("upserts section successfully", async () => {
    const env = mockEnv();
    const req = new Request("https://test/reports/sections/core", {
      method: "PUT",
      body: JSON.stringify({
        organizationId: "LPON",
        title: "핵심 평가",
        contentType: "evaluation_table",
        content: { headers: ["A"], rows: [["1"]] },
      }),
    });
    const res = await handleUpsertSection(req, env, "core");
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{ sectionKey: string; updated: boolean }>;
    expect(body.data.sectionKey).toBe("core");
    expect(body.data.updated).toBe(true);
  });
});

/* ─── handleSeedSections ─── */
describe("handleSeedSections", () => {
  it("requires organizationId and sections", async () => {
    const env = mockEnv();
    const req = new Request("https://test/reports/sections/seed", {
      method: "POST",
      body: JSON.stringify({ organizationId: "LPON" }),
    });
    const res = await handleSeedSections(req, env);
    expect(res.status).toBe(400);
  });

  it("seeds sections", async () => {
    const env = mockEnv();
    const req = new Request("https://test/reports/sections/seed", {
      method: "POST",
      body: JSON.stringify({
        organizationId: "LPON",
        sections: [
          { sectionKey: "core", title: "Core", contentType: "evaluation_table", content: { headers: [], rows: [] } },
          { sectionKey: "quality", title: "Quality", contentType: "finding_cards", content: { cards: [] } },
        ],
      }),
    });
    const res = await handleSeedSections(req, env);
    expect(res.status).toBe(201);
    const body = await res.json() as ApiOk<{ inserted: number }>;
    expect(body.data.inserted).toBe(2);
  });
});

/* ─── handleCreateSnapshot ─── */
describe("handleCreateSnapshot", () => {
  it("requires organizationId and version", async () => {
    const env = mockEnv();
    const req = new Request("https://test/reports/snapshots", {
      method: "POST",
      body: JSON.stringify({ organizationId: "LPON" }),
    });
    const res = await handleCreateSnapshot(req, env);
    expect(res.status).toBe(400);
  });

  it("creates snapshot with current sections", async () => {
    const env = mockEnv({
      allResults: [
        {
          section_id: "LPON::core",
          organization_id: "LPON",
          section_key: "core",
          title: "핵심",
          subtitle: null,
          icon_name: null,
          content_type: "text_block",
          content: JSON.stringify({ blocks: [] }),
          sort_order: 0,
          updated_at: "2026-01-01",
          created_at: "2026-01-01",
        },
      ],
      firstResult: { docs: 88, approved: 848, total_policies: 850, skills: 859 },
    });
    const req = new Request("https://test/reports/snapshots", {
      method: "POST",
      body: JSON.stringify({ organizationId: "LPON", version: "v0.6.0", title: "Phase 4 Sprint 2" }),
    });
    const res = await handleCreateSnapshot(req, env);
    expect(res.status).toBe(201);
    const body = await res.json() as ApiOk<{ version: string; sectionCount: number }>;
    expect(body.data.version).toBe("v0.6.0");
    expect(body.data.sectionCount).toBe(1);
  });
});

/* ─── handleListSnapshots ─── */
describe("handleListSnapshots", () => {
  it("requires organizationId", async () => {
    const env = mockEnv();
    const req = new Request("https://test/reports/snapshots");
    const res = await handleListSnapshots(req, env);
    expect(res.status).toBe(400);
  });

  it("returns snapshot list", async () => {
    const env = mockEnv({
      allResults: [
        {
          snapshot_id: "LPON::v0.6.0",
          organization_id: "LPON",
          version: "v0.6.0",
          title: "Phase 4",
          notes: null,
          created_at: "2026-03-08",
        },
      ],
    });
    const req = new Request("https://test/reports/snapshots?organizationId=LPON");
    const res = await handleListSnapshots(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{ snapshots: Array<{ version: string }> }>;
    expect(body.data.snapshots).toHaveLength(1);
    expect(body.data.snapshots[0]?.version).toBe("v0.6.0");
  });
});

/* ─── handleGetSnapshot ─── */
describe("handleGetSnapshot", () => {
  it("returns 404 for missing snapshot", async () => {
    const env = mockEnv({ firstResult: null });
    const req = new Request("https://test/reports/snapshots/v1.0?organizationId=LPON");
    const res = await handleGetSnapshot(req, env, "v1.0");
    expect(res.status).toBe(404);
  });

  it("returns snapshot with parsed JSON", async () => {
    const env = mockEnv({
      firstResult: {
        snapshot_id: "LPON::v0.6.0",
        organization_id: "LPON",
        version: "v0.6.0",
        title: "Phase 4",
        sections_json: JSON.stringify([{ sectionKey: "core", title: "핵심" }]),
        metrics_json: JSON.stringify({ docs: 88 }),
        notes: null,
        created_at: "2026-03-08",
      },
    });
    const req = new Request("https://test/reports/snapshots/v0.6.0?organizationId=LPON");
    const res = await handleGetSnapshot(req, env, "v0.6.0");
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{ version: string; sectionsJson: unknown }>;
    expect(body.data.version).toBe("v0.6.0");
    expect(body.data.sectionsJson).toEqual([{ sectionKey: "core", title: "핵심" }]);
  });
});

/* ─── handleExportMarkdown ─── */
describe("handleExportMarkdown", () => {
  it("requires organizationId", async () => {
    const env = mockEnv();
    const req = new Request("https://test/reports/export/markdown");
    const res = await handleExportMarkdown(req, env);
    expect(res.status).toBe(400);
  });

  it("exports markdown from current sections", async () => {
    const env = mockEnv({
      allResults: [
        {
          section_id: "LPON::core",
          organization_id: "LPON",
          section_key: "core",
          title: "핵심 평가",
          subtitle: "평가 내용",
          icon_name: "Search",
          content_type: "data_table",
          content: JSON.stringify({ headers: ["항목", "값"], rows: [["문서", "88건"]] }),
          sort_order: 0,
          updated_at: "2026-01-01",
          created_at: "2026-01-01",
        },
      ],
    });
    const req = new Request("https://test/reports/export/markdown?organizationId=LPON");
    const res = await handleExportMarkdown(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    const md = await res.text();
    expect(md).toContain("# LPON 분석 보고서");
    expect(md).toContain("## 핵심 평가");
    expect(md).toContain("| 항목 | 값 |");
    expect(md).toContain("| 문서 | 88건 |");
  });
});

/* ─── handleDeleteSection ─── */
describe("handleDeleteSection", () => {
  it("requires organizationId", async () => {
    const env = mockEnv();
    const req = new Request("https://test/reports/sections/core", { method: "DELETE" });
    const res = await handleDeleteSection(req, env, "core");
    expect(res.status).toBe(400);
  });

  it("deletes section", async () => {
    const env = mockEnv();
    const req = new Request("https://test/reports/sections/core?organizationId=LPON", { method: "DELETE" });
    const res = await handleDeleteSection(req, env, "core");
    expect(res.status).toBe(204);
  });
});
