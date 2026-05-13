import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-PB (PB-001~PB-006): Publishing 합성 도메인 — 53번째 도메인 (출판 산업, 42번째 신규 산업)
//   - publishing spec-container rules.md 기반 PoC source
//   - 합성 schema: imprints, royalty_contracts, volume_registrations, print_batches,
//                  royalty_payments, royalty_refund_records, royalty_refunds
//   - 출판 lifecycle 패턴 — 임프린트볼륨한도/저작권료한도/인쇄batchatomic/배포상태전환/만료재고일괄/저작권환불atomic
//   - withRuleId 재사용 53번째 도메인 (신규 detector 0개, 54 Sprint 연속 정점 도전)
//   - PublishingError code-in-message 패턴 (S275 표준)
//   - 42 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS+MU+SH+PB)
//   - 42번째 신규 산업 마일스톤 (publishing 추가, 디지털 콘텐츠 클러스터 확장: MU+PB)
//   - 거울 변환 6회차 (carsharing → fastfood → aerospace → music → shipping → publishing)
// ---------------------------------------------------------------------------

export interface ImprintRow {
  id: string;
  name: string;
  total_capacity: number;
  active_volumes: number;
  status: string; // active | suspended | retired
}

export interface RoyaltyContractRow {
  id: string;
  author_id: string;
  imprint_id: string;
  tier_code: string; // debut | midlist | bestseller | classic
  fee_limit: number;
  fee_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface VolumeRegistrationRow {
  id: string;
  imprint_id: string;
  contract_id: string;
  print_batch_id: string | null;
  royalty_payment_id: string | null;
  status: string; // registered | edited | printed | distributed | sold | returned
  registered_at: string;
}

export interface PrintBatchRow {
  id: string;
  imprint_id: string;
  registration_id: string;
  batch_no: string;
  status: string; // printed | distributed | sold | returned
  printed_at: string;
}

export interface RoyaltyRefundRecordRow {
  id: string;
  author_id: string;
  print_batch_id: string;
  royalty_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_VOLUMES_PER_IMPRINT = 500; // PB-001: 임프린트별 동시 볼륨 등록 한도 (기본값)

// ---------------------------------------------------------------------------
// PB-001: 임프린트 볼륨 동시 등록 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function registerVolume(
  db: Database.Database,
  imprintId: string,
  contractId: string,
): { registrationId: string; imprintId: string; contractId: string; registeredAt: string } {
  const imprint = db
    .prepare('SELECT active_volumes, total_capacity FROM imprints WHERE id = ?')
    .get(imprintId) as { active_volumes: number; total_capacity: number } | undefined;

  if (!imprint) throw new PublishingError('E404-IMPRINT', 'Imprint not found', 404);

  const limit = imprint.total_capacity ?? MAX_CONCURRENT_VOLUMES_PER_IMPRINT;

  if (imprint.active_volumes >= limit) {
    throw new PublishingError(
      'E422-IMPRINT-VOLUME-EXCEEDED',
      `Imprint is at full capacity (${imprint.active_volumes} >= ${limit})`,
      422,
    );
  }

  const registrationId = randomUUID();
  const registeredAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO volume_registrations (id, imprint_id, contract_id, print_batch_id, royalty_payment_id, status, registered_at)
    VALUES (?, ?, ?, NULL, NULL, 'registered', ?)
  `).run(registrationId, imprintId, contractId, registeredAt);

  db.prepare(`
    UPDATE imprints SET active_volumes = active_volumes + 1 WHERE id = ?
  `).run(imprintId);

  return { registrationId, imprintId, contractId, registeredAt };
}

// ---------------------------------------------------------------------------
// PB-002: 저자 저작권료 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, royaltyPaymentLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyRoyaltyTier(
  db: Database.Database,
  authorId: string,
  contractId: string,
  fee: number,
): { authorId: string; contractId: string; royaltyPaymentLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT fee_used, fee_limit FROM royalty_contracts WHERE id = ? AND author_id = ? LIMIT 1')
    .get(contractId, authorId) as { fee_used: number; fee_limit: number } | undefined;

  if (!contract) throw new PublishingError('E404-CONTRACT', 'Royalty contract not found', 404);

  // F445 Path B: var-vs-var, left=`royaltyPaymentLimit` (`limit` keyword 매칭)
  const royaltyPaymentLimit = contract.fee_limit;

  if (contract.fee_used + fee >= royaltyPaymentLimit) {
    throw new PublishingError(
      'E422-ROYALTY-PAYMENT-LIMIT-EXCEEDED',
      `Royalty payment quota exhausted (${contract.fee_used + fee} >= ${royaltyPaymentLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE royalty_contracts SET fee_used = fee_used + ? WHERE id = ?
  `).run(fee, contractId);

  return { authorId, contractId, royaltyPaymentLimit, approved: true };
}

// ---------------------------------------------------------------------------
// PB-003: 인쇄 batch atomic — print_batches + volume_registrations 상태전환 + royalty_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processPrintBatch(
  db: Database.Database,
  imprintId: string,
  registrationId: string,
  batchNo: string,
  amount: number,
): { printBatchId: string; royaltyPaymentId: string; registrationId: string; imprintId: string; printedAt: string } {
  const registration = db
    .prepare("SELECT status FROM volume_registrations WHERE id = ? AND status = 'edited'")
    .get(registrationId) as { status: string } | undefined;

  if (!registration) throw new PublishingError('E404-REGISTRATION', 'Edited volume registration not found', 404);

  const printBatchId = randomUUID();
  const royaltyPaymentId = randomUUID();
  const printedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO print_batches (id, imprint_id, registration_id, batch_no, status, printed_at)
      VALUES (?, ?, ?, ?, 'printed', ?)
    `).run(printBatchId, imprintId, registrationId, batchNo, printedAt);

    db.prepare(`
      UPDATE volume_registrations SET status = 'printed', print_batch_id = ?, royalty_payment_id = ? WHERE id = ?
    `).run(printBatchId, royaltyPaymentId, registrationId);

    db.prepare(`
      INSERT INTO royalty_payments (id, registration_id, print_batch_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(royaltyPaymentId, registrationId, printBatchId, amount, printedAt);
  });
  tx();

  return { printBatchId, royaltyPaymentId, registrationId, imprintId, printedAt };
}

// ---------------------------------------------------------------------------
// PB-004: 볼륨 등록 상태 전환 (registered → edited → printed → distributed → sold/returned)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionRegistrationStatus(
  db: Database.Database,
  registrationId: string,
  newStatus: 'edited' | 'printed' | 'distributed' | 'sold' | 'returned',
): { registrationId: string; previousStatus: string; newStatus: string } {
  const registration = db
    .prepare('SELECT status FROM volume_registrations WHERE id = ?')
    .get(registrationId) as { status: string } | undefined;

  if (!registration) throw new PublishingError('E404-REGISTRATION', 'Volume registration not found', 404);

  const previousStatus = registration.status;
  const allowed =
    (registration.status === 'registered' && newStatus === 'edited') ||
    (registration.status === 'edited' && newStatus === 'printed') ||
    (registration.status === 'printed' && newStatus === 'distributed') ||
    (registration.status === 'distributed' && newStatus === 'sold') ||
    (registration.status === 'distributed' && newStatus === 'returned') ||
    (registration.status === 'printed' && newStatus === 'returned') ||
    (registration.status === 'edited' && newStatus === 'returned');

  if (!allowed) {
    throw new PublishingError(
      'E409-REGISTRATION',
      `Cannot transition volume registration from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE volume_registrations SET status = ? WHERE id = ?`).run(newStatus, registrationId);

  return { registrationId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// PB-005: 만료 재고 인쇄 batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SH-005/MU-005/AS-005/FS-005/CS-005 42번째 재사용)
// ---------------------------------------------------------------------------
export function expirePrintBatchInventory(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM print_batches
      WHERE status = 'distributed'
        AND printed_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE print_batches
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// PB-006: 저작권료 환불 atomic — 저작권 비용 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processRoyaltyRefund(
  db: Database.Database,
  authorId: string,
  printBatchId: string,
  royaltyCost: number,
  refundRate: number,
): { royaltyRefundId: string; refundId: string; authorId: string; refundAmount: number; refundedAt: string } {
  const printBatch = db
    .prepare("SELECT status FROM print_batches WHERE id = ? AND status = 'returned'")
    .get(printBatchId) as { status: string } | undefined;

  if (!printBatch) throw new PublishingError('E404-RETURNED-BATCH', 'Returned print batch not found', 404);

  const royaltyRefundId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(royaltyCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO royalty_refund_records (id, author_id, print_batch_id, royalty_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(royaltyRefundId, authorId, printBatchId, royaltyCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO royalty_refunds (id, royalty_refund_id, author_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, royaltyRefundId, authorId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE royalty_refund_records SET status = 'refunded' WHERE id = ?
    `).run(royaltyRefundId);
  });
  tx();

  return { royaltyRefundId, refundId, authorId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class PublishingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'PublishingError';
  }
}
