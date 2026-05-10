import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-TM (TM-001~TM-006): Telemedicine 합성 도메인 — 44번째 도메인 (원격진료 산업, 33번째 신규 산업)
//   - telemedicine spec-container rules.md 기반 PoC source
//   - 합성 schema: consultation_slots, slot_bookings, patient_subscriptions,
//                  consultations, doctors, consultation_payments,
//                  prescriptions, billing_records, payouts
//   - 원격진료 lifecycle 패턴 — 슬롯정원/처방한도/진료atomic/상태전환/처방만료배치/정산atomic
//   - withRuleId 재사용 44번째 도메인 (신규 detector 0개, 45 Sprint 연속 정점)
//   - TelemedicineError code-in-message 패턴 (S275 표준)
//   - 33 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM)
//   - 33번째 신규 산업 마일스톤 (telemedicine 추가, HC+PH+TM 의료 3-클러스터 형성)
// ---------------------------------------------------------------------------

export interface ConsultationSlotRow {
  id: string;
  doctor_id: string;
  slot_name: string;
  capacity: number;
  booked_count: number;
  status: string;   // available | reserved | in_use | maintenance
}

export interface SlotBookingRow {
  id: string;
  patient_id: string;
  slot_id: string;
  status: string;       // booked | confirmed | in_progress | completed | cancelled
  booked_at: string;
}

export interface PatientSubscriptionRow {
  id: string;
  patient_id: string;
  tier_code: string;        // basic | standard | premium | corporate
  prescription_limit: number;
  prescription_usage: number;
  valid_until: string;
}

export interface ConsultationRow {
  id: string;
  patient_id: string;
  doctor_id: string;
  service_type: string;
  payment_id: string | null;
  status: string;           // booked | in_progress | completed | prescribed | reviewed
  booked_at: string;
}

export interface PrescriptionRow {
  id: string;
  consultation_id: string;
  drug_code: string;
  prescribed_at: string;
  valid_until: string;
  status: string;   // active | filled | expired | cancelled
}

export interface BillingRecordRow {
  id: string;
  doctor_id: string;
  consultation_id: string;
  revenue: number;
  billing_rate: number;
  billing_amount: number;
  status: string;   // pending | calculated | settled
}

const MAX_SLOT_CAPACITY = 30; // TM-001: 진료 슬롯 정원 한도 (인원, 기본값)

