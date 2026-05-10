import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-AG (AG-001~AG-006): Agriculture 합성 도메인 — 30번째 도메인 (농업 산업, 19번째 신규 산업)
//   - agriculture spec-container rules.md 기반 PoC source
//   - 합성 schema: crops, fields, harvests, gradings, certifications, pesticide_logs
//   - 농업 lifecycle 패턴 — 수확량한도/살포한도/수확atomic/작물상태전환/등급배치/인증atomic
//   - withRuleId 재사용 30번째 도메인 (신규 detector 0개, 28 Sprint 연속 정점)
//   - AgricultureError code-in-message 패턴 (S275 표준)
//   - 19 산업 연속 0 ABSENCE 목표 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG)
//   - 🏆 Sprint 300 마일스톤: 30번째 도메인 + 30 Sprint 누적 동시 도달
// ---------------------------------------------------------------------------

export interface CropRow {
  id: string;
  field_id: string;
  crop_type: string;
  planted_at: string;
  status: string;                // planted | growing | mature | harvested | sold
  yield_kg: number | null;
  grade: string | null;
  harvested_at: string | null;
  sold_at: string | null;
}

export interface FieldRow {
  id: string;
  area_hectares: number;
  location: string;
  owner_id: string;
  status: string;                // active | fallow | restricted
}

export interface HarvestRow {
  id: string;
  crop_id: string;
  field_id: string;
  yield_kg: number;
  harvested_at: string;
  inspector_id: string;
}

export interface GradingRow {
  id: string;
  harvest_id: string;
  grade: string;                 // A | B | C | rejected
  graded_at: string;
  grader_id: string;
}

export interface CertificationRow {
  id: string;
  crop_id: string;
  cert_type: string;             // organic | gmo-free | fair-trade
  issued_at: string;
  expires_at: string;
  issued_by: string;
}

const MAX_YIELD_PER_HECTARE = 10000; // AG-001: 단위 면적당 최대 수확량 한도 (kg/ha)

// ---------------------------------------------------------------------------
// AG-001: 수확량 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function recordCropYield(
  db: Database.Database,
  cropId: string,
  yieldKg: number,
): { cropId: string; yieldKg: number; recordedAt: string } {
  const crop = db
    .prepare('SELECT id, status, field_id FROM crops WHERE id = ?')
    .get(cropId) as { id: string; status: string; field_id: string } | undefined;

  if (!crop) throw new AgricultureError('E404-CROP', 'Crop not found', 404);
  if (crop.status !== 'mature' && crop.status !== 'harvested') {
    throw new AgricultureError(
      'E409-CROP',
      `Cannot record yield for crop with status=${crop.status}`,
      409,
    );
  }

  const field = db
    .prepare('SELECT area_hectares FROM fields WHERE id = ?')
    .get(crop.field_id) as { area_hectares: number } | undefined;

  const areaHectares = field?.area_hectares ?? 1;
  const yieldPerHectare = yieldKg / areaHectares;

  if (yieldPerHectare >= MAX_YIELD_PER_HECTARE) {
    throw new AgricultureError(
      'E422-YIELD-EXCEEDED',
      `Crop yield per hectare exceeded (${yieldPerHectare} >= ${MAX_YIELD_PER_HECTARE} kg/ha)`,
      422,
    );
  }

  const recordedAt = new Date().toISOString();
  db.prepare(`UPDATE crops SET yield_kg = ?, status = 'harvested', harvested_at = ? WHERE id = ?`)
    .run(yieldKg, recordedAt, cropId);

  return { cropId, yieldKg, recordedAt };
}

// ---------------------------------------------------------------------------
// AG-002: 살포 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, pesticideQuotaLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyPesticide(
  db: Database.Database,
  fieldId: string,
  pesticideApplied: number,
): { fieldId: string; pesticideApplied: number; pesticideQuotaLimit: number; approved: boolean } {
  const field = db
    .prepare('SELECT id, status, area_hectares FROM fields WHERE id = ?')
    .get(fieldId) as { id: string; status: string; area_hectares: number } | undefined;

  if (!field) throw new AgricultureError('E404-FIELD', 'Field not found', 404);
  if (field.status === 'restricted') {
    throw new AgricultureError('E409-FIELD', 'Field is restricted — pesticide application prohibited', 409);
  }

  // 작물 유형별 최대 살포 허용량 (kg/ha)
  const quotaByAreaCategory: Record<string, number> = {
    small: 50,   // < 1 ha
    medium: 80,  // 1–5 ha
    large: 120,  // > 5 ha
  };

  const areaCategory =
    field.area_hectares < 1 ? 'small' : field.area_hectares <= 5 ? 'medium' : 'large';

  // F445 Path B: var-vs-var, left=`pesticideQuotaLimit` (`limit` keyword 매칭)
  const pesticideQuotaLimit = quotaByAreaCategory[areaCategory] ?? 80;

  if (pesticideApplied > pesticideQuotaLimit) {
    throw new AgricultureError(
      'E422-PESTICIDE-QUOTA',
      `Pesticide quota exceeded (${pesticideApplied} > ${pesticideQuotaLimit} kg/ha)`,
      422,
    );
  }

  const appliedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO pesticide_logs (id, field_id, amount_kg, applied_at, approved)
    VALUES (?, ?, ?, ?, 1)
  `).run(randomUUID(), fieldId, pesticideApplied, appliedAt);

  return { fieldId, pesticideApplied, pesticideQuotaLimit, approved: true };
}

// ---------------------------------------------------------------------------
// AG-003: 수확 atomic — 수확 + 등급 검사 + 출하 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processHarvest(
  db: Database.Database,
  cropId: string,
  inspectorId: string,
): { harvestId: string; gradingId: string; cropId: string; inspectorId: string; harvestedAt: string } {
  const crop = db
    .prepare('SELECT id, status, field_id, yield_kg FROM crops WHERE id = ?')
    .get(cropId) as { id: string; status: string; field_id: string; yield_kg: number | null } | undefined;

  if (!crop) throw new AgricultureError('E404-CROP', 'Crop not found', 404);
  if (crop.status !== 'mature') {
    throw new AgricultureError(
      'E409-CROP',
      `Cannot harvest crop with status=${crop.status}`,
      409,
    );
  }

  const field = db
    .prepare('SELECT id, status FROM fields WHERE id = ?')
    .get(crop.field_id) as { id: string; status: string } | undefined;

  if (!field) throw new AgricultureError('E404-FIELD', 'Field not found', 404);
  if (field.status === 'restricted') {
    throw new AgricultureError('E422-FIELD-RESTRICTED', 'Cannot harvest from a restricted field', 422);
  }

  const harvestId = randomUUID();
  const gradingId = randomUUID();
  const harvestedAt = new Date().toISOString();
  const yieldKg = crop.yield_kg ?? 0;

  const grade = yieldKg >= 5000 ? 'A' : yieldKg >= 2000 ? 'B' : 'C';

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO harvests (id, crop_id, field_id, yield_kg, harvested_at, inspector_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(harvestId, cropId, crop.field_id, yieldKg, harvestedAt, inspectorId);
    db.prepare(`
      INSERT INTO gradings (id, harvest_id, grade, graded_at, grader_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(gradingId, harvestId, grade, harvestedAt, inspectorId);
    db.prepare(`UPDATE crops SET status = 'harvested', harvested_at = ?, grade = ? WHERE id = ?`)
      .run(harvestedAt, grade, cropId);
  });
  tx();

  return { harvestId, gradingId, cropId, inspectorId, harvestedAt };
}

