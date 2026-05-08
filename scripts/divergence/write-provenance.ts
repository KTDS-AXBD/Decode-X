/**
 * F430 (Sprint 263) — provenance.yaml auto-write CLI.
 *
 * detect-bl 결과 + manual provenance.yaml의 3-way 동기화:
 *   - manual=OPEN + auto=0   → status: RESOLVED 권고 (apply 시 적용)
 *   - manual=OPEN + auto≥1   → 일관 (no-op)
 *   - manual missing + auto≥1 → 신규 ABSENCE marker append
 *
 * 사용법:
 *   tsx scripts/divergence/write-provenance.ts --all-domains [--apply] [--verbose]
 *   tsx scripts/divergence/write-provenance.ts --container lpon-refund [--apply]
 *
 * 기본값: dry-run (변경 없이 diff만 출력). --apply 시에만 file write.
 * 변경이 발생하면 exit code 1 (CI gate 활용 가능, dry-run 모드 한정).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import {
  parseTypeScriptSource,
  parseRulesMarkdown,
  BL_DETECTOR_REGISTRY,
  detectUnderImplementation,
  parseExistingMarkers,
  updateMarkerStatus,
  appendDivergenceMarker,
  recomputeDivergenceSummary,
  DETECTOR_SUPPORTED_RULES,
} from "../../packages/utils/src/divergence/index.js";
import type { BLDivergenceMarker, BLRule } from "../../packages/types/src/index.js";
import { DOMAIN_MAP, findDomainMapping, type DomainMapping } from "./domain-source-map.js";

interface CliArgs {
  allDomains: boolean;
  container: string;
  apply: boolean;
  verbose: boolean;
  resolvedBy: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const out: CliArgs = {
    allDomains: false,
    container: "",
    apply: false,
    verbose: false,
    resolvedBy: "",
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--all-domains") out.allDomains = true;
    else if (a === "--container") out.container = args[++i] ?? "";
    else if (a === "--apply") out.apply = true;
    else if (a === "--verbose") out.verbose = true;
    else if (a === "--resolved-by") out.resolvedBy = args[++i] ?? "";
    else if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    }
  }
  if (!out.allDomains && !out.container) {
    process.stderr.write("Error: --all-domains or --container <name> required\n");
    printUsage();
    process.exit(1);
  }
  return out;
}

function printUsage(): void {
  process.stderr.write(
    `Usage:
  tsx scripts/divergence/write-provenance.ts \\
    {--all-domains | --container <name>} \\
    [--apply] [--verbose] [--resolved-by "<context>"]

Options:
  --resolved-by  status OPEN→RESOLVED 자동 전환 시 resolvedBy/resolvedAt 메타필드 추가 (F447 Sprint 281)
                 default 메시지 사용 시: "Detector auto-detected (write-provenance --apply)"
                 explicit 권장: --resolved-by "F<N> Sprint <NUM> auto-detected (PRESENCE)"

Defaults to dry-run. --apply writes files. Exit 1 if dry-run finds changes.
`,
  );
}

interface DomainPlan {
  container: string;
  provenancePath: string;
  statusUpdates: Array<{ ruleId: string; from: "OPEN" | "RESOLVED"; to: "OPEN" | "RESOLVED" }>;
  appends: BLDivergenceMarker[];
  summaryRecomputed: boolean;
  beforeYaml: string;
  afterYaml: string;
}

function planDomain(mapping: DomainMapping, resolvedBy?: string): DomainPlan | null {
  if (!existsSync(mapping.provenancePath)) {
    return null;
  }
  const beforeYaml = readFileSync(mapping.provenancePath, "utf8");

  const rulesText = existsSync(mapping.rulesPath)
    ? readFileSync(mapping.rulesPath, "utf8")
    : "";
  const rules: BLRule[] = rulesText ? parseRulesMarkdown(rulesText) : [];

  const autoMarkers: BLDivergenceMarker[] = [];
  if (mapping.sourcePath && existsSync(mapping.sourcePath)) {
    const sf = parseTypeScriptSource(
      mapping.sourcePath,
      readFileSync(mapping.sourcePath, "utf8"),
    );
    for (const rule of rules) {
      const fn = BL_DETECTOR_REGISTRY[rule.id];
      if (!fn) continue;
      let markers: BLDivergenceMarker[];
      if (rule.id === "BL-027" && mapping.underImplTargets) {
        markers = detectUnderImplementation(sf, mapping.sourcePath, {
          targetFunctionNames: mapping.underImplTargets,
        });
      } else {
        markers = fn(sf, mapping.sourcePath);
      }
      autoMarkers.push(...markers);
    }
  }

  const existing = parseExistingMarkers(beforeYaml);
  const existingByRule = new Set(existing.map((e) => e.ruleId));
  const autoByRule = new Map<string, BLDivergenceMarker[]>();
  for (const m of autoMarkers) {
    const list = autoByRule.get(m.ruleId) ?? [];
    list.push(m);
    autoByRule.set(m.ruleId, list);
  }

  const statusUpdates: DomainPlan["statusUpdates"] = [];
  for (const ex of existing) {
    if (!DETECTOR_SUPPORTED_RULES.has(ex.ruleId)) continue;
    const autoCount = autoByRule.get(ex.ruleId)?.length ?? 0;
    if (ex.status === "OPEN" && autoCount === 0) {
      statusUpdates.push({ ruleId: ex.ruleId, from: "OPEN", to: "RESOLVED" });
    }
    if (ex.status === "RESOLVED" && autoCount > 0) {
      statusUpdates.push({ ruleId: ex.ruleId, from: "RESOLVED", to: "OPEN" });
    }
  }

  const appends: BLDivergenceMarker[] = [];
  for (const [ruleId, markers] of autoByRule.entries()) {
    if (existingByRule.has(ruleId)) continue;
    const first = markers[0];
    if (first) appends.push(first);
  }

  let working = beforeYaml;
  for (const upd of statusUpdates) {
    // F447 (Sprint 281): OPEN → RESOLVED 자동 전환 시 resolvedBy/At 추가 (resolvedBy 옵션 있을 때만)
    const opts =
      upd.to === "RESOLVED" && resolvedBy
        ? { resolvedBy }
        : undefined;
    const r = updateMarkerStatus(working, upd.ruleId, upd.to, opts);
    working = r.text;
  }
  for (const m of appends) {
    const r = appendDivergenceMarker(working, m);
    working = r.text;
  }
  const sum = recomputeDivergenceSummary(working);
  working = sum.text;

  return {
    container: mapping.container,
    provenancePath: mapping.provenancePath,
    statusUpdates,
    appends,
    summaryRecomputed: sum.changed,
    beforeYaml,
    afterYaml: working,
  };
}

function summarizePlan(plan: DomainPlan): string {
  const lines: string[] = [];
  lines.push(`  ${plan.container}:`);
  if (plan.statusUpdates.length === 0 && plan.appends.length === 0 && !plan.summaryRecomputed) {
    lines.push(`    no changes`);
    return lines.join("\n");
  }
  for (const u of plan.statusUpdates) {
    lines.push(`    status: ${u.ruleId} ${u.from} → ${u.to}`);
  }
  for (const m of plan.appends) {
    lines.push(`    append:  ${m.ruleId} (severity=${m.severity}, pattern=${m.pattern})`);
  }
  if (plan.summaryRecomputed) lines.push(`    summary: recomputed`);
  return lines.join("\n");
}

function emitDiffPreview(plan: DomainPlan, verbose: boolean): void {
  if (!verbose) return;
  if (plan.beforeYaml === plan.afterYaml) return;
  const beforeLines = plan.beforeYaml.split("\n");
  const afterLines = plan.afterYaml.split("\n");
  process.stdout.write(`\n  --- ${plan.container} (before/after lengths: ${beforeLines.length}/${afterLines.length}) ---\n`);
}

function main(): void {
  const args = parseArgs();
  const targets: DomainMapping[] = args.allDomains
    ? DOMAIN_MAP
    : ((): DomainMapping[] => {
        const m = findDomainMapping(args.container);
        if (!m) {
          process.stderr.write(`Error: container "${args.container}" not found in DOMAIN_MAP\n`);
          process.exit(1);
        }
        return [m];
      })();

  // F447 (Sprint 281): default resolvedBy 메시지 (explicit --resolved-by 미지정 시)
  const effectiveResolvedBy =
    args.resolvedBy ||
    (args.apply ? "Detector auto-detected (write-provenance --apply)" : "");

  const plans: DomainPlan[] = [];
  for (const t of targets) {
    const p = planDomain(t, effectiveResolvedBy);
    if (p) plans.push(p);
    else process.stdout.write(`  ${t.container}: provenance.yaml missing — skip\n`);
  }

  process.stdout.write(`=== provenance-writer ${args.apply ? "(APPLY)" : "(dry-run)"} ===\n`);
  let totalChanges = 0;
  for (const p of plans) {
    process.stdout.write(summarizePlan(p) + "\n");
    emitDiffPreview(p, args.verbose);
    if (p.beforeYaml !== p.afterYaml) totalChanges++;
  }

  process.stdout.write(`\nSummary: ${totalChanges}/${plans.length} containers with changes\n`);

  if (args.apply) {
    let written = 0;
    for (const p of plans) {
      if (p.beforeYaml !== p.afterYaml) {
        writeFileSync(p.provenancePath, p.afterYaml, "utf8");
        written++;
        process.stdout.write(`  written: ${p.provenancePath}\n`);
      }
    }
    process.stdout.write(`\n[apply] ${written} files written\n`);
    process.exit(0);
  }

  process.exit(totalChanges > 0 ? 1 : 0);
}

main();
