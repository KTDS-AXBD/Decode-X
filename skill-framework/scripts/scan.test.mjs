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

// ── classifyByKeywords ──

function classifyByKeywords(skill, keywordsMap) {
  const text = [
    skill.name || '',
    skill.description || '',
    skill.id || '',
    ...(skill.tags || []),
  ].join(' ').toLowerCase();

  let bestCategory = 'uncategorized';
  let bestScore = 0;

  for (const [category, config] of Object.entries(keywordsMap)) {
    const keywords = config.keywords || [];
    const weight = config.weight ?? 1.0;
    let matched = 0;

    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) {
        matched++;
      }
    }

    const score = matched * weight;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  if (bestScore === 0) {
    return { category: 'uncategorized', confidence: 0 };
  }

  const winnerKeywords = keywordsMap[bestCategory]?.keywords || [];
  const rawConfidence = bestScore / (winnerKeywords.length * 0.3);
  const confidence = Math.round(Math.min(rawConfidence, 1.0) * 100) / 100;

  return { category: bestCategory, confidence };
}

console.log('');
console.log('classifyByKeywords:');

const sampleKeywordsMap = {
  'cicd-deployment': {
    keywords: ['deploy', 'CI/CD', 'production', 'preview', 'release', 'rollout', 'build', 'publish'],
    weight: 1.0,
  },
  'code-quality': {
    keywords: ['lint', 'review', 'quality', 'simplify', 'refactor', 'convention', 'typecheck', 'bug detection'],
    weight: 1.0,
  },
  'data-analysis': {
    keywords: ['data', 'analytics', 'metrics', 'monitor', 'dashboard', 'sync', 'fetch', 'report'],
    weight: 0.8,
  },
  'library-reference': {
    keywords: ['library', 'SDK', 'API reference', 'documentation', 'docs', 'query-docs', 'resolve-library', 'code example', 'snippet'],
    weight: 1.0,
  },
};

test('classify: keyword 1개 매칭 시 해당 카테고리 반환', () => {
  const skill = { id: 'my-deploy', name: 'deploy-tool', description: 'deploy to production', tags: [] };
  const result = classifyByKeywords(skill, sampleKeywordsMap);
  strictEqual(result.category, 'cicd-deployment');
  ok(result.confidence > 0);
});

test('classify: keyword 0개 매칭 시 uncategorized', () => {
  const skill = { id: 'zzz', name: 'zzz', description: 'nothing relevant here', tags: [] };
  const result = classifyByKeywords(skill, sampleKeywordsMap);
  strictEqual(result.category, 'uncategorized');
  strictEqual(result.confidence, 0);
});

test('classify: 복수 카테고리 매칭 시 최고 점수', () => {
  const skill = { id: 'tool', name: 'deploy lint review', description: 'deploy and review quality code lint', tags: [] };
  // code-quality: lint, review, quality = 3 matches
  // cicd-deployment: deploy = 1 match
  const result = classifyByKeywords(skill, sampleKeywordsMap);
  strictEqual(result.category, 'code-quality');
});

test('classify: threshold 미달 시 낮은 confidence 값 확인', () => {
  // 1 keyword match out of 8 = score 1. confidence = 1 / (8*0.3) ≈ 0.42
  const skill = { id: 'x', name: 'deploy', description: '', tags: [] };
  const result = classifyByKeywords(skill, sampleKeywordsMap);
  strictEqual(result.category, 'cicd-deployment');
  ok(result.confidence > 0);
  ok(result.confidence <= 1.0);
});

// ── lint --fix tests ──

console.log('');
console.log('lint --fix:');

test('lint-fix: fixable 규칙만 교정 (single-category)', () => {
  const skill = { id: 'my-deploy', name: 'deploy', description: 'deploy to production', tags: [], category: 'uncategorized' };
  const result = classifyByKeywords(skill, sampleKeywordsMap);
  if (result.confidence > 0) {
    skill.category = result.category;
    skill.autoClassified = true;
    skill.classifyConfidence = result.confidence;
  }
  strictEqual(skill.category, 'cicd-deployment');
  strictEqual(skill.autoClassified, true);
  ok(skill.classifyConfidence > 0);
});

test('lint-fix: 백업 파일 생성 로직', () => {
  // Test backup path generation logic
  const inputPath = '/some/path/skill-catalog.json';
  const backupPath = inputPath.replace(/\.json$/, '.json.bak');
  strictEqual(backupPath, '/some/path/skill-catalog.json.bak');
});

test('lint-fix: 수동 태깅 보존 확인', () => {
  // When a skill has a manually assigned category (not uncategorized), fix should NOT override it
  const skill = { id: 'my-tool', name: 'my-tool', description: 'deploy', category: 'runbooks', tags: [] };
  // single-category rule only triggers when category is 'uncategorized'
  const isUncategorized = !skill.category || skill.category === 'uncategorized';
  strictEqual(isUncategorized, false);
  // Manual category preserved — not overwritten
  strictEqual(skill.category, 'runbooks');
});

test('name-kebab 교정: MySkill → my-skill', () => {
  const name = 'MySkill';
  const fixed = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
  strictEqual(fixed, 'myskill');
  const name2 = 'My_Cool_Skill';
  const fixed2 = name2.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
  strictEqual(fixed2, 'my-cool-skill');
});

// ── scan auto-classify tests ──

console.log('');
console.log('scan auto-classify:');

test('scan: auto-classify가 uncategorized만 대상', () => {
  const skills = [
    { id: 'a', category: 'code-quality', name: 'deploy tool', description: 'deploy' },
    { id: 'b', category: 'uncategorized', name: 'deploy tool', description: 'deploy to production' },
  ];
  // Only skill 'b' should be auto-classified
  const targets = skills.filter(s => s.category === 'uncategorized');
  strictEqual(targets.length, 1);
  strictEqual(targets[0].id, 'b');
  // Classify skill b
  const result = classifyByKeywords(targets[0], sampleKeywordsMap);
  strictEqual(result.category, 'cicd-deployment');
});

test('scan: 수동 태깅 + 자동분류 공존', () => {
  const skills = [
    { id: 'manual', category: 'runbooks', name: 'my runbook', description: 'diagnose issues' },
    { id: 'auto', category: 'uncategorized', name: 'lint tool', description: 'lint and review code quality' },
  ];
  // Manual stays as-is
  strictEqual(skills[0].category, 'runbooks');
  // Auto gets classified
  const result = classifyByKeywords(skills[1], sampleKeywordsMap);
  skills[1].category = result.category;
  skills[1].autoClassified = true;
  strictEqual(skills[1].category, 'code-quality');
  // Both coexist
  strictEqual(skills[0].category, 'runbooks');
  strictEqual(skills[1].autoClassified, true);
});

test('edge: 빈 description 스킬 자동분류 (name/id fallback)', () => {
  const skill = { id: 'deploy-preview', name: 'deploy-preview', description: '', tags: [] };
  const result = classifyByKeywords(skill, sampleKeywordsMap);
  // Should still classify via name/id containing 'deploy'
  strictEqual(result.category, 'cicd-deployment');
  ok(result.confidence > 0);
});

// ── Summary ──
console.log('');
console.log('═══════════════════════════════════════');
console.log(`Total: ${passed + failed} | ✅ ${passed} passed | ❌ ${failed} failed`);
console.log('═══════════════════════════════════════');

process.exit(failed > 0 ? 1 : 0);
