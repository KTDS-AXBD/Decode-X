/**
 * Report sections & snapshots API
 * AIF-REQ-011: 분석 보고서 동적 콘텐츠 관리
 */

import { ok, created, noContent, badRequest, notFound } from "@ai-foundry/utils";
import type { Env } from "../env.js";

/* ─── Types ─── */
interface ReportSection {
  sectionId: string;
  organizationId: string;
  sectionKey: string;
  title: string;
  subtitle: string | null;
  iconName: string | null;
  contentType: string;
  content: unknown;
  sortOrder: number;
  updatedAt: string;
  createdAt: string;
}

interface ReportSnapshot {
  snapshotId: string;
  organizationId: string;
  version: string;
  title: string | null;
  sectionsJson: unknown;
  metricsJson: unknown;
  notes: string | null;
  createdAt: string;
}

const VALID_CONTENT_TYPES = [
  "evaluation_table", "finding_cards", "metric_grid",
  "data_table", "task_list", "policy_examples", "text_block",
  "comparison_table", "framing_block",
] as const;

/* ─── GET /reports/sections ─── */
export async function handleGetSections(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  if (!organizationId) return badRequest("organizationId query param required");

  const result = await env.DB_ANALYTICS.prepare(
    "SELECT * FROM report_sections WHERE organization_id = ? ORDER BY sort_order ASC",
  ).bind(organizationId).all();

  const sections: ReportSection[] = (result.results ?? []).map(mapSection);
  return ok({ organizationId, sections });
}

/* ─── PUT /reports/sections/:sectionKey ─── */
export async function handleUpsertSection(request: Request, env: Env, sectionKey: string): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  const organizationId = body["organizationId"] as string | undefined;
  if (!organizationId || !sectionKey) return badRequest("organizationId and sectionKey required");

  const title = body["title"] as string | undefined;
  if (!title) return badRequest("title required");

  const contentType = body["contentType"] as string | undefined;
  if (!contentType || !VALID_CONTENT_TYPES.includes(contentType as typeof VALID_CONTENT_TYPES[number])) {
    return badRequest(`contentType must be one of: ${VALID_CONTENT_TYPES.join(", ")}`);
  }

  const content = body["content"];
  if (!content) return badRequest("content required");

  const sectionId = `${organizationId}::${sectionKey}`;
  const now = new Date().toISOString();

  await env.DB_ANALYTICS.prepare(`
    INSERT INTO report_sections (section_id, organization_id, section_key, title, subtitle, icon_name, content_type, content, sort_order, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, section_key)
    DO UPDATE SET title = excluded.title, subtitle = excluded.subtitle, icon_name = excluded.icon_name,
      content_type = excluded.content_type, content = excluded.content, sort_order = excluded.sort_order,
      updated_at = excluded.updated_at
  `).bind(
    sectionId, organizationId, sectionKey,
    title,
    (body["subtitle"] as string | undefined) ?? null,
    (body["iconName"] as string | undefined) ?? null,
    contentType,
    JSON.stringify(content),
    (body["sortOrder"] as number | undefined) ?? 0,
    now, now,
  ).run();

  return ok({ sectionId, sectionKey, organizationId, updated: true });
}

/* ─── DELETE /reports/sections/:sectionKey ─── */
export async function handleDeleteSection(request: Request, env: Env, sectionKey: string): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  if (!organizationId) return badRequest("organizationId query param required");

  await env.DB_ANALYTICS.prepare(
    "DELETE FROM report_sections WHERE organization_id = ? AND section_key = ?",
  ).bind(organizationId, sectionKey).run();

  return noContent();
}

