import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-DF (DF-001~DF-006): Defense 합성 도메인 — 36번째 도메인 (국방 산업, 25번째 신규 산업)
//   - defense spec-container rules.md 기반 PoC source
//   - 합성 schema: weapon_inventory, clearance_assignments, missions, training_schedules,
//                  classified_documents, mission_assignments, mission_equipment, mission_communications
//   - 국방 운용 lifecycle 패턴 — 무기고한도/보안등급/임무파견atomic/임무상태전환/훈련교체/기밀문서atomic
//   - withRuleId 재사용 36번째 도메인 (신규 detector 0개, 34 Sprint 연속 정점)
//   - DefenseError code-in-message 패턴 (S275 표준)
//   - 25 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF)
//   - 🏆 25번째 신규 산업 round number 마일스톤
// ---------------------------------------------------------------------------

export interface WeaponInventoryRow {
  id: string;
  unit_id: string;
  weapon_type: string;
  quantity: number;
  recorded_at: string;
  status: string;        // recorded | approved | decommissioned
}

export interface WeaponLimitRow {
  id: string;
  weapon_type: string;
  unit_tier: string;     // platoon | company | battalion | regiment
  max_inventory_limit: number;
}

export interface ClearanceAssignmentRow {
  id: string;
  personnel_id: string;
  clearance_tier: string; // confidential | secret | top_secret | sci
  clearance_level: number;
  assigned_at: string;
  status: string;         // active | suspended | revoked
}

export interface ClearanceTierRow {
  id: string;
  tier: string;
  clearance_level_limit: number;
  description: string;
}

export interface MissionRow {
  id: string;
  unit_id: string;
  mission_code: string;
  status: string;         // planned | briefed | executing | completed | debriefed
  planned_at: string;
  dispatched_at: string | null;
  completed_at: string | null;
}

export interface TrainingScheduleRow {
  id: string;
  unit_id: string;
  personnel_id: string;
  training_type: string;  // basic | advanced | specialized | joint
  scheduled_at: string;
  status: string;         // scheduled | completed | missed
  completed_at: string | null;
}

export interface ClassifiedDocumentRow {
  id: string;
  unit_id: string;
  document_code: string;
  classification_level: string; // confidential | secret | top_secret
  status: string;               // draft | classified | issued | archived
  processed_at: string | null;
  issued_at: string | null;
}

const MAX_WEAPON_INVENTORY_LIMIT = 500; // DF-001: 단위부대 무기 보유 한도 (수량)

