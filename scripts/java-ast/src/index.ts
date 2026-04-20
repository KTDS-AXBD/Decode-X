#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { runAnalysis } from "./runner.js";

function usage(): void {
  process.stderr.write(
    "Usage: java-ast --dir <java-src-dir> [--out <output.json>] [--project <name>] [--verbose]\n",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
let dir = "";
let out = "";
let project = "";
let verbose = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--dir") { dir = args[++i] ?? ""; }
  else if (arg === "--out") { out = args[++i] ?? ""; }
  else if (arg === "--project") { project = args[++i] ?? ""; }
  else if (arg === "--verbose") { verbose = true; }
  else if (arg === "--help" || arg === "-h") { usage(); }
}

if (!dir) {
  process.stderr.write("Error: --dir is required\n");
  usage();
}

if (!fs.existsSync(dir)) {
  process.stderr.write(`Error: directory not found: ${dir}\n`);
  process.exit(1);
}

const projectName = project || path.basename(path.resolve(dir));

if (verbose) process.stderr.write(`Analyzing: ${dir} (project=${projectName})\n`);

const result = runAnalysis(dir, projectName, verbose);
const json = JSON.stringify(result, null, 2);

if (out) {
  fs.writeFileSync(out, json, "utf8");
  if (verbose) process.stderr.write(`Written: ${out}\n`);
} else {
  process.stdout.write(json + "\n");
}

if (verbose) {
  const s = result.stats;
  process.stderr.write(
    `Done: ${s.javaFiles} files → ${s.controllerCount} controllers, ${s.endpointCount} endpoints, ${s.dataModelCount} models, ${s.transactionCount} services\n`,
  );
}
