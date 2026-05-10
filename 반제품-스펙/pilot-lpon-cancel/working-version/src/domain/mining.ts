import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-MN (MN-001~MN-006): Mining 합성 도메인 — 35번째 도메인 (광업 산업, 24번째 신규 산업)
//   - mining spec-container rules.md 기반 PoC source
//   - 합성 schema: extractions, royalty_tiers, blast_operations, ore_batches, compliance_checks, safety_incidents
//   - 광업 운용 lifecycle 패턴 — 채광한도/로열티한도/발파atomic/광석상태전환/환경점검/사고atomic
//   - withRuleId 재사용 35번째 도메인 (신규 detector 0개, 33 Sprint 연속 정점)
//   - MiningError code-in-message 패턴 (S275 표준)
//   - 24 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN)
// ---------------------------------------------------------------------------

export interface ExtractionRow {
  id: string;
  site_id: string;
  ore_type: string;
  extracted_tons: number;
  extraction_date: string;
  shift: string;         // morning | afternoon | night
  operator_id: string;
  status: string;        // recorded | validated | dispatched
  created_at: string;
}

export interface RoyaltyTierRow {
  id: string;
  tier: string;          // tier1 | tier2 | tier3 | premium
  royalty_rate: number;  // %
  max_royalty_limit: number; // 분기 최대 로열티 (원)
  effective_from: string;
}

export interface BlastOperationRow {
  id: string;
  site_id: string;
  blast_zone: string;
  planned_at: string;
  executed_at: string | null;
  status: string;        // planned | cleared | executed | completed | aborted
  operator_id: string;
  clearance_code: string | null;
}

export interface OreBatchRow {
  id: string;
  extraction_id: string;
  ore_type: string;
  weight_tons: number;
  status: string;        // extracted | graded | processed | shipped
  graded_at: string | null;
  processed_at: string | null;
  shipped_at: string | null;
}

export interface ComplianceCheckRow {
  id: string;
  site_id: string;
  check_type: string;    // dust | water | noise | waste
  scheduled_at: string;
  status: string;        // pending | checked | passed | failed
  checked_at: string | null;
}

export interface SafetyIncidentRow {
  id: string;
  site_id: string;
  incident_type: string; // fall | explosion | equipment_failure | chemical_leak
  severity: string;      // minor | moderate | major | critical
  occurred_at: string;
  status: string;        // reported | investigating | corrected | closed
  reported_at: string | null;
  filed: number;         // 0 | 1
}

const MAX_EXTRACTION_QUOTA = 50_000; // MN-001: 일일 채광량 한도 (톤)

// ---------------------------------------------------------------------------
// MN-001: 채광량 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function recordExtraction(
  db: Database.Database,
  siteId: string,
  oreType: string,
  extractedTons: number,
  operatorId: string,
  shift: 'morning' | 'afternoon' | 'night',
): { extractionId: string; siteId: string; extractedTons: number; recordedAt: string } {
  const existing = db
    .prepare('SELECT COALESCE(SUM(extracted_tons), 0) as total FROM extractions WHERE site_id = ? AND extraction_date = date(\'now\')')
    .get(siteId) as { total: number } | undefined;

  const totalExtracted = (existing?.total ?? 0) + extractedTons;
  if (totalExtracted >= MAX_EXTRACTION_QUOTA) {
    throw new MiningError(
      'E422-QUOTA-EXCEEDED',
      `Extraction quota exceeded maximum limit (${totalExtracted} >= ${MAX_EXTRACTION_QUOTA} tons)`,
      422,
    );
  }

  const extractionId = randomUUID();
  const recordedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO extractions (id, site_id, ore_type, extracted_tons, extraction_date, shift, operator_id, status, created_at)
    VALUES (?, ?, ?, ?, date('now'), ?, ?, 'recorded', ?)
  `).run(extractionId, siteId, oreType, extractedTons, shift, operatorId, recordedAt);

  return { extractionId, siteId, extractedTons, recordedAt };
}

// ---------------------------------------------------------------------------
// MN-002: 로열티 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, royaltyTierLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function computeRoyalty(
  db: Database.Database,
  siteId: string,
  oreType: string,
  extractionValue: number,
  tierCode: 'tier1' | 'tier2' | 'tier3' | 'premium',
): { siteId: string; royaltyAmount: number; royaltyTierLimit: number; approved: boolean } {
  const tier = db
    .prepare('SELECT royalty_rate, max_royalty_limit FROM royalty_tiers WHERE tier = ? ORDER BY effective_from DESC LIMIT 1')
    .get(tierCode) as { royalty_rate: number; max_royalty_limit: number } | undefined;

  if (!tier) throw new MiningError('E404-TIER', 'Royalty tier not found', 404);

  const royaltyAmount = Math.round(extractionValue * tier.royalty_rate / 100);

  // F445 Path B: var-vs-var, left=`royaltyTierLimit` (`limit` keyword 매칭)
  const royaltyTierLimit = tier.max_royalty_limit;

  if (royaltyAmount > royaltyTierLimit) {
    throw new MiningError(
      'E422-ROYALTY-EXCEEDED',
      `Royalty amount exceeded tier limit (${royaltyAmount} > ${royaltyTierLimit})`,
      422,
    );
  }

  db.prepare(`
    INSERT INTO royalty_records (id, site_id, ore_type, extraction_value, royalty_amount, tier, computed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), siteId, oreType, extractionValue, royaltyAmount, tierCode, new Date().toISOString());

  return { siteId, royaltyAmount, royaltyTierLimit, approved: true };
}

