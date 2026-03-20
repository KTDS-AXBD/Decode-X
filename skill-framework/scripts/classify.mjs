/**
 * classify.mjs — Skill auto-classification utility
 *
 * Shared by scan.mjs (--auto-classify) and lint.mjs (--fix).
 * Matches skill text against keyword maps to determine category.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Classify a skill by matching keywords against its text fields.
 * @param {{ id?: string, name?: string, description?: string, tags?: string[] }} skill
 * @param {Record<string, { keywords: string[], weight: number }>} keywordsMap
 * @returns {{ category: string, confidence: number }}
 */
export function classifyByKeywords(skill, keywordsMap) {
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

  // Find the winning category's total keywords for confidence calc
  const winnerKeywords = keywordsMap[bestCategory]?.keywords || [];
  const rawConfidence = bestScore / (winnerKeywords.length * 0.3);
  const confidence = Math.round(Math.min(rawConfidence, 1.0) * 100) / 100;

  return { category: bestCategory, confidence };
}

/**
 * Load classify-keywords.json from project root.
 * @param {string} basePath — project root directory
 * @returns {Record<string, { keywords: string[], weight: number }>}
 */
export function loadKeywordsMap(basePath) {
  const p = resolve(basePath, 'skill-framework/data/classify-keywords.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}
