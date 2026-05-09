import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-EN (EN-001~EN-006): Energy/Utility 합성 도메인 — 24번째 도메인 (에너지 산업, 13번째 신규 산업)
//   - energy spec-container rules.md 기반 PoC source
//   - 합성 schema: meters, meter_readings, billing_tiers, outage_records, overdue_accounts
//   - 에너지 lifecycle 패턴 — 계량기검침/누진요금/사용량경보/계량기상태/정전통보배치/연체정지
//   - withRuleId 재사용 24번째 도메인 (신규 detector 0개, 22 Sprint 연속 정점)
//   - EnergyError code-in-message 패턴 (S275 표준)
//   - 13 산업 연속 0 ABSENCE 목표 (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN)
// ---------------------------------------------------------------------------

export interface MeterRow {
  id: string;
  account_id: string;
  meter_type: string;  // electricity | gas | water
  status: string;      // active | reading_due | billed | paid | suspended | locked
  last_reading_kwh: number;
  installed_at: string;
}

export interface MeterReadingRow {
  id: string;
  meter_id: string;
  usage_kwh: number;
  recorded_at: string;
}

export interface BillingTierRow {
  id: string;
  tier_level: number;
  tier_usage_limit: number;
  rate_per_kwh: number;
}

export interface OutageRecordRow {
  id: string;
  account_id: string;
  outage_type: string;  // electricity | gas | water
  status: string;       // pending | notified | resolved
  occurred_at: string;
  notified_at: string | null;
}

export interface OverdueAccountRow {
  id: string;
  account_id: string;
  overdue_amount: number;
  overdue_days: number;
  suspended_at: string | null;
}

const MAX_METER_USAGE_KWH = 50_000;  // EN-001: 계량기 최대 사용량
const MAX_OVERDUE_DAYS = 90;          // EN-006: 연체 최대 허용일 (초과 시 suspend)

// ---------------------------------------------------------------------------
// EN-001: 계량기 검침 — 사용량 한도 검증 (peak limit)
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function recordMeterReading(
  db: Database.Database,
  meterId: string,
  usageKwh: number,
): { readingId: string; usageKwh: number; recordedAt: string } {
  if (usageKwh < 0) {
    throw new EnergyError('E422-USAGE-NEG', `Usage cannot be negative (${usageKwh})`, 422);
  }
  if (usageKwh > MAX_METER_USAGE_KWH) {
    throw new EnergyError('E422-USAGE-MAX', `Usage exceeds peak limit (${usageKwh} > ${MAX_METER_USAGE_KWH})`, 422);
  }

  const meter = db
    .prepare('SELECT id, status FROM meters WHERE id = ?')
    .get(meterId) as { id: string; status: string } | undefined;

  if (!meter) throw new EnergyError('E404-METER', 'Meter not found', 404);
  if (meter.status === 'suspended' || meter.status === 'locked') {
    throw new EnergyError('E409-METER', `Cannot record reading for meter with status=${meter.status}`, 409);
  }

  const readingId = randomUUID();
  const recordedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO meter_readings (id, meter_id, usage_kwh, recorded_at)
    VALUES (?, ?, ?, ?)
  `).run(readingId, meterId, usageKwh, recordedAt);

  db.prepare(`UPDATE meters SET last_reading_kwh = ? WHERE id = ?`)
    .run(usageKwh, meterId);

  return { readingId, usageKwh, recordedAt };
}

// ---------------------------------------------------------------------------
// EN-002: 누진 요금 구간 계산 — 누진 구간 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, currentUsage > tierUsageLimit 'limit' keyword 매칭)
// ---------------------------------------------------------------------------
export function computeBillingTier(
  db: Database.Database,
  meterId: string,
  currentUsage: number,
): { tierId: string; tierLevel: number; ratePerKwh: number; billingAmount: number } {
  const tiers = db
    .prepare('SELECT * FROM billing_tiers ORDER BY tier_level ASC')
    .all() as BillingTierRow[];

  if (tiers.length === 0) {
    throw new EnergyError('E404-TIER', 'No billing tiers configured', 404);
  }

  // F445 Path B: var-vs-var, left=`tierUsageLimit` (`limit` keyword 매칭)
  let selectedTier = tiers[tiers.length - 1]!;
  for (const tier of tiers) {
    const tierUsageLimit = tier.tier_usage_limit;
    if (currentUsage <= tierUsageLimit) {
      selectedTier = tier;
      break;
    }
  }

  const billingAmount = Math.round(currentUsage * selectedTier.rate_per_kwh * 100) / 100;

  db.prepare(`UPDATE meters SET status = 'billed' WHERE id = ? AND status = 'reading_due'`)
    .run(meterId);

  return {
    tierId: selectedTier.id,
    tierLevel: selectedTier.tier_level,
    ratePerKwh: selectedTier.rate_per_kwh,
    billingAmount,
  };
}

// ---------------------------------------------------------------------------
// EN-003: 사용량 경보 트리거 — 사용량 초과 + alert 발송 atomic
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function triggerUsageAlert(
  db: Database.Database,
  meterId: string,
  currentUsage: number,
  alertThresholdKwh: number,
): { alertId: string; meterId: string; triggeredAt: string } {
  if (currentUsage <= alertThresholdKwh) {
    throw new EnergyError(
      'E422-ALERT-THRESHOLD',
      `Usage (${currentUsage}) does not exceed alert threshold (${alertThresholdKwh})`,
      422,
    );
  }

  const meter = db
    .prepare('SELECT id FROM meters WHERE id = ?')
    .get(meterId) as { id: string } | undefined;

  if (!meter) throw new EnergyError('E404-METER', 'Meter not found', 404);

  const alertId = randomUUID();
  const triggeredAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO meter_readings (id, meter_id, usage_kwh, recorded_at)
      VALUES (?, ?, ?, ?)
    `).run(randomUUID(), meterId, currentUsage, triggeredAt);
    db.prepare(`
      INSERT INTO outage_records (id, account_id, outage_type, status, occurred_at)
      SELECT ?, account_id, 'electricity', 'pending', ?
      FROM meters WHERE id = ?
    `).run(alertId, triggeredAt, meterId);
  });
  tx();

  return { alertId, meterId, triggeredAt };
}

