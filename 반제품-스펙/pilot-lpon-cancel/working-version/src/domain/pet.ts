import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-PT (PT-001~PT-006): Pet Services 합성 도메인 — 40번째 도메인 (반려동물 산업, 29번째 신규 산업)
//   - pet spec-container rules.md 기반 PoC source
//   - 합성 schema: boardings, vaccines, pet_packages, groomings,
//                  grooming_payments, care_records, health_records, emergencies
//   - 반려동물 서비스 lifecycle 패턴 — 정원한도/백신한도/그루밍atomic/케어상태전환/건강기록배치/응급atomic
//   - withRuleId 재사용 40번째 도메인 (신규 detector 0개, 38 Sprint 연속 정점)
//   - PetError code-in-message 패턴 (S275 표준)
//   - 29 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT)
//   - 29번째 신규 산업 마일스톤 (pet services 추가, 동물병원+미용 클러스터 HC+WL+PT 형성)
//   - 6 BLs 균형 패턴 30번째 정착 (round number 마일스톤)
// ---------------------------------------------------------------------------

export interface BoardingRow {
  id: string;
  facility_id: string;
  pet_id: string;
  check_in_date: string;
  check_out_date: string;
  capacity: number;
  booked_count: number;
  status: string;  // available | full | in_progress | completed | cancelled
}

export interface VaccineRow {
  id: string;
  pet_id: string;
  vaccine_type: string;
  administered_count: number;
  vaccinationLimit: number;
  valid_until: string;
}

export interface PetPackageRow {
  id: string;
  pet_id: string;
  owner_id: string;
  package_type: string;  // basic | premium | elite | vip
  used_count: number;
  package_usage_limit: number;
  valid_until: string;
}

export interface GroomingRow {
  id: string;
  pet_id: string;
  owner_id: string;
  groomer_id: string;
  package_id: string | null;
  scheduled_at: string;
  status: string;       // booked | confirmed | in_grooming | completed | reviewed | cancelled
  booked_at: string;
  confirmed_at: string | null;
}

export interface CareRecordRow {
  id: string;
  pet_id: string;
  grooming_id: string;
  status: string;       // booked | checked_in | in_care | checked_out | reviewed | cancelled
  created_at: string;
  updated_at: string;
}

export interface HealthRecordRow {
  id: string;
  pet_id: string;
  facility_id: string;
  visit_date: string;
  status: string;  // pending | processed | archived
}

export interface EmergencyRow {
  id: string;
  pet_id: string;
  owner_id: string;
  facility_id: string;
  severity: string;  // low | medium | high | critical
  status: string;    // reported | treating | resolved | referred
  reported_at: string;
}

const MAX_BOARDING_CAPACITY = 30; // PT-001: 펫호텔 정원 한도 (마리, 기본값)

