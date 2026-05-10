import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-PH (PH-001~PH-006): Pharmacy 합성 도메인 — 29번째 도메인 (제약/약국 산업, 18번째 신규 산업)
//   - pharmacy spec-container rules.md 기반 PoC source
//   - 합성 schema: prescriptions, drugs, stocks, dispenses, interactions, recalls
//   - 제약 lifecycle 패턴 — 용량한도/처방잔여/조제atomic/처방상태전환/리콜배치/상호작용atomic
//   - withRuleId 재사용 29번째 도메인 (신규 detector 0개, 27 Sprint 연속 정점)
//   - PharmacyError code-in-message 패턴 (S275 표준)
//   - 18 산업 연속 0 ABSENCE 목표 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH)
//   - 🎯 90.4% coverage 안정화 (90% 돌파 직후 유지)
// ---------------------------------------------------------------------------

export interface PrescriptionRow {
  id: string;
  patient_id: string;
  doctor_id: string;
  drug_id: string;
  dosage_amount: number;         // 단위: mg
  refills_used: number;
  status: string;                // issued | pending | dispensed | completed | expired
  issued_at: string;
  dispensed_at: string | null;
  completed_at: string | null;
  expired_at: string | null;
}

export interface DrugRow {
  id: string;
  name: string;
  category: string;
  stock_count: number;
  max_daily_dose_mg: number;
  status: string;                // active | recalled | discontinued
}

export interface DispenseRow {
  id: string;
  prescription_id: string;
  pharmacist_id: string;
  drug_id: string;
  dispensed_at: string;
}

export interface InteractionRow {
  id: string;
  drug_a_id: string;
  drug_b_id: string;
  severity: string;              // mild | moderate | severe
  alternative_drug_id: string | null;
}

const MAX_DAILY_DOSE = 4000;    // PH-001: 일일 최대 용량 한도 (mg, 표준 기준)

// ---------------------------------------------------------------------------
// PH-001: 일일 최대 용량 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function validateDosage(
  db: Database.Database,
  prescriptionId: string,
  dosageAmount: number,
): { prescriptionId: string; dosageAmount: number; validatedAt: string } {
  const prescription = db
    .prepare('SELECT id, status, drug_id FROM prescriptions WHERE id = ?')
    .get(prescriptionId) as { id: string; status: string; drug_id: string } | undefined;

  if (!prescription) throw new PharmacyError('E404-PRESCRIPTION', 'Prescription not found', 404);
  if (prescription.status !== 'issued' && prescription.status !== 'pending') {
    throw new PharmacyError(
      'E409-PRESCRIPTION',
      `Cannot validate dosage with prescription status=${prescription.status}`,
      409,
    );
  }

  if (dosageAmount >= MAX_DAILY_DOSE) {
    throw new PharmacyError(
      'E422-DOSAGE-EXCEEDED',
      `Daily dosage limit exceeded (${dosageAmount} >= ${MAX_DAILY_DOSE} mg)`,
      422,
    );
  }

  const validatedAt = new Date().toISOString();
  db.prepare(`UPDATE prescriptions SET status = 'pending' WHERE id = ?`).run(prescriptionId);

  return { prescriptionId, dosageAmount, validatedAt };
}

// ---------------------------------------------------------------------------
// PH-002: 처방 잔여 횟수 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, refillQuotaLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function checkRefillQuota(
  db: Database.Database,
  prescriptionId: string,
  refillsUsed: number,
): { refillsUsed: number; refillQuotaLimit: number; canRefill: boolean } {
  const prescription = db
    .prepare('SELECT drug_id, status FROM prescriptions WHERE id = ?')
    .get(prescriptionId) as { drug_id: string; status: string } | undefined;

  if (!prescription) throw new PharmacyError('E404-PRESCRIPTION', 'Prescription not found', 404);

  // 처방 유형별 최대 리필 횟수
  const refillLimitByCategory: Record<string, number> = {
    antibiotic: 1,
    painkiller: 3,
    chronic: 12,
    supplement: 6,
  };

  const drug = db
    .prepare('SELECT category FROM drugs WHERE id = ?')
    .get(prescription.drug_id) as { category: string } | undefined;

  const category = drug?.category ?? 'painkiller';
  // F445 Path B: var-vs-var, left=`refillQuotaLimit` (`limit` keyword 매칭)
  const refillQuotaLimit = refillLimitByCategory[category] ?? 3;

  if (refillsUsed > refillQuotaLimit) {
    throw new PharmacyError(
      'E422-REFILL-QUOTA',
      `Refill quota exceeded (${refillsUsed} > ${refillQuotaLimit})`,
      422,
    );
  }

  return { refillsUsed, refillQuotaLimit, canRefill: true };
}

