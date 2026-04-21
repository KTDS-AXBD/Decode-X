#!/usr/bin/env tsx
/**
 * F362 Sprint 219: spec-container → skills D1 packaging pipeline
 *
 * Usage:
 *   tsx scripts/package-spec-containers.ts [--org lpon] [--dry-run] [--url http://localhost:8787]
 *
 * Reads .decode-x/spec-containers/*\/ directories, converts to SpecContainerInput JSON,
 * then calls POST /skills/from-spec-container on svc-skill.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, basename } from "path";

// ── CLI args ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const orgFilter = args.find((a, i) => args[i - 1] === "--org") ?? "lpon";
const baseUrl =
  args.find((a, i) => args[i - 1] === "--url") ??
  process.env["SKILL_API_URL"] ??
  "http://localhost:8787";
const internalSecret =
  process.env["INTERNAL_API_SECRET"] ?? "dev-secret";

const SPEC_CONTAINERS_DIR = join(process.cwd(), ".decode-x/spec-containers");

// ── YAML parser (line-based, covers provenance.yaml subset) ─────────

function parseSimpleYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split("\n");
  let currentKey = "";
  let inList = false;
  const listBuffer: unknown[] = [];

  for (const line of lines) {
    if (line.startsWith("#") || line.trim() === "") continue;

    const listItemMatch = line.match(/^  - (.+)$/);
    if (listItemMatch && inList) {
      const item = listItemMatch[1]!.trim();
      // nested object items (key: value pairs) not supported — treat as string
      if (item.includes(":")) {
        const nested: Record<string, unknown> = {};
        const [k, ...v] = item.split(":");
        if (k) nested[k.trim()] = v.join(":").trim().replace(/^"|"$/g, "");
        listBuffer.push(nested);
      } else {
        listBuffer.push(item.replace(/^"|"$/g, ""));
      }
      continue;
    }

    if (inList) {
      result[currentKey] = listBuffer.splice(0);
      inList = false;
    }

    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1]!;
    const value = kvMatch[2]!.trim();

    if (value === "" || value === "|") {
      currentKey = key;
      inList = true;
    } else {
      result[key] = value.replace(/^"|"$/g, "");
    }
  }

  if (inList && listBuffer.length > 0) {
    result[currentKey] = listBuffer;
  }

  return result;
}

// ── Rules markdown parser (BP-NNN table rows) ────────────────────────

interface RawPolicy {
  code: string;
  title: string;
  condition: string;
  criteria: string;
  outcome: string;
  confidence: number;
}

function parseRulesMarkdown(content: string): RawPolicy[] {
  const policies: RawPolicy[] = [];
  const tableRowRe = /^\|\s*(BP-\d{3})\s*\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]*)\|/;

  for (const line of content.split("\n")) {
    const m = line.match(tableRowRe);
    if (!m) continue;
    const [, code, title, condition, criteria, outcome] = m;
    if (!code || !title || !condition || !criteria || !outcome) continue;
    policies.push({
      code: code.trim(),
      title: title.trim(),
      condition: condition.trim(),
      criteria: criteria.trim(),
      outcome: outcome.trim(),
      confidence: 0.8,
    });
  }

  return policies;
}

// ── Test scenario YAML parser ────────────────────────────────────────

interface TestScenario {
  id: string;
  name: string;
}

function parseTestScenarios(content: string): TestScenario[] {
  const scenarios: TestScenario[] = [];
  const lines = content.split("\n");
  let currentId = "";
  let currentName = "";

  for (const line of lines) {
    const idMatch = line.match(/^\s+- id:\s*(.+)$/);
    if (idMatch) {
      if (currentId) scenarios.push({ id: currentId, name: currentName });
      currentId = idMatch[1]!.trim();
      currentName = "";
      continue;
    }
    const nameMatch = line.match(/^\s+name:\s*(.+)$/);
    if (nameMatch && currentId) {
      currentName = nameMatch[1]!.trim();
    }
  }
  if (currentId) scenarios.push({ id: currentId, name: currentName });
  return scenarios;
}

// ── Spec Container reader ────────────────────────────────────────────

interface SpecContainerInput {
  specContainerId: string;
  orgId: string;
  provenance: {
    skillId: string;
    extractedAt: string;
    extractedBy: string;
    sources: Array<{ type: "reverse-engineering" | "inference"; confidence: number; path?: string }>;
  };
  policies: RawPolicy[];
  testScenarios: TestScenario[];
  domain: string;
  subdomain?: string;
  version: string;
  author: string;
  tags: string[];
}

function readSpecContainer(dir: string, orgId: string): SpecContainerInput | null {
  const containerId = basename(dir);
  const provenancePath = join(dir, "provenance.yaml");

  if (!existsSync(provenancePath)) {
    console.warn(`  ⚠ provenance.yaml not found in ${containerId}, skipping`);
    return null;
  }

  const provenanceRaw = parseSimpleYaml(readFileSync(provenancePath, "utf-8"));
  const skillId = String(provenanceRaw["skillId"] ?? containerId);
  const extractedAt = String(provenanceRaw["extractedAt"] ?? new Date().toISOString());
  const extractedBy = String(provenanceRaw["extractedBy"] ?? "Decode-X");

  // Parse sources
  const sourcesRaw = provenanceRaw["sources"];
  const sources: SpecContainerInput["provenance"]["sources"] = Array.isArray(sourcesRaw)
    ? sourcesRaw.map((s) => {
        const src = s as Record<string, unknown>;
        return {
          type: (src["type"] === "inference" ? "inference" : "reverse-engineering") as
            | "reverse-engineering"
            | "inference",
          confidence: Number(src["confidence"] ?? 0.75),
          ...(src["path"] ? { path: String(src["path"]) } : {}),
        };
      })
    : [{ type: "reverse-engineering" as const, confidence: 0.75 }];

  // Parse rules
  const rulesDir = join(dir, "rules");
  const policies: RawPolicy[] = [];
  if (existsSync(rulesDir)) {
    for (const f of readdirSync(rulesDir).filter((f) => f.endsWith(".md"))) {
      const content = readFileSync(join(rulesDir, f), "utf-8");
      policies.push(...parseRulesMarkdown(content));
    }
  }

  if (policies.length === 0) {
    console.warn(`  ⚠ No policies parsed from rules/ in ${containerId}, skipping`);
    return null;
  }

  // Parse test scenarios
  const testsDir = join(dir, "tests");
  const testScenarios: TestScenario[] = [];
  if (existsSync(testsDir)) {
    for (const f of readdirSync(testsDir).filter((f) => f.endsWith(".yaml"))) {
      const content = readFileSync(join(testsDir, f), "utf-8");
      testScenarios.push(...parseTestScenarios(content));
    }
  }

  // Derive domain from containerId (e.g. "lpon-purchase" → "LPON")
  const parts = containerId.split("-");
  const domain = (parts[0] ?? "UNKNOWN").toUpperCase();
  const subdomain = parts.slice(1).join("-").toUpperCase() || undefined;

  return {
    specContainerId: containerId,
    orgId,
    provenance: { skillId, extractedAt, extractedBy, sources },
    policies,
    testScenarios,
    domain,
    ...(subdomain ? { subdomain } : {}),
    version: "1.0.0",
    author: "Decode-X spec-container-import",
    tags: [containerId, domain.toLowerCase()],
  };
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(SPEC_CONTAINERS_DIR)) {
    console.error(`❌ spec-containers directory not found: ${SPEC_CONTAINERS_DIR}`);
    process.exit(1);
  }

  const dirs = readdirSync(SPEC_CONTAINERS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(SPEC_CONTAINERS_DIR, d.name));

  console.log(`\n📦 Spec Container Packaging — ${dirs.length} directories found`);
  console.log(`   org: ${orgFilter} | dry-run: ${isDryRun} | url: ${baseUrl}\n`);

  const results: { id: string; status: "ok" | "skip" | "error"; detail?: string }[] = [];

  for (const dir of dirs) {
    const containerId = basename(dir);
    process.stdout.write(`  Processing ${containerId}... `);

    const input = readSpecContainer(dir, orgFilter);
    if (!input) {
      results.push({ id: containerId, status: "skip", detail: "parse failed" });
      continue;
    }

    if (isDryRun) {
      console.log(`[dry-run] ${input.policies.length} policies, ${input.testScenarios.length} tests`);
      results.push({ id: containerId, status: "ok", detail: "dry-run" });
      continue;
    }

    try {
      const res = await fetch(`${baseUrl}/skills/from-spec-container`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": internalSecret,
        },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.log(`❌ HTTP ${res.status}`);
        results.push({ id: containerId, status: "error", detail: `HTTP ${res.status}: ${body.slice(0, 100)}` });
      } else {
        const body = await res.json<{ data?: { skillId?: string } }>().catch(() => ({}));
        const skillId = body?.data?.skillId ?? "?";
        console.log(`✅ skillId=${skillId}`);
        results.push({ id: containerId, status: "ok", detail: skillId });
      }
    } catch (e) {
      console.log(`❌ ${e instanceof Error ? e.message : String(e)}`);
      results.push({ id: containerId, status: "error", detail: String(e) });
    }
  }

  // Summary
  const ok = results.filter((r) => r.status === "ok").length;
  const skip = results.filter((r) => r.status === "skip").length;
  const error = results.filter((r) => r.status === "error").length;
  console.log(`\n📊 Summary: ✅ ${ok} ok | ⚠ ${skip} skip | ❌ ${error} error`);

  if (error > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