// ---------------------------------------------------------------------------
// MN-003: 발파 작업 atomic — 안전 검증 + 허가 + 작업 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processBlastOperation(
  db: Database.Database,
  siteId: string,
  blastZone: string,
  operatorId: string,
  clearanceCode: string,
): { blastId: string; clearanceId: string; siteId: string; executedAt: string } {
  const pending = db
    .prepare('SELECT id, status FROM blast_operations WHERE site_id = ? AND blast_zone = ? AND status = \'planned\' ORDER BY planned_at DESC LIMIT 1')
    .get(siteId, blastZone) as { id: string; status: string } | undefined;

  if (!pending) throw new MiningError('E404-BLAST', 'No planned blast operation found', 404);

  const blastId = randomUUID();
  const clearanceId = randomUUID();
  const executedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO blast_records (id, site_id, blast_zone, operator_id, executed_at, clearance_code)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(blastId, siteId, blastZone, operatorId, executedAt, clearanceCode);
    db.prepare(`
      INSERT INTO safety_clearances (id, blast_id, clearance_code, issued_at, status)
      VALUES (?, ?, ?, ?, 'approved')
    `).run(clearanceId, blastId, clearanceCode, executedAt);
    db.prepare(`UPDATE blast_operations SET status = 'executed', executed_at = ?, clearance_code = ? WHERE id = ?`)
      .run(executedAt, clearanceCode, pending.id);
    db.prepare(`UPDATE ore_batches SET status = 'extracted' WHERE extraction_id IN (SELECT id FROM extractions WHERE site_id = ? AND status = 'recorded')`)
      .run(siteId);
  });
  tx();

  return { blastId, clearanceId, siteId, executedAt };
}

// ---------------------------------------------------------------------------
// MN-004: 광석 상태 전환 (extracted → graded → processed → shipped)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionOreStatus(
  db: Database.Database,
  batchId: string,
  newStatus: 'graded' | 'processed' | 'shipped',
): { batchId: string; previousStatus: string; newStatus: string } {
  const batch = db
    .prepare('SELECT status FROM ore_batches WHERE id = ?')
    .get(batchId) as { status: string } | undefined;

  if (!batch) throw new MiningError('E404-BATCH', 'Ore batch not found', 404);

  const previousStatus = batch.status;
  const allowed =
    (batch.status === 'extracted' && newStatus === 'graded') ||
    (batch.status === 'graded' && newStatus === 'processed') ||
    (batch.status === 'processed' && newStatus === 'shipped');

  if (!allowed) {
    throw new MiningError(
      'E409-BATCH',
      `Cannot transition ore batch from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE ore_batches SET status = ? WHERE id = ?`).run(newStatus, batchId);

  if (newStatus === 'graded') {
    db.prepare(`UPDATE ore_batches SET graded_at = ? WHERE id = ?`).run(now, batchId);
  } else if (newStatus === 'processed') {
    db.prepare(`UPDATE ore_batches SET processed_at = ? WHERE id = ?`).run(now, batchId);
  } else if (newStatus === 'shipped') {
    db.prepare(`UPDATE ore_batches SET shipped_at = ? WHERE id = ?`).run(now, batchId);
  }

  return { batchId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// MN-005: 환경 준수 일괄 점검 (batch compliance check)
// (StatusTransition detector — batch 패턴, CC-005 batch 24번째 재사용)
// ---------------------------------------------------------------------------
export function runComplianceBatch(
  db: Database.Database,
  scheduledBefore: string,
): { checkedCount: number; checkedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM compliance_checks
      WHERE scheduled_at <= ?
        AND status = 'pending'
    `)
    .all(scheduledBefore) as Array<{ id: string }>;

  const checkedIds: string[] = [];

  for (const check of candidates) {
    db.prepare(`
      UPDATE compliance_checks
      SET status = 'checked', checked_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), check.id);
    checkedIds.push(check.id);
  }

  return { checkedCount: checkedIds.length, checkedIds };
}

// ---------------------------------------------------------------------------
// MN-006: 안전 사고 atomic — 사고 신고 + 조사 + 시정 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processSafetyIncident(
  db: Database.Database,
  siteId: string,
  incidentType: 'fall' | 'explosion' | 'equipment_failure' | 'chemical_leak',
  severity: 'minor' | 'moderate' | 'major' | 'critical',
  description: string,
  correctiveAction: string,
): { incidentId: string; investigationId: string; correctiveId: string; siteId: string; reportedAt: string } {
  const incidentId = randomUUID();
  const investigationId = randomUUID();
  const correctiveId = randomUUID();
  const reportedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO safety_incidents (id, site_id, incident_type, severity, occurred_at, status, reported_at, filed)
      VALUES (?, ?, ?, ?, ?, 'reported', ?, 0)
    `).run(incidentId, siteId, incidentType, severity, reportedAt, reportedAt);
    db.prepare(`
      INSERT INTO incident_investigations (id, incident_id, description, investigated_at)
      VALUES (?, ?, ?, ?)
    `).run(investigationId, incidentId, description, reportedAt);
    db.prepare(`
      INSERT INTO corrective_actions (id, incident_id, action_description, created_at)
      VALUES (?, ?, ?, ?)
    `).run(correctiveId, incidentId, correctiveAction, reportedAt);
    db.prepare(`UPDATE safety_incidents SET filed = 1 WHERE id = ?`).run(incidentId);
  });
  tx();

  return { incidentId, investigationId, correctiveId, siteId, reportedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class MiningError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'MiningError';
  }
}