// ---------------------------------------------------------------------------
// DF-001: 무기 보유 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function recordWeaponInventory(
  db: Database.Database,
  unitId: string,
  weaponType: string,
  quantity: number,
  operatorId: string,
): { inventoryId: string; unitId: string; totalQuantity: number; recordedAt: string } {
  const existing = db
    .prepare('SELECT COALESCE(SUM(quantity), 0) as total FROM weapon_inventory WHERE unit_id = ? AND status = \'recorded\'')
    .get(unitId) as { total: number } | undefined;

  const totalQuantity = (existing?.total ?? 0) + quantity;
  if (totalQuantity >= MAX_WEAPON_INVENTORY_LIMIT) {
    throw new DefenseError(
      'E422-INVENTORY-EXCEEDED',
      `Weapon inventory exceeded maximum limit (${totalQuantity} >= ${MAX_WEAPON_INVENTORY_LIMIT})`,
      422,
    );
  }

  const inventoryId = randomUUID();
  const recordedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO weapon_inventory (id, unit_id, weapon_type, quantity, recorded_at, status)
    VALUES (?, ?, ?, ?, ?, 'recorded')
  `).run(inventoryId, unitId, weaponType, quantity, recordedAt);

  return { inventoryId, unitId, totalQuantity, recordedAt };
}

// ---------------------------------------------------------------------------
// DF-002: 보안 레벨 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, clearanceLevelLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function checkClearanceLevel(
  db: Database.Database,
  personnelId: string,
  requiredLevel: number,
  tierCode: 'confidential' | 'secret' | 'top_secret' | 'sci',
): { personnelId: string; clearanceLevel: number; clearanceLevelLimit: number; granted: boolean } {
  const tier = db
    .prepare('SELECT clearance_level_limit FROM clearance_tiers WHERE tier = ? LIMIT 1')
    .get(tierCode) as { clearance_level_limit: number } | undefined;

  if (!tier) throw new DefenseError('E404-TIER', 'Clearance tier not found', 404);

  const assignment = db
    .prepare('SELECT clearance_level FROM clearance_assignments WHERE personnel_id = ? AND status = \'active\' ORDER BY assigned_at DESC LIMIT 1')
    .get(personnelId) as { clearance_level: number } | undefined;

  if (!assignment) throw new DefenseError('E404-CLEARANCE', 'Active clearance not found', 404);

  const clearanceLevel = assignment.clearance_level;

  // F445 Path B: var-vs-var, left=`clearanceLevelLimit` (`limit` keyword 매칭)
  const clearanceLevelLimit = tier.clearance_level_limit;

  if (clearanceLevel > clearanceLevelLimit) {
    throw new DefenseError(
      'E422-CLEARANCE-EXCEEDED',
      `Clearance level exceeded tier limit (${clearanceLevel} > ${clearanceLevelLimit})`,
      422,
    );
  }

  if (clearanceLevel < requiredLevel) {
    throw new DefenseError(
      'E403-CLEARANCE-INSUFFICIENT',
      `Insufficient clearance level (${clearanceLevel} < ${requiredLevel})`,
      403,
    );
  }

  return { personnelId, clearanceLevel, clearanceLevelLimit, granted: true };
}

// ---------------------------------------------------------------------------
// DF-003: 임무 파견 atomic — 임무 + 인원 + 장비 + 통신 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function dispatchMission(
  db: Database.Database,
  unitId: string,
  missionCode: string,
  personnelIds: string[],
  equipmentIds: string[],
  communicationChannel: string,
): { missionId: string; assignmentCount: number; equipmentCount: number; unitId: string; dispatchedAt: string } {
  const existing = db
    .prepare('SELECT id, status FROM missions WHERE mission_code = ? AND unit_id = ? AND status = \'planned\'')
    .get(missionCode, unitId) as { id: string; status: string } | undefined;

  if (!existing) throw new DefenseError('E404-MISSION', 'No planned mission found', 404);

  const missionId = randomUUID();
  const commId = randomUUID();
  const dispatchedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO missions (id, unit_id, mission_code, status, planned_at, dispatched_at, completed_at)
      VALUES (?, ?, ?, 'executing', ?, ?, NULL)
    `).run(missionId, unitId, missionCode, dispatchedAt, dispatchedAt);

    for (const personnelId of personnelIds) {
      db.prepare(`
        INSERT INTO mission_assignments (id, mission_id, personnel_id, role, assigned_at)
        VALUES (?, ?, ?, 'operator', ?)
      `).run(randomUUID(), missionId, personnelId, dispatchedAt);
    }

    for (const equipmentId of equipmentIds) {
      db.prepare(`
        INSERT INTO mission_equipment (id, mission_id, equipment_id, quantity, assigned_at)
        VALUES (?, ?, ?, 1, ?)
      `).run(randomUUID(), missionId, equipmentId, dispatchedAt);
    }

    db.prepare(`
      INSERT INTO mission_communications (id, mission_id, channel, protocol, activated_at)
      VALUES (?, ?, ?, 'encrypted', ?)
    `).run(commId, missionId, communicationChannel, dispatchedAt);

    db.prepare(`UPDATE missions SET status = 'briefed' WHERE id = ?`).run(existing.id);
  });
  tx();

  return { missionId, assignmentCount: personnelIds.length, equipmentCount: equipmentIds.length, unitId, dispatchedAt };
}

