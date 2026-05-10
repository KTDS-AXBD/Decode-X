import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-CH (CH-001~CH-006): Charity 합성 도메인 — 38번째 도메인 (비영리 산업, 27번째 신규 산업)
//   - charity spec-container rules.md 기반 PoC source
//   - 합성 schema: donations, donation_receipts, grant_tiers, grants,
//                  fund_disbursements, campaigns, volunteer_schedules, tax_certificates
//   - 비영리 운용 lifecycle 패턴 — 영수증한도/보조금한도/기금원자/캠페인상태/자원봉사배치/세금증명원자
//   - withRuleId 재사용 38번째 도메인 (신규 detector 0개, 36 Sprint 연속 정점)
//   - CharityError code-in-message 패턴 (S275 표준)
//   - 27 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH)
//   - 27번째 신규 산업 마일스톤 (nonprofit 추가)
// ---------------------------------------------------------------------------

export interface DonationRow {
  id: string;
  donor_id: string;
  campaign_id: string;
  amount: number;
  payment_method: string;
  status: string;         // pending | confirmed | refunded
  donated_at: string;
}

export interface DonationReceiptRow {
  id: string;
  donation_id: string;
  donor_id: string;
  amount: number;
  issued_at: string;
}

export interface GrantTierRow {
  id: string;
  tier_code: string;     // seed | standard | major | lead
  grantTierLimit: number;
  description: string;
}

export interface GrantRow {
  id: string;
  grantee_id: string;
  tier_code: string;
  requested_amount: number;
  status: string;        // pending | approved | rejected | disbursed
  approved_at: string | null;
}

export interface FundDisbursementRow {
  id: string;
  grant_id: string;
  grantee_id: string;
  amount: number;
  status: string;        // initiated | approved | disbursed
  disbursed_at: string | null;
}

export interface CampaignRow {
  id: string;
  organization_id: string;
  campaign_code: string;
  status: string;        // draft | active | closed | reported | audited
  started_at: string | null;
  closed_at: string | null;
}

export interface VolunteerScheduleRow {
  id: string;
  volunteer_id: string;
  campaign_id: string;
  scheduled_date: string;
  status: string;        // pending | assigned | completed
  synced_at: string | null;
}

export interface TaxCertificateRow {
  id: string;
  donor_id: string;
  donation_id: string;
  certificate_number: string;
  issued_at: string;
  reported_at: string | null;
}

const MAX_RECEIPT_AMOUNT = 10_000_000; // CH-001: 영수증 발급 한도 (KRW, 1천만)

