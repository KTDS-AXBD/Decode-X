#!/usr/bin/env node

/**
 * lint.mjs — Skill Framework Quality Linter
 *
 * Reads skill-catalog.json and checks each skill file against lint rules.
 * Plugin-scope skills are excluded (external plugins).
 *
 * Usage:
 *   node skill-framework/scripts/lint.mjs [--scope user|project|all] [--severity error|warning|all]
 *
 * Defaults:
 *   --scope all  --severity all
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';

// ── CLI args ────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    input:    { type: 'string', default: 'skill-framework/data/skill-catalog.json' },
    rules:    { type: 'string', default: 'skill-framework/data/lint-rules.json' },
    scope:    { type: 'string', default: 'all' },
    severity: { type: 'string', default: 'all' },
  },
  strict: false,
});

const inputPath = resolve(values.input);
const rulesPath = resolve(values.rules);
const scopeFilter    = values.scope;     // 'user' | 'project' | 'all'
const severityFilter = values.severity;  // 'error' | 'warning' | 'all'

// ── Load catalog & rules ────────────────────────────────────────────

let catalog;
try {
  catalog = JSON.parse(readFileSync(inputPath, 'utf-8'));
} catch (err) {
  console.error(`Error: Cannot read ${inputPath} — ${err.message}`);
  process.exit(1);
}

let lintRules;
try {
  lintRules = JSON.parse(readFileSync(rulesPath, 'utf-8'));
} catch (err) {
  console.error(`Error: Cannot read ${rulesPath} — ${err.message}`);
  process.exit(1);
}

const { skills = [] } = catalog;

// ── Filter skills to lint (exclude plugin scope) ────────────────────

let targetSkills = skills.filter(s => s.scope !== 'plugin');

if (scopeFilter !== 'all') {
  targetSkills = targetSkills.filter(s => s.scope === scopeFilter);
}

// ── Lint checks ─────────────────────────────────────────────────────

const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Detect hardcoded secret values: KEY="actualValue16+" or KEY='actualValue16+'
// Skip: $VAR, ${VAR}, $(command), wrangler secret, printf pipe
const SECRET_RE = /(?:API_KEY|SECRET|PASSWORD|TOKEN|CREDENTIAL)\s*[=:]\s*["'][A-Za-z0-9+/=_\-]{16,}["']/i;
const SECRET_EXCLUDE_RE = /\$\{?\w*(?:API_KEY|SECRET|PASSWORD|TOKEN|CREDENTIAL)|wrangler\s+secret|printf\s+.*\|\s*.*secret/i;
const TRIGGER_KEYWORDS = ['use when', 'triggers', 'trigger', '사용', 'use this', 'use proactively'];

/**
 * Read the actual skill file content (best effort).
 * Returns empty string if file not found.
 */
function readSkillFile(skill) {
  if (!skill.path) return '';
  try {
    const p = resolve(skill.path);
    return readFileSync(p, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Run all lint rules against a single skill.
 * @returns {{ ruleId: string, severity: string, message: string }[]}
 */
function lintSkill(skill, fileContent) {
  const issues = [];
  const ruleSet = new Set(lintRules.map(r => r.id));
  const ruleMap = Object.fromEntries(lintRules.map(r => [r.id, r]));

  // has-description
  if (ruleSet.has('has-description')) {
    if (!skill.description || skill.description.trim() === '') {
      issues.push(ruleMap['has-description']);
    }
  }

  // description-trigger
  if (ruleSet.has('description-trigger') && skill.description) {
    const descLower = skill.description.toLowerCase();
    const hasTrigger = TRIGGER_KEYWORDS.some(kw => descLower.includes(kw));
    if (!hasTrigger) {
      issues.push(ruleMap['description-trigger']);
    }
  }

  // has-gotchas
  if (ruleSet.has('has-gotchas') && fileContent) {
    const lower = fileContent.toLowerCase();
    if (!lower.includes('## gotchas') && !lower.includes('gotchas')) {
      issues.push(ruleMap['has-gotchas']);
    }
  }

  // folder-structure (only for type=skill)
  if (ruleSet.has('folder-structure') && skill.type === 'skill') {
    if (!skill.hasReferences && !skill.hasScripts) {
      issues.push(ruleMap['folder-structure']);
    }
  }

  // no-secrets
  if (ruleSet.has('no-secrets') && fileContent) {
    if (SECRET_RE.test(fileContent) && !SECRET_EXCLUDE_RE.test(fileContent)) {
      issues.push(ruleMap['no-secrets']);
    }
  }

  // single-category: skill should fit cleanly into one category
  if (ruleSet.has('single-category')) {
    if (!skill.category || skill.category === 'uncategorized') {
      issues.push(ruleMap['single-category']);
    }
  }

  // name-kebab
  if (ruleSet.has('name-kebab')) {
    // Allow colon-separated plugin IDs (e.g., bkit:pdca)
    const idPart = skill.id.includes(':') ? skill.id.split(':').pop() : skill.id;
    if (!KEBAB_RE.test(idPart)) {
      issues.push(ruleMap['name-kebab']);
    }
  }

  return issues;
}

// ── Run lint ────────────────────────────────────────────────────────

const allIssues = []; // { skillId, ruleId, severity, message }

for (const skill of targetSkills) {
  const content = readSkillFile(skill);
  const issues = lintSkill(skill, content);
  for (const issue of issues) {
    allIssues.push({
      skillId:  skill.id,
      ruleId:   issue.id,
      severity: issue.severity,
      message:  issue.message,
    });
  }
}

// ── Filter by severity ──────────────────────────────────────────────

let filtered = allIssues;
if (severityFilter !== 'all') {
  filtered = allIssues.filter(i => i.severity === severityFilter);
}

// ── Output ──────────────────────────────────────────────────────────

const SEVERITY_LABEL = {
  error:   'ERROR',
  warning: 'WARN ',
  info:    'INFO ',
};

console.log(`Skill Framework Lint — ${targetSkills.length} skills checked`);
console.log('');

// Sort: errors first, then warnings, then info
const severityOrder = { error: 0, warning: 1, info: 2 };
filtered.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

for (const issue of filtered) {
  const label = SEVERITY_LABEL[issue.severity] || issue.severity.toUpperCase();
  console.log(`${label}  ${issue.skillId}: ${issue.ruleId} — ${issue.message}`);
}

const errors   = filtered.filter(i => i.severity === 'error').length;
const warnings = filtered.filter(i => i.severity === 'warning').length;
const infos    = filtered.filter(i => i.severity === 'info').length;

console.log('');
console.log(`Summary: ${errors} errors, ${warnings} warnings, ${infos} info`);

// Exit with error code if any errors found
if (errors > 0) {
  process.exit(1);
}