/* ─── POST /reports/sections/seed ─── */
export async function handleSeedSections(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  const organizationId = body["organizationId"] as string | undefined;
  if (!organizationId) return badRequest("organizationId required");

  const sections = body["sections"] as Array<Record<string, unknown>> | undefined;
  if (!sections || !Array.isArray(sections)) return badRequest("sections array required");

  const now = new Date().toISOString();
  let inserted = 0;

  for (const s of sections) {
    const sectionKey = s["sectionKey"] as string;
    const sectionId = `${organizationId}::${sectionKey}`;

    await env.DB_ANALYTICS.prepare(`
      INSERT OR IGNORE INTO report_sections
        (section_id, organization_id, section_key, title, subtitle, icon_name, content_type, content, sort_order, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      sectionId, organizationId, sectionKey,
      s["title"] as string,
      (s["subtitle"] as string | undefined) ?? null,
      (s["iconName"] as string | undefined) ?? null,
      s["contentType"] as string,
      JSON.stringify(s["content"]),
      (s["sortOrder"] as number | undefined) ?? 0,
      now, now,
    ).run();
    inserted++;
  }

  return created({ organizationId, inserted });
}

/* ─── POST /reports/snapshots ─── */
export async function handleCreateSnapshot(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  const organizationId = body["organizationId"] as string | undefined;
  const version = body["version"] as string | undefined;
  if (!organizationId || !version) return badRequest("organizationId and version required");

  // Fetch current sections
  const sectionsResult = await env.DB_ANALYTICS.prepare(
    "SELECT * FROM report_sections WHERE organization_id = ? ORDER BY sort_order ASC",
  ).bind(organizationId).all();
  const sections = (sectionsResult.results ?? []).map(mapSection);

  // Fetch current pipeline metrics
  const metricsResult = await env.DB_ANALYTICS.prepare(`
    SELECT SUM(documents_uploaded) as docs, SUM(policies_approved) as approved,
           SUM(policies_generated) as total_policies, SUM(skills_packaged) as skills
    FROM pipeline_metrics WHERE organization_id = ?
  `).bind(organizationId).first();

  const snapshotId = `${organizationId}::${version}`;
  const now = new Date().toISOString();

  await env.DB_ANALYTICS.prepare(`
    INSERT INTO report_snapshots (snapshot_id, organization_id, version, title, sections_json, metrics_json, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, version) DO UPDATE SET
      title = excluded.title, sections_json = excluded.sections_json,
      metrics_json = excluded.metrics_json, notes = excluded.notes
  `).bind(
    snapshotId, organizationId, version,
    (body["title"] as string | undefined) ?? null,
    JSON.stringify(sections),
    JSON.stringify(metricsResult ?? {}),
    (body["notes"] as string | undefined) ?? null,
    now,
  ).run();

  return created({ snapshotId, version, organizationId, sectionCount: sections.length });
}

/* ─── GET /reports/snapshots ─── */
export async function handleListSnapshots(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  if (!organizationId) return badRequest("organizationId query param required");

  const result = await env.DB_ANALYTICS.prepare(
    "SELECT snapshot_id, organization_id, version, title, notes, created_at FROM report_snapshots WHERE organization_id = ? ORDER BY created_at DESC",
  ).bind(organizationId).all();

  const snapshots = (result.results ?? []).map((r) => ({
    snapshotId: r["snapshot_id"] as string,
    organizationId: r["organization_id"] as string,
    version: r["version"] as string,
    title: r["title"] as string | null,
    notes: r["notes"] as string | null,
    createdAt: r["created_at"] as string,
  }));

  return ok({ organizationId, snapshots });
}

/* ─── GET /reports/snapshots/:version ─── */
export async function handleGetSnapshot(request: Request, env: Env, version: string): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  if (!organizationId) return badRequest("organizationId query param required");

  const row = await env.DB_ANALYTICS.prepare(
    "SELECT * FROM report_snapshots WHERE organization_id = ? AND version = ?",
  ).bind(organizationId, version).first();

  if (!row) return notFound("snapshot", `${organizationId}/${version}`);

  const snapshot: ReportSnapshot = {
    snapshotId: row["snapshot_id"] as string,
    organizationId: row["organization_id"] as string,
    version: row["version"] as string,
    title: row["title"] as string | null,
    sectionsJson: JSON.parse(row["sections_json"] as string),
    metricsJson: row["metrics_json"] ? JSON.parse(row["metrics_json"] as string) : null,
    notes: row["notes"] as string | null,
    createdAt: row["created_at"] as string,
  };

  return ok(snapshot);
}

/* ─── GET /reports/export/markdown ─── */
export async function handleExportMarkdown(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  if (!organizationId) return badRequest("organizationId query param required");

  // Optional: export from snapshot version
  const version = url.searchParams.get("version");

  let sections: ReportSection[];

  if (version) {
    const row = await env.DB_ANALYTICS.prepare(
      "SELECT sections_json FROM report_snapshots WHERE organization_id = ? AND version = ?",
    ).bind(organizationId, version).first();
    if (!row) return notFound("snapshot", `${organizationId}/${version}`);
    sections = JSON.parse(row["sections_json"] as string) as ReportSection[];
  } else {
    const result = await env.DB_ANALYTICS.prepare(
      "SELECT * FROM report_sections WHERE organization_id = ? ORDER BY sort_order ASC",
    ).bind(organizationId).all();
    sections = (result.results ?? []).map(mapSection);
  }

  const md = generateMarkdown(organizationId, sections, version);

  return new Response(md, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${organizationId}-report${version ? `-${version}` : ""}.md"`,
    },
  });
}

/* ─── Helpers ─── */
function mapSection(r: Record<string, unknown>): ReportSection {
  return {
    sectionId: r["section_id"] as string,
    organizationId: r["organization_id"] as string,
    sectionKey: r["section_key"] as string,
    title: r["title"] as string,
    subtitle: r["subtitle"] as string | null,
    iconName: r["icon_name"] as string | null,
    contentType: r["content_type"] as string,
    content: JSON.parse(r["content"] as string),
    sortOrder: r["sort_order"] as number,
    updatedAt: r["updated_at"] as string,
    createdAt: r["created_at"] as string,
  };
}