// ---------------------------------------------------------------------------
// PT-001: 펫호텔 정원 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function bookBoarding(
  db: Database.Database,
  facilityId: string,
  petId: string,
  ownerId: string,
): { boardingId: string; facilityId: string; petId: string; bookedAt: string } {
  const facility = db
    .prepare('SELECT booked_count, capacity FROM boardings WHERE facility_id = ? AND status = ? LIMIT 1')
    .get(facilityId, 'available') as { booked_count: number; capacity: number } | undefined;

  if (!facility) throw new PetError('E404-FACILITY', 'Boarding facility not found', 404);

  const limit = facility.capacity ?? MAX_BOARDING_CAPACITY;

  if (facility.booked_count >= limit) {
    throw new PetError(
      'E422-BOARDING-CAPACITY-EXCEEDED',
      `Boarding facility is fully booked (${facility.booked_count} >= ${limit})`,
      422,
    );
  }

  const boardingId = randomUUID();
  const bookedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO boardings (id, facility_id, pet_id, owner_id, status, booked_at)
    VALUES (?, ?, ?, ?, 'booked', ?)
  `).run(boardingId, facilityId, petId, ownerId, bookedAt);

  db.prepare(`
    UPDATE boarding_facilities SET booked_count = booked_count + 1 WHERE id = ?
  `).run(facilityId);

  return { boardingId, facilityId, petId, bookedAt };
}

// ---------------------------------------------------------------------------
// PT-002: 백신 접종 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, vaccinationLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyVaccination(
  db: Database.Database,
  petId: string,
  vaccineId: string,
): { petId: string; vaccineId: string; vaccinationLimit: number; approved: boolean } {
  const vaccine = db
    .prepare('SELECT administered_count, vaccinationLimit FROM vaccines WHERE id = ? AND pet_id = ? LIMIT 1')
    .get(vaccineId, petId) as { administered_count: number; vaccinationLimit: number } | undefined;

  if (!vaccine) throw new PetError('E404-VACCINE', 'Vaccine record not found', 404);

  // F445 Path B: var-vs-var, left=`vaccinationLimit` (`limit` keyword 매칭)
  const vaccinationLimit = vaccine.vaccinationLimit;

  if (vaccine.administered_count >= vaccinationLimit) {
    throw new PetError(
      'E422-VACCINATION-QUOTA-EXCEEDED',
      `Vaccination quota reached (${vaccine.administered_count} >= ${vaccinationLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE vaccines SET administered_count = administered_count + 1 WHERE id = ?
  `).run(vaccineId);

  return { petId, vaccineId, vaccinationLimit, approved: true };
}

// ---------------------------------------------------------------------------
// PT-003: 그루밍 예약 atomic — 예약 + 결제 + 보호자 매칭 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processGrooming(
  db: Database.Database,
  groomingId: string,
  ownerId: string,
  groomerId: string,
  amount: number,
): { groomingId: string; paymentId: string; ownerMatchId: string; ownerId: string; confirmedAt: string } {
  const grooming = db
    .prepare("SELECT status, pet_id FROM groomings WHERE id = ? AND status = 'booked'")
    .get(groomingId) as { status: string; pet_id: string } | undefined;

  if (!grooming) throw new PetError('E404-GROOMING', 'No booked grooming appointment found', 404);

  const paymentId = randomUUID();
  const ownerMatchId = randomUUID();
  const confirmedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE groomings SET status = 'confirmed', confirmed_at = ? WHERE id = ?
    `).run(confirmedAt, groomingId);

    db.prepare(`
      INSERT INTO grooming_payments (id, grooming_id, owner_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(paymentId, groomingId, ownerId, amount, confirmedAt);

    db.prepare(`
      INSERT INTO grooming_owner_matches (id, grooming_id, owner_id, groomer_id, matched_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(ownerMatchId, groomingId, ownerId, groomerId, confirmedAt);

    db.prepare(`
      UPDATE groomers SET status = 'booked' WHERE id = ?
    `).run(groomerId);
  });
  tx();

  return { groomingId, paymentId, ownerMatchId, ownerId, confirmedAt };
}

// ---------------------------------------------------------------------------
// PT-004: 케어 상태 전환 (booked → checked_in → in_care → checked_out → reviewed)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionCareStatus(
  db: Database.Database,
  careRecordId: string,
  newStatus: 'checked_in' | 'in_care' | 'checked_out' | 'reviewed',
): { careRecordId: string; previousStatus: string; newStatus: string } {
  const record = db
    .prepare('SELECT status FROM care_records WHERE id = ?')
    .get(careRecordId) as { status: string } | undefined;

  if (!record) throw new PetError('E404-CARE-RECORD', 'Care record not found', 404);

  const previousStatus = record.status;
  const allowed =
    (record.status === 'booked' && newStatus === 'checked_in') ||
    (record.status === 'checked_in' && newStatus === 'in_care') ||
    (record.status === 'in_care' && newStatus === 'checked_out') ||
    (record.status === 'checked_out' && newStatus === 'reviewed');

  if (!allowed) {
    throw new PetError(
      'E409-CARE-RECORD',
      `Cannot transition care status from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE care_records SET status = ?, updated_at = ? WHERE id = ?`).run(
    newStatus,
    new Date().toISOString(),
    careRecordId,
  );

  return { careRecordId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// PT-005: 건강 기록 일괄 처리 (batch health record archiving)
// (StatusTransition detector — batch 패턴, CC-005 29번째 재사용)
// ---------------------------------------------------------------------------
export function markHealthRecordBatch(
  db: Database.Database,
  visitBefore: string,
): { markedCount: number; markedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT hr.id FROM health_records hr
      JOIN boarding_facilities bf ON hr.facility_id = bf.id
      WHERE hr.visit_date <= ?
        AND hr.status = 'pending'
    `)
    .all(visitBefore) as Array<{ id: string }>;

  const markedIds: string[] = [];

  for (const record of candidates) {
    db.prepare(`
      UPDATE health_records
      SET status = 'processed'
      WHERE id = ?
    `).run(record.id);
    markedIds.push(record.id);
  }

  return { markedCount: markedIds.length, markedIds };
}

// ---------------------------------------------------------------------------
// PT-006: 응급 처치 + 보호자 통보 atomic 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processEmergency(
  db: Database.Database,
  petId: string,
  ownerId: string,
  facilityId: string,
  severity: string,
  treatmentNote: string,
): { emergencyId: string; treatmentId: string; notificationId: string; ownerId: string; treatedAt: string } {
  const pet = db
    .prepare('SELECT id, name FROM pets WHERE id = ?')
    .get(petId) as { id: string; name: string } | undefined;

  if (!pet) throw new PetError('E404-PET', 'Pet not found for emergency', 404);

  const emergencyId = randomUUID();
  const treatmentId = randomUUID();
  const notificationId = randomUUID();
  const treatedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO emergencies (id, pet_id, owner_id, facility_id, severity, status, reported_at)
      VALUES (?, ?, ?, ?, ?, 'treating', ?)
    `).run(emergencyId, petId, ownerId, facilityId, severity, treatedAt);

    db.prepare(`
      INSERT INTO emergency_treatments (id, emergency_id, facility_id, treatment_note, treated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(treatmentId, emergencyId, facilityId, treatmentNote, treatedAt);

    db.prepare(`
      INSERT INTO owner_notifications (id, owner_id, emergency_id, message, sent_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(notificationId, ownerId, emergencyId, `Emergency: ${severity} severity for pet ${petId}`, treatedAt);

    db.prepare(`
      UPDATE pets SET last_emergency_at = ? WHERE id = ?
    `).run(treatedAt, petId);
  });
  tx();

  return { emergencyId, treatmentId, notificationId, ownerId, treatedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class PetError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'PetError';
  }
}