// ---------------------------------------------------------------------------
// PH-003: 처방 조제 atomic — 처방 검증 + 재고 차감 + 약품 발급
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function dispensePrescription(
  db: Database.Database,
  prescriptionId: string,
  pharmacistId: string,
): { dispenseId: string; prescriptionId: string; pharmacistId: string; dispensedAt: string } {
  const prescription = db
    .prepare('SELECT id, status, drug_id FROM prescriptions WHERE id = ?')
    .get(prescriptionId) as { id: string; status: string; drug_id: string } | undefined;

  if (!prescription) throw new PharmacyError('E404-PRESCRIPTION', 'Prescription not found', 404);
  if (prescription.status !== 'pending') {
    throw new PharmacyError(
      'E409-PRESCRIPTION',
      `Cannot dispense prescription with status=${prescription.status}`,
      409,
    );
  }

  const drug = db
    .prepare('SELECT id, status, stock_count FROM drugs WHERE id = ?')
    .get(prescription.drug_id) as { id: string; status: string; stock_count: number } | undefined;

  if (!drug) throw new PharmacyError('E404-DRUG', 'Drug not found', 404);
  if (drug.status === 'recalled') {
    throw new PharmacyError('E422-DRUG-RECALLED', 'Drug is under recall and cannot be dispensed', 422);
  }
  if (drug.stock_count <= 0) {
    throw new PharmacyError('E422-OUT-OF-STOCK', 'Drug is out of stock', 422);
  }

  const dispenseId = randomUUID();
  const dispensedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE drugs SET stock_count = stock_count - 1 WHERE id = ?`)
      .run(prescription.drug_id);
    db.prepare(`UPDATE prescriptions SET status = 'dispensed', dispensed_at = ? WHERE id = ?`)
      .run(dispensedAt, prescriptionId);
    db.prepare(`
      INSERT INTO dispenses (id, prescription_id, pharmacist_id, drug_id, dispensed_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(dispenseId, prescriptionId, pharmacistId, prescription.drug_id, dispensedAt);
  });
  tx();

  return { dispenseId, prescriptionId, pharmacistId, dispensedAt };
}