function generateMarkdown(orgId: string, sections: ReportSection[], version?: string | null): string {
  const lines: string[] = [];
  const date = new Date().toISOString().split("T")[0];

  lines.push(`# ${orgId} 분석 보고서${version ? ` (${version})` : ""}`);
  lines.push(`> 생성일: ${date}`);
  lines.push("");

  for (const s of sections) {
    lines.push(`## ${s.title}`);
    if (s.subtitle) lines.push(`> ${s.subtitle}`);
    lines.push("");

    const content = s.content as Record<string, unknown>;
    renderContentToMd(lines, s.contentType, content);
  }

  return lines.join("\n");
}

/** Render any content block to markdown lines (defensive: null-safe) */
function renderContentToMd(lines: string[], contentType: string, content: Record<string, unknown>): void {
  switch (contentType) {
    case "evaluation_table":
    case "data_table":
    case "comparison_table": {
      const headers = content["headers"] as string[] | undefined;
      const rows = content["rows"] as string[][] | undefined;
      if (headers && rows) {
        lines.push(`| ${headers.join(" | ")} |`);
        lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
        for (const row of rows) { lines.push(`| ${row.join(" | ")} |`); }
        lines.push("");
      }
      // Handle nested sub-tables (e.g., { data_table: {...}, comparison_table: {...} })
      for (const [k, v] of Object.entries(content)) {
        if (k === "headers" || k === "rows" || k === "highlightCol" || k === "title") continue;
        if (v && typeof v === "object" && "headers" in (v as object)) {
          const sub = v as Record<string, unknown>;
          if (sub["title"]) lines.push(`### ${sub["title"] as string}`);
          renderContentToMd(lines, "data_table", sub);
        }
      }
      break;
    }
    case "finding_cards": {
      const cards = content["cards"] as Array<{ title: string; items: string[] }> | undefined;
      if (cards) {
        for (const card of cards) {
          lines.push(`### ${card.title}`);
          for (const item of card.items) { lines.push(`- ${item}`); }
          lines.push("");
        }
      }
      // Handle nested data_table/text_block
      for (const [k, v] of Object.entries(content)) {
        if (k === "cards") continue;
        if (v && typeof v === "object") {
          renderContentToMd(lines, k, v as Record<string, unknown>);
        }
      }
      break;
    }
    case "metric_grid": {
      const metrics = content["metrics"] as Array<{ label: string; value: string; sub?: string }> | undefined;
      if (metrics) {
        lines.push("| 지표 | 값 | 비고 |");
        lines.push("| --- | --- | --- |");
        for (const m of metrics) { lines.push(`| ${m.label} | ${m.value} | ${m.sub ?? ""} |`); }
        lines.push("");
      }
      // Handle nested text_block/data_table
      for (const [k, v] of Object.entries(content)) {
        if (k === "metrics") continue;
        if (v && typeof v === "object") {
          renderContentToMd(lines, k, v as Record<string, unknown>);
        }
      }
      break;
    }
    case "task_list": {
      const tasks = content["tasks"] as Array<{ priority: string; title: string; description: string; status: string }> | undefined;
      if (!tasks) break;
      for (const t of tasks) {
        const badge = t.priority === "high" ? "🔴" : t.priority === "medium" ? "🟡" : "🟢";
        lines.push(`- ${badge} **${t.title}** (${t.status}) — ${t.description}`);
      }
      lines.push("");
      break;
    }
    case "policy_examples": {
      const notice = content["notice"] as string | undefined;
      if (notice) { lines.push(`> ⚠️ ${notice}`); lines.push(""); }
      const policies = content["policies"] as Array<{ code: string; title: string; description: string }> | undefined;
      if (policies) {
        for (const p of policies) { lines.push(`- **\`${p.code}\`** ${p.title} — ${p.description}`); }
        lines.push("");
      }
      break;
    }
    case "text_block": {
      // Handle both { blocks: [{label, paragraphs}] } and { paragraphs: [{label, text}] }
      const blocks = content["blocks"] as Array<{ label?: string; paragraphs: string[] }> | undefined;
      if (blocks) {
        for (const b of blocks) {
          if (b.label) lines.push(`### ${b.label}`);
          for (const p of b.paragraphs) { lines.push(p); lines.push(""); }
        }
      }
      const paragraphs = content["paragraphs"] as Array<{ label?: string; text: string }> | undefined;
      if (paragraphs) {
        for (const p of paragraphs) {
          if (p.label) lines.push(`**${p.label}** `);
          lines.push(p.text);
          lines.push("");
        }
      }
      break;
    }
    case "framing_block": {
      // Handle both { text: "..." } and { framing: { text: "..." } }
      let text = content["text"] as string | undefined;
      if (!text) {
        const framing = content["framing"] as { text?: string; label?: string } | undefined;
        if (framing) {
          if (framing.label) lines.push(`**${framing.label}**`);
          text = framing.text;
        }
      }
      if (text) { lines.push(text); lines.push(""); }
      // Handle nested evaluation_table
      if (content["evaluation_table"]) {
        const sub = content["evaluation_table"] as Record<string, unknown>;
        if (sub["title"]) lines.push(`### ${sub["title"] as string}`);
        renderContentToMd(lines, "evaluation_table", sub);
      }
      break;
    }
  }
}
