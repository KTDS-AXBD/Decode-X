import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-AD (AD-001~AD-006): Advertising 합성 도메인 — 55번째 도메인 (광고 산업, 44번째 신규 산업)
//   - advertising spec-container rules.md 기반 PoC source
//   - 합성 schema: agencies, media_contracts, campaign_bookings, impression_batches,
//                  media_payments, chargeback_refund_records, chargeback_refunds
//   - 광고 lifecycle 패턴 — 에이전시캠페인한도/미디어수수료한도/노출batchatomic/캠페인상태전환/만료캠페인일괄/환불atomic
//   - withRuleId 재사용 55번째 도메인 (신규 detector 0개, 56 Sprint 연속 정점 도전)
//   - AdvertisingError code-in-message 패턴 (S275 표준)
//   - 44 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS+MU+SH+PB+TX+AD)
//   - 44번째 신규 산업 마일스톤 (advertising 추가, 디지털 콘텐츠 3-클러스터: MU+PB+AD)
//   - 거울 변환 8회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising)
// ---------------------------------------------------------------------------

export interface AgencyRow {
  id: string;
  name: string;
  total_capacity: number;
  active_campaigns: number;
  status: string; // active | suspended | retired
}

export interface MediaContractRow {
  id: string;
  advertiser_id: string;
  agency_id: string;
  tier_code: string; // local | regional | national | global
  fee_limit: number;
  fee_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface CampaignBookingRow {
  id: string;
  agency_id: string;
  contract_id: string;
  impression_batch_id: string | null;
  media_payment_id: string | null;
  status: string; // proposed | approved | live | paused | ended | canceled
  booked_at: string;
}

export interface ImpressionBatchRow {
  id: string;
  agency_id: string;
  booking_id: string;
  slot_no: string;
  status: string; // live | paused | ended | canceled | expired
  served_at: string;
}

export interface ChargebackRefundRecordRow {
  id: string;
  advertiser_id: string;
  impression_batch_id: string;
  media_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_CAMPAIGNS_PER_AGENCY = 400; // AD-001: 에이전시별 동시 캠페인 batch 한도 (기본값)

// ---------------------------------------------------------------------------
// AD-001: 에이전시 동시 캠페인 batch 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function bookCampaign(
  db: Database.Database,
  agencyId: string,
  contractId: string,
): { bookingId: string; agencyId: string; contractId: string; bookedAt: string } {
  const agency = db
    .prepare('SELECT active_campaigns, total_capacity FROM agencies WHERE id = ?')
    .get(agencyId) as { active_campaigns: number; total_capacity: number } | undefined;

  if (!agency) throw new AdvertisingError('E404-AGENCY', 'Agency not found', 404);

  const limit = agency.total_capacity ?? MAX_CONCURRENT_CAMPAIGNS_PER_AGENCY;

  if (agency.active_campaigns >= limit) {
    throw new AdvertisingError(
      'E422-AGENCY-CAPACITY-EXCEEDED',
      `Agency is at full capacity (${agency.active_campaigns} >= ${limit})`,
      422,
    );
  }

  const bookingId = randomUUID();
  const bookedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO campaign_bookings (id, agency_id, contract_id, impression_batch_id, media_payment_id, status, booked_at)
    VALUES (?, ?, ?, NULL, NULL, 'proposed', ?)
  `).run(bookingId, agencyId, contractId, bookedAt);

  db.prepare(`
    UPDATE agencies SET active_campaigns = active_campaigns + 1 WHERE id = ?
  `).run(agencyId);

  return { bookingId, agencyId, contractId, bookedAt };
}

// ---------------------------------------------------------------------------
// AD-002: 광고주 미디어 수수료 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, mediaFeePaymentLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyMediaFeeTier(
  db: Database.Database,
  advertiserId: string,
  contractId: string,
  fee: number,
): { advertiserId: string; contractId: string; mediaFeePaymentLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT fee_used, fee_limit FROM media_contracts WHERE id = ? AND advertiser_id = ? LIMIT 1')
    .get(contractId, advertiserId) as { fee_used: number; fee_limit: number } | undefined;

  if (!contract) throw new AdvertisingError('E404-CONTRACT', 'Media contract not found', 404);

  // F445 Path B: var-vs-var, left=`mediaFeePaymentLimit` (`limit` keyword 매칭)
  const mediaFeePaymentLimit = contract.fee_limit;

  if (contract.fee_used + fee >= mediaFeePaymentLimit) {
    throw new AdvertisingError(
      'E422-MEDIA-FEE-PAYMENT-LIMIT-EXCEEDED',
      `Media fee payment quota exhausted (${contract.fee_used + fee} >= ${mediaFeePaymentLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE media_contracts SET fee_used = fee_used + ? WHERE id = ?
  `).run(fee, contractId);

  return { advertiserId, contractId, mediaFeePaymentLimit, approved: true };
}

// ---------------------------------------------------------------------------
// AD-003: 노출 batch atomic — impression_batches + campaign_bookings 상태전환 + media_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processImpressionBatch(
  db: Database.Database,
  agencyId: string,
  bookingId: string,
  slotNo: string,
  amount: number,
): { impressionBatchId: string; mediaPaymentId: string; bookingId: string; agencyId: string; servedAt: string } {
  const booking = db
    .prepare("SELECT status FROM campaign_bookings WHERE id = ? AND status = 'approved'")
    .get(bookingId) as { status: string } | undefined;

  if (!booking) throw new AdvertisingError('E404-BOOKING', 'Approved campaign booking not found', 404);

  const impressionBatchId = randomUUID();
  const mediaPaymentId = randomUUID();
  const servedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO impression_batches (id, agency_id, booking_id, slot_no, status, served_at)
      VALUES (?, ?, ?, ?, 'live', ?)
    `).run(impressionBatchId, agencyId, bookingId, slotNo, servedAt);

    db.prepare(`
      UPDATE campaign_bookings SET status = 'live', impression_batch_id = ?, media_payment_id = ? WHERE id = ?
    `).run(impressionBatchId, mediaPaymentId, bookingId);

    db.prepare(`
      INSERT INTO media_payments (id, booking_id, impression_batch_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(mediaPaymentId, bookingId, impressionBatchId, amount, servedAt);
  });
  tx();

  return { impressionBatchId, mediaPaymentId, bookingId, agencyId, servedAt };
}

// ---------------------------------------------------------------------------
// AD-004: 캠페인 상태 전환 (proposed → approved → live → paused → ended/canceled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionCampaignStatus(
  db: Database.Database,
  bookingId: string,
  newStatus: 'approved' | 'live' | 'paused' | 'ended' | 'canceled',
): { bookingId: string; previousStatus: string; newStatus: string } {
  const booking = db
    .prepare('SELECT status FROM campaign_bookings WHERE id = ?')
    .get(bookingId) as { status: string } | undefined;

  if (!booking) throw new AdvertisingError('E404-BOOKING', 'Campaign booking not found', 404);

  const previousStatus = booking.status;
  const allowed =
    (booking.status === 'proposed' && newStatus === 'approved') ||
    (booking.status === 'approved' && newStatus === 'live') ||
    (booking.status === 'live' && newStatus === 'paused') ||
    (booking.status === 'paused' && newStatus === 'live') ||
    (booking.status === 'live' && newStatus === 'ended') ||
    (booking.status === 'paused' && newStatus === 'ended') ||
    (booking.status === 'proposed' && newStatus === 'canceled') ||
    (booking.status === 'approved' && newStatus === 'canceled');

  if (!allowed) {
    throw new AdvertisingError(
      'E409-BOOKING',
      `Cannot transition campaign booking from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE campaign_bookings SET status = ? WHERE id = ?`).run(newStatus, bookingId);

  return { bookingId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// AD-005: 만료 ended 캠페인 batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SH-005/MU-005/PB-005/TX-005 44번째 재사용)
// ---------------------------------------------------------------------------
export function expireEndedCampaignBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM impression_batches
      WHERE status = 'ended'
        AND served_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE impression_batches
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// AD-006: 환불 (chargeback) atomic — 미디어 비용 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processChargebackRefund(
  db: Database.Database,
  advertiserId: string,
  impressionBatchId: string,
  mediaCost: number,
  refundRate: number,
): { chargebackRefundId: string; refundId: string; advertiserId: string; refundAmount: number; refundedAt: string } {
  const impressionBatch = db
    .prepare("SELECT status FROM impression_batches WHERE id = ? AND status = 'canceled'")
    .get(impressionBatchId) as { status: string } | undefined;

  if (!impressionBatch) throw new AdvertisingError('E404-CANCELED-BATCH', 'Canceled impression batch not found', 404);

  const chargebackRefundId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(mediaCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO chargeback_refund_records (id, advertiser_id, impression_batch_id, media_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(chargebackRefundId, advertiserId, impressionBatchId, mediaCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO chargeback_refunds (id, chargeback_refund_id, advertiser_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, chargebackRefundId, advertiserId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE chargeback_refund_records SET status = 'refunded' WHERE id = ?
    `).run(chargebackRefundId);
  });
  tx();

  return { chargebackRefundId, refundId, advertiserId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class AdvertisingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'AdvertisingError';
  }
}
