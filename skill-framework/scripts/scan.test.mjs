/**
 * Unit tests for scan.mjs core functions
 * Run: node skill-framework/scripts/scan.test.mjs
 */

import { strictEqual, deepStrictEqual, ok } from 'node:assert';

// ── Extract functions from scan.mjs by re-implementing (scan.mjs has no exports) ──

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const yaml = match[1];
  const result = {};
  let currentKey = null;
  let currentValue = '';
  let isMultiline = false;

  for (const line of yaml.split('\n')) {
    if (isMultiline) {
      if (/^\s+/.test(line)) {
        currentValue += (currentValue ? '\n' : '') + line.replace(/^\s+/, '');
        continue;
      } else {
        if (currentKey) result[currentKey] = currentValue.trim();
        isMultiline = false;
        currentKey = null;
        currentValue = '';
      }
    }
    const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const rawValue = kvMatch[2].trim();
      if (rawValue === '|' || rawValue === '>') {
        isMultiline = true;
        currentValue = '';
      } else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        result[currentKey] = rawValue.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      } else if (rawValue === 'true') {
        result[currentKey] = true;
      } else if (rawValue === 'false') {
        result[currentKey] = false;
      } else if (rawValue === '') {
        result[currentKey] = '';
      } else {
        result[currentKey] = rawValue.replace(/^["']|["']$/g, '');
      }
    }
    if (/^\s+-\s+/.test(line) && currentKey) {
      const item = line.replace(/^\s+-\s+/, '').trim();
      if (!Array.isArray(result[currentKey])) result[currentKey] = [];
      result[currentKey].push(item);
    }
  }
  if (isMultiline && currentKey) result[currentKey] = currentValue.trim();
  return result;
}

function mergeSkills(scanned, existing) {
  if (!existing) return scanned;
  const existingMap = new Map();
  for (const skill of existing) existingMap.set(skill.id, skill);
  const scannedIds = new Set(scanned.map(s => s.id));
  const merged = scanned.map(skill => {
    const prev = existingMap.get(skill.id);
    if (prev) {
      return {
        ...skill,
        category: prev.category || skill.category,
        tags: prev.tags && prev.tags.length > 0 ? prev.tags : skill.tags,
        usageCount: prev.usageCount || 0,
        lastUsedAt: prev.lastUsedAt || null,
        addedAt: prev.addedAt || skill.addedAt,
        updatedAt: new Date().toISOString(),
      };
    }
    return skill;
  });
  for (const [id, prev] of existingMap) {
    if (!scannedIds.has(id)) {
      merged.push({ ...prev, deleted: true, updatedAt: new Date().toISOString() });
    }
  }
  return merged;
}

// ── Lint rule functions ──

const SECRET_RE = /(?:API_KEY|SECRET|PASSWORD|TOKEN|CREDENTIAL)\s*[=:]\s*["'][A-Za-z0-9+/=_\-]{16,}["']/i;
const SECRET_EXCLUDE_RE = /\$\{?\w*(?:API_KEY|SECRET|PASSWORD|TOKEN|CREDENTIAL)|wrangler\s+secret|printf\s+.*\|\s*.*secret/i;

// ── Tests ──

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
  }
}

console.log('');
console.log('🧪 Skill Framework Unit Tests');
console.log('═══════════════════════════════════════');
console.log('');

// ── parseFrontmatter tests ──
console.log('parseFrontmatter:');

test('parses simple key-value pairs', () => {
  const result = parseFrontmatter('---\nname: test-skill\ndescription: A test\n---\n# Content');
  strictEqual(result.name, 'test-skill');
  strictEqual(result.description, 'A test');
});

test('parses boolean values', () => {
  const result = parseFrontmatter('---\nuser-invocable: true\nenabled: false\n---');
  strictEqual(result['user-invocable'], true);
  strictEqual(result.enabled, false);
});

test('parses inline arrays', () => {
  const result = parseFrontmatter('---\ntags: [deploy, ci, cd]\n---');
  deepStrictEqual(result.tags, ['deploy', 'ci', 'cd']);
});

