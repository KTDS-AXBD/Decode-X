#!/usr/bin/env node

/**
 * catalog.mjs — Skill Catalog Markdown Generator
 *
 * Reads skill-catalog.json and generates skill-catalog.md (human-readable catalog).
 *
 * Usage:
 *   node skill-framework/scripts/catalog.mjs [--input path] [--output path]
 *
 * Defaults:
 *   --input  skill-framework/data/skill-catalog.json
 *   --output skill-framework/docs/skill-catalog.md
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

// ── CLI args ────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    input:  { type: 'string', default: 'skill-framework/data/skill-catalog.json' },
    output: { type: 'string', default: 'skill-framework/docs/skill-catalog.md' },
  },
  strict: false,
});

const inputPath  = resolve(values.input);
const outputPath = resolve(values.output);

// ── Load catalog ────────────────────────────────────────────────────

let catalog;
try {
  catalog = JSON.parse(readFileSync(inputPath, 'utf-8'));
} catch (err) {
  console.error(`Error: Cannot read ${inputPath} — ${err.message}`);
  process.exit(1);
}

const { categories = [], skills = [] } = catalog;

// ── Build category lookup (preserving order from categories array) ──

/** @type {Map<string, { def: object, skills: object[] }>} */
const categoryMap = new Map();

for (const cat of categories) {
  categoryMap.set(cat.id, { def: cat, skills: [] });
}

// Ensure 'uncategorized' bucket exists at the end
if (!categoryMap.has('uncategorized')) {
  categoryMap.set('uncategorized', {
    def: { id: 'uncategorized', name: 'Uncategorized', nameKo: '미분류', description: '' },
    skills: [],
  });
}

for (const skill of skills) {
  const catId = skill.category || 'uncategorized';
  if (!categoryMap.has(catId)) {
    // Unknown category — put in uncategorized
    categoryMap.get('uncategorized').skills.push(skill);
  } else {
    categoryMap.get(catId).skills.push(skill);
  }
}

// ── Quality bar helper ──────────────────────────────────────────────

function qualityBar(score) {
  if (typeof score !== 'number') return '-';
  const filled = Math.round(score / 20);   // 0-5 blocks
  const empty  = 5 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty) + ` ${score}`;
}

// ── Generate Markdown ───────────────────────────────────────────────

const lines = [];
const totalSkills = skills.length;
const catCount = [...categoryMap.values()].filter(c => c.skills.length > 0).length;

lines.push('# Skill Catalog');
lines.push('');
lines.push(`> ${totalSkills} skills across ${catCount} categories. Auto-generated from skill-catalog.json.`);
lines.push('');

// ── Summary table ───────────────────────────────────────────────────

lines.push('## Summary');
lines.push('');
lines.push('| Category | Count | User | Project | Plugin |');
lines.push('|----------|:-----:|:----:|:-------:|:------:|');

for (const [, { def, skills: catSkills }] of categoryMap) {
  if (catSkills.length === 0) continue;
  const user    = catSkills.filter(s => s.scope === 'user').length;
  const project = catSkills.filter(s => s.scope === 'project').length;
  const plugin  = catSkills.filter(s => s.scope === 'plugin').length;
  lines.push(`| ${def.name} | ${catSkills.length} | ${user} | ${project} | ${plugin} |`);
}

lines.push('');

// ── Per-category sections ───────────────────────────────────────────

let sectionNum = 0;

for (const [catId, { def, skills: catSkills }] of categoryMap) {
  if (catSkills.length === 0) continue;

  sectionNum++;
  const heading = catId === 'uncategorized'
    ? `## Uncategorized (${catSkills.length})`
    : `## ${sectionNum}. ${def.name} (${catSkills.length})`;
  lines.push(heading);
  lines.push('');
  lines.push('| Skill | Scope | Description | Quality |');
  lines.push('|-------|-------|-------------|:-------:|');

  // Sort skills within category by name
  const sorted = [...catSkills].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

  for (const skill of sorted) {
    const desc = (skill.description || '').replace(/\|/g, '\\|').slice(0, 80);
    const q = qualityBar(skill.qualityScore);
    lines.push(`| ${skill.id} | ${skill.scope} | ${desc} | ${q} |`);
  }

  lines.push('');
}

// ── Write output ────────────────────────────────────────────────────

const md = lines.join('\n');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, md, 'utf-8');

console.log(`✅ Catalog generated: ${outputPath}`);
console.log(`   ${totalSkills} skills, ${catCount} categories`);
