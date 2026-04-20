#!/usr/bin/env node
/**
 * ERWin SQL DDL extractor — reads DDL from file or stdin, outputs ERD JSON.
 *
 * Usage:
 *   npx tsx scripts/erwin-extract/index.ts schema.sql
 *   cat schema.sql | npx tsx scripts/erwin-extract/index.ts
 */

import { readFileSync } from "node:fs";
import { parseErd } from "../../packages/utils/src/erd-parser.js";

function main(): void {
  let sql: string;

  const filePath = process.argv[2];
  if (filePath) {
    sql = readFileSync(filePath, "utf-8");
  } else {
    // Read from stdin
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () => {
      const input = Buffer.concat(chunks).toString("utf-8");
      output(input);
    });
    return;
  }

  output(sql);
}

function output(sql: string): void {
  const result = parseErd(sql);

  const summary = {
    entityCount: result.entities.length,
    relationCount: result.relations.length,
    warningCount: result.warnings.length,
  };

  console.log(JSON.stringify({ ...result, summary }, null, 2));

  if (result.warnings.length > 0) {
    console.error("\n⚠ Warnings:");
    result.warnings.forEach((w) => console.error(`  - ${w}`));
  }

  console.error(
    `\n✅ Parsed: ${summary.entityCount} entities, ${summary.relationCount} relations`
  );
}

main();
