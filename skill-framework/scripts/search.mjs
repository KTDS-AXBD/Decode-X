#!/usr/bin/env node

/**
 * search.mjs — Skill Catalog CLI Search
 *
 * Searches skill-catalog.json by keyword, category, and scope.
 *
 * Usage:
 *   node skill-framework/scripts/search.mjs <query> [--category cat] [--scope scope] [--sort usage|name|quality]
 *
 * Defaults:
 *   --sort name
 *
 * Examples:
 *   node skill-framework/scripts/search.mjs deploy
 *   node skill-framework/scripts/search.mjs "" --category cicd-deployment
 *   node skill-framework/scripts/search.mjs auth --scope plugin --sort quality
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

// ── CLI args ────────────────────────────────────────────────────────

const { values, positionals } = parseArgs({
  options: {
    input:    { type: 'string', default: 'skill-framework/data/skill-catalog.json' },
    category: { type: 'string' },
    scope:    { type: 'string' },
    sort:     { type: 'string', default: 'name' },
  },
  allowPositionals: true,
  strict: false,
});

const query    = (positionals[0] || '').toLowerCase();
const catFilter   = values.category;
const scopeFilter = values.scope;
const sortBy      = values.sort;

// ── Load catalog ────────────────────────────────────────────────────

const inputPath = resolve(values.input);
let catalog;
try {
  catalog = JSON.parse(readFileSync(inputPath, 'utf-8'));
} catch (err) {
  console.error(`Error: Cannot read ${inputPath} — ${err.message}`);
  process.exit(1);
}

const { skills = [] } = catalog;

// ── Filter ──────────────────────────────────────────────────────────

let results = skills;

// 1. Keyword search across id, name, description, tags
if (query) {
  results = results.filter(s => {
    const haystack = [
      s.id,
      s.name,
      s.description,
      ...(s.tags || []),
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

// 2. Category filter
if (catFilter) {
  results = results.filter(s => s.category === catFilter);
}

// 3. Scope filter
if (scopeFilter) {
  results = results.filter(s => s.scope === scopeFilter);
}

// ── Sort ─────────────────────────────────────────────────────────────

const sortFns = {
  name:    (a, b) => (a.name || a.id).localeCompare(b.name || b.id),
  quality: (a, b) => (b.qualityScore || 0) - (a.qualityScore || 0),
  usage:   (a, b) => (b.usageCount || 0) - (a.usageCount || 0),
};

const sortFn = sortFns[sortBy] || sortFns.name;
results.sort(sortFn);

// ── Output ──────────────────────────────────────────────────────────

if (results.length === 0) {
  console.log('No skills found');
  process.exit(0);
}

const label = query ? `"${query}"` : 'all';
console.log(`🔍 Search: ${label} (${results.length} results)`);
console.log('');

for (let i = 0; i < results.length; i++) {
  const s = results[i];
  const score = typeof s.qualityScore === 'number' ? s.qualityScore : '-';
  const desc = (s.description || '').slice(0, 50);
  console.log(`${i + 1}. ${s.id} (${s.scope}, ${s.category || 'uncategorized'}) ★ ${score}`);
  console.log(`   ${desc}`);
}
