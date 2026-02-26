import type { MaskedToken, MaskResponse, PiiEntityType } from "@ai-foundry/types";
import { PII_PATTERNS } from "./patterns.js";

/** Generate a short random hex suffix for a token */
function randomHex(bytes = 4): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Strip PII_ prefix for compact token labels: PII_SSN → SSN */
function shortLabel(entityType: PiiEntityType): string {
  return entityType.replace(/^PII_/, "");
}

/**
 * Remove overlapping detections — first match by position wins (pattern priority order).
 */
function removeOverlaps(detections: DetectedPii[]): DetectedPii[] {
  // Sort by start position ascending, ties broken by end position (longer match wins)
  const sorted = [...detections].sort(
    (a, b) => a.start - b.start || b.end - a.end,
  );
  const result: DetectedPii[] = [];
  let lastEnd = -1;
  for (const d of sorted) {
    if (d.start >= lastEnd) {
      result.push(d);
      lastEnd = d.end;
    }
    // Skip overlapping / nested matches
  }
  return result;
}

/** SHA-256 hex digest of a string (for audit storage — not for reversal) */
async function sha256(value: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface DetectedPii {
  original: string;
  entityType: PiiEntityType;
  start: number;
  end: number;
  token: string;
}

/**
 * Find all PII occurrences in text, deduplicate by value, assign stable tokens.
 * Same value always gets the same token within a single tokenize() call.
 */
export function detectPii(text: string): DetectedPii[] {
  const valueToToken = new Map<string, string>();
  const results: DetectedPii[] = [];

  for (const { entityType, regex } of PII_PATTERNS) {
    // Reset lastIndex since regexes have `g` flag
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const original = match[0];
      const start = match.index;
      const end = start + original.length;

      // Stable token per unique value within this call
      let token = valueToToken.get(original);
      if (!token) {
        token = `[PII:${shortLabel(entityType)}:${randomHex(3)}]`;
        valueToToken.set(original, token);
      }

      results.push({ original, entityType, start, end, token });
    }
  }

  // Remove overlapping matches before returning
  const deduped = removeOverlaps(results);

  // Sort by position descending so we can replace without offset shifts
  deduped.sort((a, b) => b.start - a.start);

  return deduped;
}

/**
 * Replace all detected PII in text with tokens.
 * Returns the masked text and the list of replaced tokens.
 */
export function applyTokens(text: string, detections: DetectedPii[]): string {
  let masked = text;
  for (const { start, end, token } of detections) {
    masked = masked.slice(0, start) + token + masked.slice(end);
  }
  return masked;
}

/**
 * Full tokenize pipeline: detect → apply → build response shape.
 */
export async function tokenize(
  documentId: string,
  text: string,
  dataClassification: "confidential" | "internal" | "public",
  db: D1Database,
): Promise<MaskResponse> {
  if (dataClassification === "public") {
    return {
      documentId,
      maskedText: text,
      tokenCount: 0,
      tokens: [],
      dataClassification,
    };
  }

  const detections = detectPii(text);
  const maskedText = applyTokens(text, detections);

  // Build response tokens (sort by position ascending)
  const sortedDetections = [...detections].sort((a, b) => a.start - b.start);
  const tokens: MaskedToken[] = sortedDetections.map((d) => ({
    token: d.token,
    entityType: d.entityType,
    position: d.start,
  }));

  // Store in D1 for audit (original_hash only — irreversible by design)
  if (detections.length > 0) {
    await persistTokens(documentId, detections, db);
  }

  return {
    documentId,
    maskedText,
    tokenCount: detections.length,
    tokens,
    dataClassification,
  };
}

async function persistTokens(
  documentId: string,
  detections: DetectedPii[],
  db: D1Database,
): Promise<void> {
  const now = new Date().toISOString();
  // Deduplicate by token (same value → same token)
  const seen = new Set<string>();
  const rows = detections.filter((d) => {
    if (seen.has(d.token)) return false;
    seen.add(d.token);
    return true;
  });

  // Batch insert — D1 doesn't support multi-row VALUES, use batch()
  const stmts = await Promise.all(
    rows.map(async (d) => {
      const hash = await sha256(d.original);
      return db
        .prepare(
          `INSERT OR IGNORE INTO masking_tokens
             (token_id, document_id, original_hash, token, entity_type, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          documentId,
          hash,
          d.token,
          d.entityType,
          now,
        );
    }),
  );

  await db.batch(stmts);
}