// ---------------------------------------------------------------------------
// TM-001: 진료 슬롯 정원 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function bookConsultationSlot(
  db: Database.Database,
  slotId: string,
  patientId: string,
): { bookingId: string; slotId: string; patientId: string; bookedAt: string } {
  const slot = db
    .prepare('SELECT booked_count, capacity FROM consultation_slots WHERE id = ?')
    .get(slotId) as { booked_count: number; capacity: number } | undefined;

  if (!slot) throw new TelemedicineError('E404-SLOT', 'Consultation slot not found', 404);

  const limit = slot.capacity ?? MAX_SLOT_CAPACITY;

  if (slot.booked_count >= limit) {
    throw new TelemedicineError(
      'E422-SLOT-CAPACITY-EXCEEDED',
      `Slot is fully booked (${slot.booked_count} >= ${limit})`,
      422,
    );
  }

  const bookingId = randomUUID();
  const bookedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO slot_bookings (id, patient_id, slot_id, status, booked_at)
    VALUES (?, ?, ?, 'booked', ?)
  `).run(bookingId, patientId, slotId, bookedAt);

  db.prepare(`
    UPDATE consultation_slots SET booked_count = booked_count + 1 WHERE id = ?
  `).run(slotId);

  return { bookingId, slotId, patientId, bookedAt };
}

// ---------------------------------------------------------------------------
// TM-002: 환자 구독 처방 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, prescriptionLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyPrescriptionLimit(
  db: Database.Database,
  patientId: string,
  subscriptionId: string,
): { patientId: string; subscriptionId: string; prescriptionLimit: number; approved: boolean } {
  const subscription = db
    .prepare('SELECT prescription_usage, prescription_limit FROM patient_subscriptions WHERE id = ? AND patient_id = ? LIMIT 1')
    .get(subscriptionId, patientId) as { prescription_usage: number; prescription_limit: number } | undefined;

  if (!subscription) throw new TelemedicineError('E404-SUBSCRIPTION', 'Patient subscription not found', 404);

  // F445 Path B: var-vs-var, left=`prescriptionLimit` (`limit` keyword 매칭)
  const prescriptionLimit = subscription.prescription_limit;

  if (subscription.prescription_usage >= prescriptionLimit) {
    throw new TelemedicineError(
      'E422-PRESCRIPTION-LIMIT-EXCEEDED',
      `Prescription quota exhausted (${subscription.prescription_usage} >= ${prescriptionLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE patient_subscriptions SET prescription_usage = prescription_usage + 1 WHERE id = ?
  `).run(subscriptionId);

  return { patientId, subscriptionId, prescriptionLimit, approved: true };
}

// ---------------------------------------------------------------------------
// TM-003: 원격진료 예약 atomic — 진료 + 의사 점유 + 결제 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function confirmConsultation(
  db: Database.Database,
  patientId: string,
  doctorId: string,
  serviceType: string,
  amount: number,
): { consultationId: string; paymentId: string; doctorId: string; patientId: string; bookedAt: string } {
  const doctor = db
    .prepare("SELECT status FROM doctors WHERE id = ? AND status = 'available'")
    .get(doctorId) as { status: string } | undefined;

  if (!doctor) throw new TelemedicineError('E404-DOCTOR', 'Doctor not available', 404);

  const consultationId = randomUUID();
  const paymentId = randomUUID();
  const bookedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO consultations (id, patient_id, doctor_id, service_type, payment_id, status, booked_at)
      VALUES (?, ?, ?, ?, ?, 'booked', ?)
    `).run(consultationId, patientId, doctorId, serviceType, paymentId, bookedAt);

    db.prepare(`
      UPDATE doctors SET status = 'busy', booked_patient_id = ? WHERE id = ?
    `).run(patientId, doctorId);

    db.prepare(`
      INSERT INTO consultation_payments (id, consultation_id, patient_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, consultationId, patientId, amount, bookedAt);
  });
  tx();

  return { consultationId, paymentId, doctorId, patientId, bookedAt };
}

// ---------------------------------------------------------------------------
// TM-004: 진료 상태 전환 (booked → in_progress → completed → prescribed → reviewed)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionConsultationStatus(
  db: Database.Database,
  consultationId: string,
  newStatus: 'in_progress' | 'completed' | 'prescribed' | 'reviewed',
): { consultationId: string; previousStatus: string; newStatus: string } {
  const consultation = db
    .prepare('SELECT status FROM consultations WHERE id = ?')
    .get(consultationId) as { status: string } | undefined;

  if (!consultation) throw new TelemedicineError('E404-CONSULTATION', 'Consultation record not found', 404);

  const previousStatus = consultation.status;
  const allowed =
    (consultation.status === 'booked' && newStatus === 'in_progress') ||
    (consultation.status === 'in_progress' && newStatus === 'completed') ||
    (consultation.status === 'completed' && newStatus === 'prescribed') ||
    (consultation.status === 'prescribed' && newStatus === 'reviewed');

  if (!allowed) {
    throw new TelemedicineError(
      'E409-CONSULTATION',
      `Cannot transition consultation from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE consultations SET status = ? WHERE id = ?`).run(newStatus, consultationId);

  return { consultationId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// TM-005: 처방전 만료 일괄 처리 (batch prescription expiry marking)
// (StatusTransition detector — batch 패턴, BT-005 33번째 재사용)
// ---------------------------------------------------------------------------
export function markPrescriptionExpiryBatch(
  db: Database.Database,
  expiredBefore: string,
): { markedCount: number; markedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM prescriptions
      WHERE status = 'active'
        AND valid_until <= ?
    `)
    .all(expiredBefore) as Array<{ id: string }>;

  const markedIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE prescriptions
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    markedIds.push(item.id);
  }

  return { markedCount: markedIds.length, markedIds };
}

// ---------------------------------------------------------------------------
// TM-006: 진료비 정산 atomic — 매출 + 진료수가 + 정산 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processBilling(
  db: Database.Database,
  doctorId: string,
  consultationId: string,
  revenue: number,
  billingRate: number,
): { billingId: string; payoutId: string; doctorId: string; billingAmount: number; settledAt: string } {
  const consultation = db
    .prepare("SELECT status FROM consultations WHERE id = ? AND status = 'completed'")
    .get(consultationId) as { status: string } | undefined;

  if (!consultation) throw new TelemedicineError('E404-COMPLETED-CONSULTATION', 'Completed consultation not found', 404);

  const billingId = randomUUID();
  const payoutId = randomUUID();
  const billingAmount = Math.round(revenue * billingRate * 100) / 100;
  const settledAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO billing_records (id, doctor_id, consultation_id, revenue, billing_rate, billing_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(billingId, doctorId, consultationId, revenue, billingRate, billingAmount);

    db.prepare(`
      INSERT INTO payouts (id, billing_id, doctor_id, amount, status, settled_at)
      VALUES (?, ?, ?, ?, 'settled', ?)
    `).run(payoutId, billingId, doctorId, billingAmount, settledAt);

    db.prepare(`
      UPDATE billing_records SET status = 'settled' WHERE id = ?
    `).run(billingId);
  });
  tx();

  return { billingId, payoutId, doctorId, billingAmount, settledAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class TelemedicineError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'TelemedicineError';
  }
}