// ---------------------------------------------------------------------------
// CH-001: 기부 영수증 발급 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function recordDonation(
  db: Database.Database,
  donorId: string,
  campaignId: string,
  amount: number,
  paymentMethod: string,
): { donationId: string; receiptId: string; donorId: string; issuedAt: string } {
  if (amount >= MAX_RECEIPT_AMOUNT) {
    throw new CharityError(
      'E422-RECEIPT-LIMIT-EXCEEDED',
      `Donation amount exceeds receipt issuance limit (${amount} >= ${MAX_RECEIPT_AMOUNT})`,
      422,
    );
  }

  const donationId = randomUUID();
  const receiptId = randomUUID();
  const issuedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO donations (id, donor_id, campaign_id, amount, payment_method, status, donated_at)
    VALUES (?, ?, ?, ?, ?, 'confirmed', ?)
  `).run(donationId, donorId, campaignId, amount, paymentMethod, issuedAt);

  db.prepare(`
    INSERT INTO donation_receipts (id, donation_id, donor_id, amount, issued_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(receiptId, donationId, donorId, amount, issuedAt);

  return { donationId, receiptId, donorId, issuedAt };
}

// ---------------------------------------------------------------------------
// CH-002: 보조금 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, grantTierLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyGrant(
  db: Database.Database,
  granteeId: string,
  tierCode: 'seed' | 'standard' | 'major' | 'lead',
  requestedAmount: number,
): { granteeId: string; requestedAmount: number; grantTierLimit: number; approved: boolean } {
  const tier = db
    .prepare('SELECT grantTierLimit FROM grant_tiers WHERE tier_code = ? LIMIT 1')
    .get(tierCode) as { grantTierLimit: number } | undefined;

  if (!tier) throw new CharityError('E404-TIER', 'Grant tier not found', 404);

  // F445 Path B: var-vs-var, left=`grantTierLimit` (`limit` keyword 매칭)
  const grantTierLimit = tier.grantTierLimit;

  if (requestedAmount > grantTierLimit) {
    throw new CharityError(
      'E422-GRANT-TIER-EXCEEDED',
      `Grant request exceeded tier limit (${requestedAmount} > ${grantTierLimit})`,
      422,
    );
  }

  const grantId = randomUUID();
  const approvedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO grants (id, grantee_id, tier_code, requested_amount, status, approved_at)
    VALUES (?, ?, ?, ?, 'approved', ?)
  `).run(grantId, granteeId, tierCode, requestedAmount, approvedAt);

  return { granteeId, requestedAmount, grantTierLimit, approved: true };
}

// ---------------------------------------------------------------------------
// CH-003: 기금 집행 atomic — 승인 + 출금 + 영수 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function disburseFund(
  db: Database.Database,
  grantId: string,
  granteeId: string,
  amount: number,
): { disbursementId: string; approvalId: string; receiptId: string; granteeId: string; disbursedAt: string } {
  const grant = db
    .prepare('SELECT status FROM grants WHERE id = ? AND status = \'approved\'')
    .get(grantId) as { status: string } | undefined;

  if (!grant) throw new CharityError('E404-GRANT', 'No approved grant found for disbursement', 404);

  const disbursementId = randomUUID();
  const approvalId = randomUUID();
  const receiptId = randomUUID();
  const disbursedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO fund_disbursements (id, grant_id, grantee_id, amount, status, disbursed_at)
      VALUES (?, ?, ?, ?, 'initiated', ?)
    `).run(disbursementId, grantId, granteeId, amount, disbursedAt);

    db.prepare(`
      UPDATE grants SET status = 'disbursed' WHERE id = ?
    `).run(grantId);

    db.prepare(`
      INSERT INTO disbursement_receipts (id, disbursement_id, grantee_id, amount, issued_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(receiptId, disbursementId, granteeId, amount, disbursedAt);

    db.prepare(`
      UPDATE fund_disbursements SET status = 'disbursed' WHERE id = ?
    `).run(disbursementId);
  });
  tx();

  return { disbursementId, approvalId: approvalId, receiptId, granteeId, disbursedAt };
}

// ---------------------------------------------------------------------------
// CH-004: 캠페인 상태 전환 (draft → active → closed → reported → audited)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionCampaignStatus(
  db: Database.Database,
  campaignId: string,
  newStatus: 'active' | 'closed' | 'reported' | 'audited',
): { campaignId: string; previousStatus: string; newStatus: string } {
  const campaign = db
    .prepare('SELECT status FROM campaigns WHERE id = ?')
    .get(campaignId) as { status: string } | undefined;

  if (!campaign) throw new CharityError('E404-CAMPAIGN', 'Campaign not found', 404);

  const previousStatus = campaign.status;
  const allowed =
    (campaign.status === 'draft' && newStatus === 'active') ||
    (campaign.status === 'active' && newStatus === 'closed') ||
    (campaign.status === 'closed' && newStatus === 'reported') ||
    (campaign.status === 'reported' && newStatus === 'audited');

  if (!allowed) {
    throw new CharityError(
      'E409-CAMPAIGN',
      `Cannot transition campaign from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE campaigns SET status = ? WHERE id = ?`).run(newStatus, campaignId);

  if (newStatus === 'active') {
    db.prepare(`UPDATE campaigns SET started_at = ? WHERE id = ?`).run(now, campaignId);
  }
  if (newStatus === 'closed') {
    db.prepare(`UPDATE campaigns SET closed_at = ? WHERE id = ?`).run(now, campaignId);
  }

  return { campaignId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// CH-005: 자원봉사 일정 일괄 갱신 (batch volunteer schedule sync)
// (StatusTransition detector — batch 패턴, CC-005 27번째 재사용)
// ---------------------------------------------------------------------------
export function markVolunteerSchedule(
  db: Database.Database,
  scheduledBefore: string,
): { syncedCount: number; syncedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM volunteer_schedules
      WHERE scheduled_date <= ?
        AND status = 'pending'
    `)
    .all(scheduledBefore) as Array<{ id: string }>;

  const syncedIds: string[] = [];

  for (const schedule of candidates) {
    db.prepare(`
      UPDATE volunteer_schedules
      SET status = 'assigned', synced_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), schedule.id);
    syncedIds.push(schedule.id);
  }

  return { syncedCount: syncedIds.length, syncedIds };
}

// ---------------------------------------------------------------------------
// CH-006: 세금증명 발급 atomic — 검증 + 발급 + 신고 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function issueTaxCertificate(
  db: Database.Database,
  donorId: string,
  donationId: string,
): { certificateId: string; reportId: string; donorId: string; issuedAt: string } {
  const certificateId = randomUUID();
  const reportId = randomUUID();
  const certificateNumber = `TC-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const issuedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO tax_certificates (id, donor_id, donation_id, certificate_number, issued_at, reported_at)
      VALUES (?, ?, ?, ?, ?, NULL)
    `).run(certificateId, donorId, donationId, certificateNumber, issuedAt);

    db.prepare(`
      UPDATE donations SET status = 'confirmed' WHERE id = ?
    `).run(donationId);

    db.prepare(`
      INSERT INTO tax_reports (id, certificate_id, donor_id, reported_at)
      VALUES (?, ?, ?, ?)
    `).run(reportId, certificateId, donorId, issuedAt);

    db.prepare(`
      UPDATE tax_certificates SET reported_at = ? WHERE id = ?
    `).run(issuedAt, certificateId);
  });
  tx();

  return { certificateId, reportId, donorId, issuedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class CharityError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'CharityError';
  }
}
