import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-HC (HC-001~HC-006): Healthcare 합성 도메인 — 16번째 도메인 (의료 산업, 5번째 신규 산업)
//   - healthcare spec-container rules.md 기반 PoC source
//   - 합성 schema: patients, appointments, prescriptions, slots
//   - 의료 lifecycle 패턴 — 환자등록/처방한도/예약/상태/약제만료/환불
//   - withRuleId 재사용 16번째 도메인 (신규 detector 0개, 14 Sprint 연속 정점)
//   - HealthcareError code-in-message 패턴 (S275 표준)
//   - detector 신뢰도 5 Sprint cascade(S278~S282) + 4 산업 연속 입증(S278+S283+S284+S285) 활용
// ---------------------------------------------------------------------------

export interface PatientRow {
  id: string;
  user_id: string;
  patient_age: number;
  insurance_id: string | null;
  status: string;             // active | inactive | deceased
  registered_at: string;
}

export interface AppointmentRow {
  id: string;
  patient_id: string;
  doctor_id: string;
  slot_id: string;
  fee_krw: number;
  status: string;             // booked | checked_in | completed | cancelled | no_show
  scheduled_at: string;
  cancelled_at: string | null;
}

export interface PrescriptionRow {
  id: string;
  patient_id: string;
  drug_code: string;
  daily_dosage_mg: number;
  duration_days: number;
  status: string;             // active | dispensed | expired
  prescribed_at: string;
  expires_at: string;
}

const MIN_PATIENT_AGE = 0;
const MAX_PATIENT_AGE = 130;
const MAX_DAILY_DOSAGE_MG = 5_000;
const PRESCRIPTION_VALIDITY_DAYS = 30;
const REFUND_HOURS_BEFORE = 24;

// ---------------------------------------------------------------------------
// HC-001: 환자 등록 (0 ≤ age ≤ 130)
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function registerPatient(
  db: Database.Database,
  userId: string,
  patientAge: number,
  insuranceId: string | null,
): { patientId: string; status: string } {
  if (patientAge < MIN_PATIENT_AGE) {
    throw new HealthcareError('E422-AGE-MIN', `Age below minimum (${patientAge} < ${MIN_PATIENT_AGE})`, 422);
  }
  if (patientAge > MAX_PATIENT_AGE) {
    throw new HealthcareError('E422-AGE-MAX', `Age above maximum (${patientAge} > ${MAX_PATIENT_AGE})`, 422);
  }

  const patientId = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO patients (id, user_id, patient_age, insurance_id, status, registered_at)
    VALUES (?, ?, ?, ?, 'active', ?)
  `).run(patientId, userId, patientAge, insuranceId, now);

  return { patientId, status: 'active' };
}

// ---------------------------------------------------------------------------
// HC-002: 처방 일일 한도 검증 (daily_dosage ≤ MAX_DAILY_DOSAGE_MG)
// (ThresholdCheck detector — F445 Path B var-vs-var, dosage_limit ≥ requested_dosage)
// ---------------------------------------------------------------------------
export function checkDosageLimit(
  db: Database.Database,
  patientId: string,
  drugCode: string,
  requestedDosageMg: number,
): { canPrescribe: boolean; remainingDosageHeadroom: number } {
  const patient = db
    .prepare('SELECT status FROM patients WHERE id = ?')
    .get(patientId) as { status: string } | undefined;

  if (!patient) {
    throw new HealthcareError('E404-PT', 'Patient not found', 404);
  }
  if (patient.status !== 'active') {
    throw new HealthcareError('E409-ST', `Patient not active (status=${patient.status})`, 409);
  }

  // 현재 active 처방의 dosage 합산
  const activeDosage = db
    .prepare(`
      SELECT COALESCE(SUM(daily_dosage_mg), 0) AS total
      FROM prescriptions
      WHERE patient_id = ? AND drug_code = ? AND status = 'active'
    `)
    .get(patientId, drugCode) as { total: number };

  const dosageLimit = MAX_DAILY_DOSAGE_MG - activeDosage.total;
  // F445 Path B: var-vs-var, left=`dosageLimit` (`limit` keyword 매칭)
  if (dosageLimit < requestedDosageMg) {
    throw new HealthcareError('E422-LIMIT', `Daily dosage limit exceeded (${requestedDosageMg} > ${dosageLimit})`, 422);
  }
  return { canPrescribe: true, remainingDosageHeadroom: dosageLimit - requestedDosageMg };
}

// ---------------------------------------------------------------------------
// HC-003: 예약 잡기 atomic (appointment INSERT + slot 예약 UPDATE)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function bookAppointment(
  db: Database.Database,
  patientId: string,
  doctorId: string,
  slotId: string,
  feeKrw: number,
): { appointmentId: string; scheduledAt: string } {
  const slot = db
    .prepare('SELECT id, scheduled_at, status FROM slots WHERE id = ?')
    .get(slotId) as { id: string; scheduled_at: string; status: string } | undefined;

  if (!slot) throw new HealthcareError('E404-SL', 'Slot not found', 404);
  if (slot.status !== 'available') {
    throw new HealthcareError('E409-SL', `Slot not available (status=${slot.status})`, 409);
  }

  const appointmentId = randomUUID();
  const scheduledAt = slot.scheduled_at;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO appointments (id, patient_id, doctor_id, slot_id, fee_krw, status, scheduled_at, cancelled_at)
      VALUES (?, ?, ?, ?, ?, 'booked', ?, NULL)
    `).run(appointmentId, patientId, doctorId, slotId, feeKrw, scheduledAt);
    db.prepare(`UPDATE slots SET status = 'reserved' WHERE id = ?`)
      .run(slotId);
  });
  tx();

  return { appointmentId, scheduledAt };
}

