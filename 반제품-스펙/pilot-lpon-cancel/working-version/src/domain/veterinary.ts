import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-VT (VT-001~VT-006): Veterinary 합성 도메인 — 45번째 도메인 (동물병원 진료 산업, 34번째 신규 산업)
//   - veterinary spec-container rules.md 기반 PoC source
//   - 합성 schema: appointment_slots, slot_bookings, pet_subscriptions,
//                  appointments, veterinarians, appointment_payments,
//                  medical_records, vet_billing_records, vet_payouts
//   - 동물병원 진료 lifecycle 패턴 — 슬롯정원/백신한도/진료atomic/상태전환/의무기록만료배치/정산atomic
//   - withRuleId 재사용 45번째 도메인 (신규 detector 0개, 46 Sprint 연속 정점 도전)
//   - VeterinaryError code-in-message 패턴 (S275 표준)
//   - 34 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT)
//   - 34번째 신규 산업 마일스톤 (veterinary 추가, PT+VT 동물 케어 2-클러스터 형성)
// ---------------------------------------------------------------------------

export interface AppointmentSlotRow {
  id: string;
  veterinarian_id: string;
  slot_name: string;
  capacity: number;
  booked_count: number;
  status: string;   // available | reserved | in_use | maintenance
}

export interface SlotBookingRow {
  id: string;
  pet_id: string;
  slot_id: string;
  status: string;       // scheduled | confirmed | in_progress | completed | cancelled
  booked_at: string;
}

export interface PetSubscriptionRow {
  id: string;
  pet_id: string;
  tier_code: string;        // basic | standard | premium | corporate
  vaccine_limit: number;
  vaccine_usage: number;
  valid_until: string;
}

export interface AppointmentRow {
  id: string;
  pet_id: string;
  veterinarian_id: string;
  service_type: string;
  payment_id: string | null;
  status: string;           // scheduled | in_progress | completed | billed | reviewed
  booked_at: string;
}

export interface MedicalRecordRow {
  id: string;
  appointment_id: string;
  diagnosis_code: string;
  prescribed_at: string;
  archive_eligible_at: string;
  status: string;   // active | archived | purged
}

export interface VetBillingRecordRow {
  id: string;
  veterinarian_id: string;
  appointment_id: string;
  revenue: number;
  billing_rate: number;
  billing_amount: number;
  status: string;   // pending | calculated | settled
}

const MAX_APPOINTMENT_CAPACITY = 20; // VT-001: 진료 예약 슬롯 정원 한도 (인원, 기본값)