// ---------------------------------------------------------------------------
// PH-004: 처방 상태 전환 (issued → pending → dispensed → completed → expired)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionPrescriptionStatus(
  db: Database.Database,
  prescriptionId: string,
  newStatus: 'pending' | 'dispensed' | 'completed' | 'expired',
): { prescriptionId: string; previousStatus: string; newStatus: string } {
  const prescription = db
    .prepare('SELECT status FROM prescriptions WHERE id = ?')
    .get(prescriptionId) as { status: string } | undefined;

  if (!prescription) throw new PharmacyError('E404-PRESCRIPTION', 'Prescription not found', 404);

  const previousStatus = prescription.status;
  const allowed =
    (previousStatus === 'issued' && newStatus === 'pending') ||
    (previousStatus === 'issued' && newStatus === 'expired') ||
    (previousStatus === 'pending' && newStatus === 'dispensed') ||
    (previousStatus === 'pending' && newStatus === 'expired') ||
    (previousStatus === 'dispensed' && newStatus === 'completed') ||
    (previousStatus === 'dispensed' && newStatus === 'expired') ||
    (previousStatus === 'completed' && newStatus === 'expired');

  if (!allowed) {
    throw new PharmacyError(
      'E409-PRESCRIPTION',
      `Cannot transition prescription from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE prescriptions SET status = ? WHERE id = ?`).run(newStatus, prescriptionId);

  if (newStatus === 'dispensed') {
    db.prepare(`UPDATE prescriptions SET dispensed_at = ? WHERE id = ?`).run(now, prescriptionId);
  } else if (newStatus === 'completed') {
    db.prepare(`UPDATE prescriptions SET completed_at = ? WHERE id = ?`).run(now, prescriptionId);
  } else if (newStatus === 'expired') {
    db.prepare(`UPDATE prescriptions SET expired_at = ? WHERE id = ?`).run(now, prescriptionId);
  }

  return { prescriptionId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// PH-005: 리콜 대상 약품 일괄 통지 (active → recalled 배치)
// (StatusTransition detector — batch 패턴, CC-005 batch 18번째 재사용)
// ---------------------------------------------------------------------------
export function markRecalledBatches(
  db: Database.Database,
  recallCutoffDate: string,
): { markedCount: number; markedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM drugs
      WHERE status = 'active'
        AND recalled_at IS NOT NULL
        AND recalled_at <= ?
    `)
    .all(recallCutoffDate) as Array<{ id: string }>;

  const markedIds: string[] = [];

  for (const drug of candidates) {
    db.prepare(`
      UPDATE drugs
      SET status = 'recalled'
      WHERE id = ?
    `).run(drug.id);
    markedIds.push(drug.id);
  }

  return { markedCount: markedIds.length, markedIds };
}

// ---------------------------------------------------------------------------
// PH-006: 약물 상호작용 atomic — 상호작용 검증 + 대체약 추천 + 처방 차단
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function checkDrugInteraction(
  db: Database.Database,
  prescriptionId: string,
  newDrugId: string,
): { prescriptionId: string; newDrugId: string; alternativeDrugId: string | null; checkedAt: string } {
  const prescription = db
    .prepare('SELECT id, status, drug_id FROM prescriptions WHERE id = ?')
    .get(prescriptionId) as { id: string; status: string; drug_id: string } | undefined;

  if (!prescription) throw new PharmacyError('E404-PRESCRIPTION', 'Prescription not found', 404);
  if (prescription.status === 'completed' || prescription.status === 'expired') {
    throw new PharmacyError(
      'E409-PRESCRIPTION',
      `Cannot check interaction for prescription status=${prescription.status}`,
      409,
    );
  }

  const newDrug = db
    .prepare('SELECT id, status FROM drugs WHERE id = ?')
    .get(newDrugId) as { id: string; status: string } | undefined;

  if (!newDrug) throw new PharmacyError('E404-DRUG', 'New drug not found', 404);

  const checkedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    // 상호작용 검증
    const interaction = db
      .prepare(`
        SELECT id, severity, alternative_drug_id
        FROM interactions
        WHERE (drug_a_id = ? AND drug_b_id = ?) OR (drug_a_id = ? AND drug_b_id = ?)
          AND severity = 'severe'
      `)
      .get(prescription.drug_id, newDrugId, newDrugId, prescription.drug_id) as InteractionRow | undefined;

    if (interaction) {
      // 대체약 추천 기록
      db.prepare(`
        INSERT INTO interaction_logs (id, prescription_id, new_drug_id, severity, alternative_drug_id, checked_at, blocked)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(
        randomUUID(),
        prescriptionId,
        newDrugId,
        interaction.severity,
        interaction.alternative_drug_id,
        checkedAt,
      );

      // 처방 차단 (status 재조정 필요 표시)
      db.prepare(`UPDATE prescriptions SET status = 'pending' WHERE id = ? AND status = 'issued'`)
        .run(prescriptionId);

      return interaction.alternative_drug_id;
    }

    // 상호작용 없음 기록
    db.prepare(`
      INSERT INTO interaction_logs (id, prescription_id, new_drug_id, severity, alternative_drug_id, checked_at, blocked)
      VALUES (?, ?, ?, 'none', NULL, ?, 0)
    `).run(randomUUID(), prescriptionId, newDrugId, checkedAt);

    return null;
  });

  const alternativeDrugId = tx() as string | null;

  return { prescriptionId, newDrugId, alternativeDrugId, checkedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class PharmacyError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'PharmacyError';
  }
}