// ---------------------------------------------------------------------------
// HC-004: 예약 상태 전환 (booked → checked_in → completed / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionAppointmentStatus(
  db: Database.Database,
  appointmentId: string,
  newStatus: 'checked_in' | 'completed' | 'cancelled' | 'no_show',
): { appointmentId: string; previousStatus: string; newStatus: string } {
  const appointment = db
    .prepare('SELECT status FROM appointments WHERE id = ?')
    .get(appointmentId) as { status: string } | undefined;

  if (!appointment) throw new HealthcareError('E404-AP', 'Appointment not found', 404);

  const previousStatus = appointment.status;
  // 허용 전환 매트릭스
  const allowed =
    (previousStatus === 'booked' && ['checked_in', 'cancelled', 'no_show'].includes(newStatus)) ||
    (previousStatus === 'checked_in' && ['completed', 'cancelled'].includes(newStatus));

  if (!allowed) {
    throw new HealthcareError('E409-TR', `Cannot transition from ${previousStatus} to ${newStatus}`, 409);
  }

  const cancelledAt = newStatus === 'cancelled' ? new Date().toISOString() : null;
  if (cancelledAt) {
    db.prepare(`UPDATE appointments SET status = ?, cancelled_at = ? WHERE id = ?`)
      .run(newStatus, cancelledAt, appointmentId);
  } else {
    db.prepare(`UPDATE appointments SET status = ? WHERE id = ?`)
      .run(newStatus, appointmentId);
  }

  return { appointmentId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// HC-005: 약제 만료 자동 처리 (expires_at < now → status='expired' batch)
// (StatusTransition detector — batch 패턴, CC-005/DV-005/SB-005/IN-005 동일 형태 5번째)
// ---------------------------------------------------------------------------
export function markExpiredPrescriptions(
  db: Database.Database,
  asOfDate: string = new Date().toISOString(),
): { markedCount: number; expiredPrescriptionIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM prescriptions
      WHERE status = 'active'
        AND expires_at < ?
    `)
    .all(asOfDate) as Array<{ id: string }>;

  const expiredPrescriptionIds: string[] = [];
  for (const p of candidates) {
    db.prepare(`UPDATE prescriptions SET status = 'expired' WHERE id = ?`)
      .run(p.id);
    expiredPrescriptionIds.push(p.id);
  }

  return { markedCount: expiredPrescriptionIds.length, expiredPrescriptionIds };
}

// ---------------------------------------------------------------------------
// HC-006: 예약 취소 + 환불 atomic (24시간 이전 시 100% 환불)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function cancelAppointmentWithRefund(
  db: Database.Database,
  appointmentId: string,
  reason: string,
): { refundAmount: number; cancelledAt: string; slotReleased: boolean } {
  const appointment = db
    .prepare('SELECT slot_id, fee_krw, scheduled_at, status FROM appointments WHERE id = ?')
    .get(appointmentId) as { slot_id: string; fee_krw: number; scheduled_at: string; status: string } | undefined;

  if (!appointment) throw new HealthcareError('E404-AP', 'Appointment not found', 404);
  if (!['booked', 'checked_in'].includes(appointment.status)) {
    throw new HealthcareError('E409-AP', `Cannot cancel status=${appointment.status}`, 409);
  }

  const scheduledDate = new Date(appointment.scheduled_at);
  const now = new Date();
  const hoursBefore = (scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60);

  // 24시간 이전 취소 시 100% 환불, 미만 시 0원
  const refundAmount = hoursBefore >= REFUND_HOURS_BEFORE ? appointment.fee_krw : 0;
  const cancelledAt = now.toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE appointments SET status = 'cancelled', cancelled_at = ? WHERE id = ?`)
      .run(cancelledAt, appointmentId);
    db.prepare(`UPDATE slots SET status = 'available' WHERE id = ?`)
      .run(appointment.slot_id);
  });
  tx();

  void reason;
  return { refundAmount, cancelledAt, slotReleased: true };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class HealthcareError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'HealthcareError';
  }
}

// _PRESCRIPTION_VALIDITY_DAYS reference (안 쓰면 lint warn)
void PRESCRIPTION_VALIDITY_DAYS;