// ---------------------------------------------------------------------------
// VT-001: 진료 예약 슬롯 정원 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function bookAppointmentSlot(
  db: Database.Database,
  slotId: string,
  petId: string,
): { bookingId: string; slotId: string; petId: string; bookedAt: string } {
  const slot = db
    .prepare('SELECT booked_count, capacity FROM appointment_slots WHERE id = ?')
    .get(slotId) as { booked_count: number; capacity: number } | undefined;

  if (!slot) throw new VeterinaryError('E404-SLOT', 'Appointment slot not found', 404);

  const limit = slot.capacity ?? MAX_APPOINTMENT_CAPACITY;

  if (slot.booked_count >= limit) {
    throw new VeterinaryError(
      'E422-SLOT-CAPACITY-EXCEEDED',
      `Slot is fully booked (${slot.booked_count} >= ${limit})`,
      422,
    );
  }

  const bookingId = randomUUID();
  const bookedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO slot_bookings (id, pet_id, slot_id, status, booked_at)
    VALUES (?, ?, ?, 'scheduled', ?)
  `).run(bookingId, petId, slotId, bookedAt);

  db.prepare(`
    UPDATE appointment_slots SET booked_count = booked_count + 1 WHERE id = ?
  `).run(slotId);

  return { bookingId, slotId, petId, bookedAt };
}

// ---------------------------------------------------------------------------
// VT-002: 반려동물 구독 백신 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, vaccineLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyVaccineLimit(
  db: Database.Database,
  petId: string,
  subscriptionId: string,
): { petId: string; subscriptionId: string; vaccineLimit: number; approved: boolean } {
  const subscription = db
    .prepare('SELECT vaccine_usage, vaccine_limit FROM pet_subscriptions WHERE id = ? AND pet_id = ? LIMIT 1')
    .get(subscriptionId, petId) as { vaccine_usage: number; vaccine_limit: number } | undefined;

  if (!subscription) throw new VeterinaryError('E404-SUBSCRIPTION', 'Pet subscription not found', 404);

  // F445 Path B: var-vs-var, left=`vaccineLimit` (`limit` keyword 매칭)
  const vaccineLimit = subscription.vaccine_limit;

  if (subscription.vaccine_usage >= vaccineLimit) {
    throw new VeterinaryError(
      'E422-VACCINE-LIMIT-EXCEEDED',
      `Vaccine quota exhausted (${subscription.vaccine_usage} >= ${vaccineLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE pet_subscriptions SET vaccine_usage = vaccine_usage + 1 WHERE id = ?
  `).run(subscriptionId);

  return { petId, subscriptionId, vaccineLimit, approved: true };
}

// ---------------------------------------------------------------------------
// VT-003: 동물병원 진료 예약 atomic — 진료 + 수의사 점유 + 결제 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function confirmAppointment(
  db: Database.Database,
  petId: string,
  veterinarianId: string,
  serviceType: string,
  amount: number,
): { appointmentId: string; paymentId: string; veterinarianId: string; petId: string; bookedAt: string } {
  const veterinarian = db
    .prepare("SELECT status FROM veterinarians WHERE id = ? AND status = 'available'")
    .get(veterinarianId) as { status: string } | undefined;

  if (!veterinarian) throw new VeterinaryError('E404-VETERINARIAN', 'Veterinarian not available', 404);

  const appointmentId = randomUUID();
  const paymentId = randomUUID();
  const bookedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO appointments (id, pet_id, veterinarian_id, service_type, payment_id, status, booked_at)
      VALUES (?, ?, ?, ?, ?, 'scheduled', ?)
    `).run(appointmentId, petId, veterinarianId, serviceType, paymentId, bookedAt);

    db.prepare(`
      UPDATE veterinarians SET status = 'busy', booked_pet_id = ? WHERE id = ?
    `).run(petId, veterinarianId);

    db.prepare(`
      INSERT INTO appointment_payments (id, appointment_id, pet_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, appointmentId, petId, amount, bookedAt);
  });
  tx();

  return { appointmentId, paymentId, veterinarianId, petId, bookedAt };
}

// ---------------------------------------------------------------------------
// VT-004: 진료 상태 전환 (scheduled → in_progress → completed → billed → reviewed)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionAppointmentStatus(
  db: Database.Database,
  appointmentId: string,
  newStatus: 'in_progress' | 'completed' | 'billed' | 'reviewed',
): { appointmentId: string; previousStatus: string; newStatus: string } {
  const appointment = db
    .prepare('SELECT status FROM appointments WHERE id = ?')
    .get(appointmentId) as { status: string } | undefined;

  if (!appointment) throw new VeterinaryError('E404-APPOINTMENT', 'Appointment record not found', 404);

  const previousStatus = appointment.status;
  const allowed =
    (appointment.status === 'scheduled' && newStatus === 'in_progress') ||
    (appointment.status === 'in_progress' && newStatus === 'completed') ||
    (appointment.status === 'completed' && newStatus === 'billed') ||
    (appointment.status === 'billed' && newStatus === 'reviewed');

  if (!allowed) {
    throw new VeterinaryError(
      'E409-APPOINTMENT',
      `Cannot transition appointment from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE appointments SET status = ? WHERE id = ?`).run(newStatus, appointmentId);

  return { appointmentId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// VT-005: 의무기록 만료 일괄 처리 (batch medical record archive marking)
// (StatusTransition detector — batch 패턴, BT-005/TM-005 34번째 재사용)
// ---------------------------------------------------------------------------
export function markMedicalRecordArchiveBatch(
  db: Database.Database,
  expiredBefore: string,
): { markedCount: number; markedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM medical_records
      WHERE status = 'active'
        AND archive_eligible_at <= ?
    `)
    .all(expiredBefore) as Array<{ id: string }>;

  const markedIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE medical_records
      SET status = 'archived'
      WHERE id = ?
    `).run(item.id);
    markedIds.push(item.id);
  }

  return { markedCount: markedIds.length, markedIds };
}

// ---------------------------------------------------------------------------
// VT-006: 동물병원 정산 atomic — 매출 + 진료수가 + 정산 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processVeterinaryBilling(
  db: Database.Database,
  veterinarianId: string,
  appointmentId: string,
  revenue: number,
  billingRate: number,
): { billingId: string; payoutId: string; veterinarianId: string; billingAmount: number; settledAt: string } {
  const appointment = db
    .prepare("SELECT status FROM appointments WHERE id = ? AND status = 'completed'")
    .get(appointmentId) as { status: string } | undefined;

  if (!appointment) throw new VeterinaryError('E404-COMPLETED-APPOINTMENT', 'Completed appointment not found', 404);

  const billingId = randomUUID();
  const payoutId = randomUUID();
  const billingAmount = Math.round(revenue * billingRate * 100) / 100;
  const settledAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO vet_billing_records (id, veterinarian_id, appointment_id, revenue, billing_rate, billing_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(billingId, veterinarianId, appointmentId, revenue, billingRate, billingAmount);

    db.prepare(`
      INSERT INTO vet_payouts (id, billing_id, veterinarian_id, amount, status, settled_at)
      VALUES (?, ?, ?, ?, 'settled', ?)
    `).run(payoutId, billingId, veterinarianId, billingAmount, settledAt);

    db.prepare(`
      UPDATE vet_billing_records SET status = 'settled' WHERE id = ?
    `).run(billingId);
  });
  tx();

  return { billingId, payoutId, veterinarianId, billingAmount, settledAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class VeterinaryError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'VeterinaryError';
  }
}