// ---------------------------------------------------------------------------
// AG-004: 작물 상태 전환 (planted → growing → mature → harvested → sold)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionCropStatus(
  db: Database.Database,
  cropId: string,
  newStatus: 'growing' | 'mature' | 'harvested' | 'sold',
): { cropId: string; previousStatus: string; newStatus: string } {
  const crop = db
    .prepare('SELECT status FROM crops WHERE id = ?')
    .get(cropId) as { status: string } | undefined;

  if (!crop) throw new AgricultureError('E404-CROP', 'Crop not found', 404);

  const previousStatus = crop.status;
  const allowed =
    (previousStatus === 'planted' && newStatus === 'growing') ||
    (previousStatus === 'growing' && newStatus === 'mature') ||
    (previousStatus === 'mature' && newStatus === 'harvested') ||
    (previousStatus === 'harvested' && newStatus === 'sold');

  if (!allowed) {
    throw new AgricultureError(
      'E409-CROP',
      `Cannot transition crop from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE crops SET status = ? WHERE id = ?`).run(newStatus, cropId);

  if (newStatus === 'harvested') {
    db.prepare(`UPDATE crops SET harvested_at = ? WHERE id = ?`).run(now, cropId);
  } else if (newStatus === 'sold') {
    db.prepare(`UPDATE crops SET sold_at = ? WHERE id = ?`).run(now, cropId);
  }

  return { cropId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// AG-005: 등급 일괄 갱신 (batch grading)
// (StatusTransition detector — batch 패턴, CC-005 batch 19번째 재사용)
// ---------------------------------------------------------------------------
export function markBatchGrading(
  db: Database.Database,
  gradingCutoffDate: string,
): { markedCount: number; markedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM harvests
      WHERE graded = 0
        AND harvested_at <= ?
    `)
    .all(gradingCutoffDate) as Array<{ id: string }>;

  const markedIds: string[] = [];

  for (const harvest of candidates) {
    db.prepare(`
      UPDATE harvests
      SET graded = 1, status = 'graded'
      WHERE id = ?
    `).run(harvest.id);
    markedIds.push(harvest.id);
  }

  return { markedCount: markedIds.length, markedIds };
}

// ---------------------------------------------------------------------------
// AG-006: 인증 atomic — 인증 검증 + 서류 발급 + 라벨링
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function issueCertification(
  db: Database.Database,
  cropId: string,
  certType: 'organic' | 'gmo-free' | 'fair-trade',
  issuedBy: string,
): { certId: string; cropId: string; certType: string; issuedAt: string; expiresAt: string } {
  const crop = db
    .prepare('SELECT id, status, grade FROM crops WHERE id = ?')
    .get(cropId) as { id: string; status: string; grade: string | null } | undefined;

  if (!crop) throw new AgricultureError('E404-CROP', 'Crop not found', 404);
  if (crop.status !== 'harvested' && crop.status !== 'sold') {
    throw new AgricultureError(
      'E409-CROP',
      `Cannot issue certification for crop with status=${crop.status}`,
      409,
    );
  }
  if (crop.grade === 'rejected') {
    throw new AgricultureError('E422-CROP-REJECTED', 'Cannot certify a rejected-grade crop', 422);
  }

  const certId = randomUUID();
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO certifications (id, crop_id, cert_type, issued_at, expires_at, issued_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(certId, cropId, certType, issuedAt, expiresAt, issuedBy);
    db.prepare(`
      INSERT INTO certification_labels (id, cert_id, crop_id, cert_type, label_created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(randomUUID(), certId, cropId, certType, issuedAt);
    db.prepare(`UPDATE crops SET certified = 1 WHERE id = ?`).run(cropId);
  });
  tx();

  return { certId, cropId, certType, issuedAt, expiresAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class AgricultureError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'AgricultureError';
  }
}