// ---------------------------------------------------------------------------
// EN-004: 계량기 상태 전환 (active → reading_due → billed → paid)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionMeterStatus(
  db: Database.Database,
  meterId: string,
  newStatus: 'reading_due' | 'billed' | 'paid' | 'active',
): { meterId: string; previousStatus: string; newStatus: string } {
  const meter = db
    .prepare('SELECT status FROM meters WHERE id = ?')
    .get(meterId) as { status: string } | undefined;

  if (!meter) throw new EnergyError('E404-METER', 'Meter not found', 404);

  const previousStatus = meter.status;
  const allowed =
    (previousStatus === 'active' && newStatus === 'reading_due') ||
    (previousStatus === 'reading_due' && newStatus === 'billed') ||
    (previousStatus === 'billed' && newStatus === 'paid') ||
    (previousStatus === 'paid' && newStatus === 'active');

  if (!allowed) {
    throw new EnergyError(
      'E409-METER',
      `Cannot transition meter from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE meters SET status = ? WHERE id = ?`).run(newStatus, meterId);

  return { meterId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// EN-005: 정전 일괄 통보 갱신 (pending → notified 배치)
// (StatusTransition detector — batch 패턴, CC/DV/SB/IN/HC/ED/RE/LG/HO/TR/MF/RT-005 동일 형태 13번째)
// ---------------------------------------------------------------------------
export function markOutageNotified(
  db: Database.Database,
  accountId: string,
): { notifiedCount: number; notifiedIds: string[] } {
  const candidates = db
    .prepare(`SELECT id FROM outage_records WHERE status = 'pending' AND account_id = ?`)
    .all(accountId) as Array<{ id: string }>;

  const notifiedIds: string[] = [];
  const notifiedAt = new Date().toISOString();

  for (const record of candidates) {
    db.prepare(`UPDATE outage_records SET status = 'notified', notified_at = ? WHERE id = ?`)
      .run(notifiedAt, record.id);
    notifiedIds.push(record.id);
  }

  return { notifiedCount: notifiedIds.length, notifiedIds };
}

// ---------------------------------------------------------------------------
// EN-006: 연체 정지 처리 — 연체 확인 + suspend + meter lockout atomic
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processOverdueSuspension(
  db: Database.Database,
  accountId: string,
): { overdueId: string; meterId: string; suspendedAt: string } {
  const overdue = db
    .prepare('SELECT * FROM overdue_accounts WHERE account_id = ? AND suspended_at IS NULL')
    .get(accountId) as OverdueAccountRow | undefined;

  if (!overdue) {
    throw new EnergyError('E404-OVERDUE', 'No pending overdue record for account', 404);
  }
  if (overdue.overdue_days <= MAX_OVERDUE_DAYS) {
    throw new EnergyError(
      'E422-OVERDUE',
      `Overdue days (${overdue.overdue_days}) within grace period (<= ${MAX_OVERDUE_DAYS})`,
      422,
    );
  }

  const suspendedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE overdue_accounts SET suspended_at = ? WHERE id = ?`)
      .run(suspendedAt, overdue.id);
    db.prepare(`UPDATE meters SET status = 'suspended' WHERE account_id = ? AND status = 'active'`)
      .run(accountId);
    db.prepare(`UPDATE meters SET status = 'locked' WHERE account_id = ? AND status = 'suspended'`)
      .run(accountId);
  });
  tx();

  const meter = db
    .prepare('SELECT id FROM meters WHERE account_id = ? AND status = \'locked\' LIMIT 1')
    .get(accountId) as { id: string } | undefined;

  return {
    overdueId: overdue.id,
    meterId: meter?.id ?? '',
    suspendedAt,
  };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class EnergyError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'EnergyError';
  }
}