// ---------------------------------------------------------------------------
// DF-004: 임무 상태 전환 (planned → briefed → executing → completed → debriefed)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionMissionStatus(
  db: Database.Database,
  missionId: string,
  newStatus: 'briefed' | 'executing' | 'completed' | 'debriefed',
): { missionId: string; previousStatus: string; newStatus: string } {
  const mission = db
    .prepare('SELECT status FROM missions WHERE id = ?')
    .get(missionId) as { status: string } | undefined;

  if (!mission) throw new DefenseError('E404-MISSION', 'Mission not found', 404);

  const previousStatus = mission.status;
  const allowed =
    (mission.status === 'planned' && newStatus === 'briefed') ||
    (mission.status === 'briefed' && newStatus === 'executing') ||
    (mission.status === 'executing' && newStatus === 'completed') ||
    (mission.status === 'completed' && newStatus === 'debriefed');

  if (!allowed) {
    throw new DefenseError(
      'E409-MISSION',
      `Cannot transition mission from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE missions SET status = ? WHERE id = ?`).run(newStatus, missionId);

  if (newStatus === 'completed') {
    db.prepare(`UPDATE missions SET completed_at = ? WHERE id = ?`).run(now, missionId);
  }

  return { missionId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// DF-005: 훈련 교체 일괄 처리 (batch training rotation)
// (StatusTransition detector — batch 패턴, CC-005 batch 25번째 재사용)
// ---------------------------------------------------------------------------
export function markTrainingRotation(
  db: Database.Database,
  scheduledBefore: string,
): { completedCount: number; completedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM training_schedules
      WHERE scheduled_at <= ?
        AND status = 'scheduled'
    `)
    .all(scheduledBefore) as Array<{ id: string }>;

  const completedIds: string[] = [];

  for (const schedule of candidates) {
    db.prepare(`
      UPDATE training_schedules
      SET status = 'completed', completed_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), schedule.id);
    completedIds.push(schedule.id);
  }

  return { completedCount: completedIds.length, completedIds };
}

// ---------------------------------------------------------------------------
// DF-006: 기밀 문서 처리 atomic — 분류 + 검증 + 발급 + 감사 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processClassifiedDocument(
  db: Database.Database,
  unitId: string,
  documentCode: string,
  classificationLevel: 'confidential' | 'secret' | 'top_secret',
  validatorId: string,
  recipientId: string,
): { documentId: string; validationId: string; issuanceId: string; auditId: string; unitId: string; issuedAt: string } {
  const documentId = randomUUID();
  const validationId = randomUUID();
  const issuanceId = randomUUID();
  const auditId = randomUUID();
  const issuedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO classified_documents (id, unit_id, document_code, classification_level, status, processed_at, issued_at)
      VALUES (?, ?, ?, ?, 'classified', ?, ?)
    `).run(documentId, unitId, documentCode, classificationLevel, issuedAt, issuedAt);

    db.prepare(`
      INSERT INTO document_validations (id, document_id, validated_by, validated_at, result)
      VALUES (?, ?, ?, ?, 'approved')
    `).run(validationId, documentId, validatorId, issuedAt);

    db.prepare(`
      INSERT INTO document_issuances (id, document_id, issued_to, issued_at, receipt_confirmed)
      VALUES (?, ?, ?, ?, 0)
    `).run(issuanceId, documentId, recipientId, issuedAt);

    db.prepare(`
      INSERT INTO document_audit_logs (id, document_id, action, performed_by, performed_at)
      VALUES (?, ?, 'issued', ?, ?)
    `).run(auditId, documentId, validatorId, issuedAt);

    db.prepare(`UPDATE classified_documents SET status = 'issued' WHERE id = ?`).run(documentId);
  });
  tx();

  return { documentId, validationId, issuanceId, auditId, unitId, issuedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class DefenseError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'DefenseError';
  }
}
