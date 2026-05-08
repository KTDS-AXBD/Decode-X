#!/usr/bin/env tsx
/**
 * backfill-frontmatter.ts — TD-29 docs/ frontmatter 일괄 보강
 *
 * Usage:
 *   pnpm tsx scripts/gov/backfill-frontmatter.ts          # dry-run (default)
 *   pnpm tsx scripts/gov/backfill-frontmatter.ts --apply  # apply changes
 *   pnpm tsx scripts/gov/backfill-frontmatter.ts --verbose
 *   pnpm tsx scripts/gov/backfill-frontmatter.ts --json   # raw stats JSON output
 *
 * AIF-PLAN-070 / AIF-DSGN-069 / TD-29.
 *
 * 8 필드 추론:
 *   code: 파일명 prefix(F###/TD-##/sprint-N) → 디렉토리 type → AIF-DOC-{slug}
 *   title: 첫 H1 (30 lines 내)
 *   version: 1.0
 *   status: active
 *   category: CATEGORY_MAP 디렉토리 → 파일명 토큰 → general
 *   created: git log --diff-filter=A --format=%ad --date=short (최초 commit)
 *   updated: git log -1 --format=%ad --date=short
 *   author: git log --diff-filter=A --format=%an (최초 commit author)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import {
  inferTypeFromPath,
  isExempt,
  mapCategory,
} from "./CATEGORY_MAP.js";

export interface InferredFrontmatter {
  code: string;
  title: string;
  version: string;
  status: string;
  category: string;
  created: string;
  updated: string;
  author: string;
}

export interface ScanResult {
  total: number;
  hasFrontmatter: number;
  missing: string[];
  exempt: string[];
  willApply: Array<{ file: string; relPath: string; inferred: InferredFrontmatter }>;
}

const DEFAULT_DATE = "2026-05-08";
const DEFAULT_AUTHOR = "Sinclair Seo";

export function hasFrontmatter(filePath: string): boolean {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(8);
    const n = fs.readSync(fd, buf, 0, 8, 0);
    const head = buf.slice(0, n).toString("utf-8");
    return head.startsWith("---\n") || head.startsWith("---\r\n");
  } finally {
    fs.closeSync(fd);
  }
}

function gitLog(repoRoot: string, args: string[], relPath: string): string {
  try {
    const out = execFileSync("git", ["log", ...args, "--", relPath], {
      cwd: repoRoot,
      encoding: "utf-8",
    });
    return out.trim();
  } catch {
    return "";
  }
}

export function inferGitDates(
  filePath: string,
  repoRoot: string,
): { created: string; updated: string; author: string } {
  const rel = path.relative(repoRoot, filePath);

  // 최초 commit (added)
  const createdRaw = gitLog(
    repoRoot,
    ["--diff-filter=A", "--follow", "--format=%ad", "--date=short"],
    rel,
  );
  const created = createdRaw.split("\n").pop()?.trim() || "";

  // 마지막 commit
  const updated = gitLog(repoRoot, ["-1", "--format=%ad", "--date=short"], rel);

  // 최초 commit author
  const authorRaw = gitLog(
    repoRoot,
    ["--diff-filter=A", "--follow", "--format=%an"],
    rel,
  );
  const author = authorRaw.split("\n").pop()?.trim() || "";

  return {
    created: created || DEFAULT_DATE,
    updated: updated || DEFAULT_DATE,
    author: author || DEFAULT_AUTHOR,
  };
}

export function inferTitle(filePath: string, fallbackBase: string): string {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").slice(0, 30);
  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+?)\s*$/);
    if (h1 && h1[1]) return h1[1].trim();
  }
  return fallbackBase.replace(/[-_]+/g, " ").trim();
}

export function inferCode(filePath: string, repoRoot: string): string {
  const rel = path.relative(repoRoot, filePath);
  const base = path.basename(filePath, ".md");
  const docType = inferTypeFromPath(rel);

  // F### / F####
  const fMatch = base.match(/^(F\d{3,})/);
  if (fMatch) {
    const id = fMatch[1];
    if (docType === "DOC") return `AIF-DOC-${id}`;
    return `AIF-${docType}-${id}`;
  }

  // TD-##
  const tdMatch = base.match(/^(TD-\d+)/i);
  if (tdMatch && tdMatch[1]) return tdMatch[1].toUpperCase();

  // sprint-N
  const sprintMatch = base.match(/^sprint-(\d+)/i);
  if (sprintMatch && sprintMatch[1]) {
    if (docType === "DOC") return `AIF-DOC-S${sprintMatch[1]}`;
    return `AIF-${docType}-S${sprintMatch[1]}`;
  }

  // AIF-{TYPE}-{NNN} prefix이면 그대로 (trailing 부가 토큰은 버림)
  const aifMatch = base.match(/^(AIF-[A-Z]+-\d+)/);
  if (aifMatch && aifMatch[1]) return aifMatch[1];

  // fallback
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  return `AIF-${docType}-${slug}`;
}

export function inferFrontmatter(
  filePath: string,
  repoRoot: string,
): InferredFrontmatter {
  const rel = path.relative(repoRoot, filePath);
  const base = path.basename(filePath, ".md");
  const dates = inferGitDates(filePath, repoRoot);
  return {
    code: inferCode(filePath, repoRoot),
    title: inferTitle(filePath, base),
    version: "1.0",
    status: "active",
    category: mapCategory(rel),
    created: dates.created,
    updated: dates.updated,
    author: dates.author,
  };
}

export function renderFrontmatter(fm: InferredFrontmatter): string {
  const safeTitle = fm.title.replace(/"/g, '\\"');
  return `---
code: ${fm.code}
title: "${safeTitle}"
version: ${fm.version}
status: ${fm.status}
category: ${fm.category}
created: ${fm.created}
updated: ${fm.updated}
author: ${fm.author}
---

`;
}

export function prependFrontmatter(
  filePath: string,
  fm: InferredFrontmatter,
): void {
  const content = fs.readFileSync(filePath, "utf-8");
  const newContent = renderFrontmatter(fm) + content;
  fs.writeFileSync(filePath, newContent, "utf-8");
}

function walkMarkdown(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkMarkdown(full));
    else if (e.isFile() && e.name.endsWith(".md")) out.push(full);
  }
  return out;
}

export function scan(rootDirs: string[], repoRoot: string): ScanResult {
  const result: ScanResult = {
    total: 0,
    hasFrontmatter: 0,
    missing: [],
    exempt: [],
    willApply: [],
  };
  for (const dir of rootDirs) {
    const abs = path.resolve(repoRoot, dir);
    for (const file of walkMarkdown(abs)) {
      result.total++;
      const rel = path.relative(repoRoot, file);
      if (hasFrontmatter(file)) {
        result.hasFrontmatter++;
        continue;
      }
      if (isExempt(rel)) {
        result.exempt.push(rel);
        continue;
      }
      result.missing.push(rel);
      result.willApply.push({
        file,
        relPath: rel,
        inferred: inferFrontmatter(file, repoRoot),
      });
    }
  }
  return result;
}

function getRepoRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf-8",
  }).trim();
}

function main(): void {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const verbose = args.includes("--verbose");
  const json = args.includes("--json");

  const repoRoot = getRepoRoot();
  const result = scan(["docs"], repoRoot);

  if (json) {
    const summary = {
      total: result.total,
      hasFrontmatter: result.hasFrontmatter,
      exempt: result.exempt.length,
      missing: result.missing.length,
      mode: apply ? "apply" : "dry-run",
      categoryBreakdown: result.willApply.reduce<Record<string, number>>(
        (acc, w) => {
          const k = w.inferred.category;
          acc[k] = (acc[k] || 0) + 1;
          return acc;
        },
        {},
      ),
    };
    console.log(JSON.stringify(summary, null, 2));
    if (apply) {
      for (const { file, inferred } of result.willApply) {
        prependFrontmatter(file, inferred);
      }
    }
    return;
  }

  console.log(`📄 Total markdown: ${result.total}`);
  console.log(`✅ Has frontmatter: ${result.hasFrontmatter}`);
  console.log(`🚫 Exempt: ${result.exempt.length}`);
  console.log(`⚠️  Missing (will apply): ${result.missing.length}`);

  if (verbose || !apply) {
    console.log("\n=== Will apply (preview) ===");
    const preview = apply ? result.willApply : result.willApply.slice(0, 10);
    for (const { relPath, inferred } of preview) {
      console.log(`  ${relPath}`);
      console.log(
        `    code=${inferred.code}, category=${inferred.category}, created=${inferred.created}`,
      );
    }
    if (!apply && result.willApply.length > 10) {
      console.log(`  ... and ${result.willApply.length - 10} more`);
    }

    if (result.exempt.length > 0 && verbose) {
      console.log("\n=== Exempt (skipped) ===");
      for (const e of result.exempt.slice(0, 10)) console.log(`  ${e}`);
      if (result.exempt.length > 10) {
        console.log(`  ... and ${result.exempt.length - 10} more`);
      }
    }
  }

  if (!apply) {
    console.log("\n💡 Run with --apply to write frontmatter");
    return;
  }

  console.log("\n🔧 Applying...");
  for (const { file, inferred } of result.willApply) {
    prependFrontmatter(file, inferred);
  }
  console.log(`✅ Wrote frontmatter to ${result.willApply.length} files`);
}

// CLI 진입점
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(path.basename(process.argv[1] || ""));
if (isMain) {
  main();
}