test('parses multiline scalar (|)', () => {
  const result = parseFrontmatter('---\ndescription: |\n  Line one\n  Line two\n---');
  ok(result.description.includes('Line one'));
  ok(result.description.includes('Line two'));
});

test('parses block sequence (- items)', () => {
  const result = parseFrontmatter('---\nallowed-tools:\n  - Read\n  - Write\n  - Bash\n---');
  deepStrictEqual(result['allowed-tools'], ['Read', 'Write', 'Bash']);
});

test('returns empty object for no frontmatter', () => {
  const result = parseFrontmatter('# Just a heading\nSome content');
  deepStrictEqual(result, {});
});

test('handles quoted strings', () => {
  const result = parseFrontmatter('---\nname: "my-skill"\ndesc: \'hello\'\n---');
  strictEqual(result.name, 'my-skill');
  strictEqual(result.desc, 'hello');
});

// ── mergeSkills tests ──
console.log('');
console.log('mergeSkills:');

test('preserves manual category from existing', () => {
  const scanned = [{ id: 'test', category: 'uncategorized', tags: [] }];
  const existing = [{ id: 'test', category: 'cicd-deployment', tags: ['deploy'] }];
  const merged = mergeSkills(scanned, existing);
  strictEqual(merged[0].category, 'cicd-deployment');
  deepStrictEqual(merged[0].tags, ['deploy']);
});

test('keeps new skill category if no existing', () => {
  const scanned = [{ id: 'new-skill', category: 'uncategorized', tags: [] }];
  const merged = mergeSkills(scanned, null);
  strictEqual(merged[0].category, 'uncategorized');
});

test('marks deleted skills', () => {
  const scanned = [{ id: 'alive', category: 'uncategorized', tags: [] }];
  const existing = [
    { id: 'alive', category: 'code-quality', tags: [] },
    { id: 'removed', category: 'runbooks', tags: [] },
  ];
  const merged = mergeSkills(scanned, existing);
  const removed = merged.find(s => s.id === 'removed');
  strictEqual(removed.deleted, true);
});

test('preserves usage metrics', () => {
  const scanned = [{ id: 'test', category: 'uncategorized', tags: [], usageCount: 0 }];
  const existing = [{ id: 'test', category: 'code-quality', tags: [], usageCount: 42, lastUsedAt: '2026-03-20' }];
  const merged = mergeSkills(scanned, existing);
  strictEqual(merged[0].usageCount, 42);
  strictEqual(merged[0].lastUsedAt, '2026-03-20');
});

// ── Lint rule tests ──
console.log('');
console.log('lint rules (SECRET_RE):');

test('detects hardcoded API key', () => {
  ok(SECRET_RE.test('API_KEY="sk-1234567890abcdef"'));
});

test('detects hardcoded password', () => {
  ok(SECRET_RE.test("PASSWORD: 'SuperSecretPass1234'"));
});

test('does NOT match short values (<16 chars)', () => {
  ok(!SECRET_RE.test('API_KEY="short"'));
});

test('does NOT match env var reference ($TOKEN)', () => {
  ok(!SECRET_RE.test('export TOKEN=$MY_TOKEN'));
});

test('SECRET_EXCLUDE_RE excludes $VAR patterns', () => {
  ok(SECRET_EXCLUDE_RE.test('${API_KEY}'));
  ok(SECRET_EXCLUDE_RE.test('$SECRET'));
});

test('SECRET_EXCLUDE_RE excludes wrangler secret', () => {
  ok(SECRET_EXCLUDE_RE.test('wrangler secret put MY_KEY'));
});

// ── Summary ──
console.log('');
console.log('═══════════════════════════════════════');
console.log(`Total: ${passed + failed} | ✅ ${passed} passed | ❌ ${failed} failed`);
console.log('═══════════════════════════════════════');

process.exit(failed > 0 ? 1 : 0);
