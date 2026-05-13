import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-TX (TX-001~TX-006): Textile 합성 도메인 — 54번째 도메인 (방직/섬유 산업, 43번째 신규 산업)
//   - textile spec-container rules.md 기반 PoC source
//   - 합성 schema: mills, dye_contracts, fabric_orders, fabric_batches,
//                  dye_payments, return_refund_records, return_refunds
//   - 방직 lifecycle 패턴 — 직조batch한도/염료수수료한도/염색batchatomic/발주상태전환/만료재고일괄/반품환불atomic
//   - withRuleId 재사용 54번째 도메인 (신규 detector 0개, 55 Sprint 연속 정점 도전)
//   - TextileError code-in-message 패턴 (S275 표준)
//   - 43 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS+MU+SH+PB+TX)
//   - 43번째 신규 산업 마일스톤 (textile 추가, 제조 클러스터 확장: MF 일반 + TX 섬유 분리)
//   - 거울 변환 7회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile)
// ---------------------------------------------------------------------------

export interface MillRow {
  id: string;
  name: string;
  total_capacity: number;
  active_batches: number;
  status: string; // active | maintenance | retired
}

export interface DyeContractRow {
  id: string;
  buyer_id: string;
  mill_id: string;
  tier_code: string; // basic | premium | luxury | export
  fee_limit: number;
  fee_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface FabricOrderRow {
  id: string;
  mill_id: string;
  contract_id: string;
  fabric_batch_id: string | null;
  dye_payment_id: string | null;
  status: string; // ordered | woven | dyed | qc | shipped | rejected
  ordered_at: string;
}

export interface FabricBatchRow {
  id: string;
  mill_id: string;
  order_id: string;
  bolt_no: string;
  status: string; // woven | dyed | shipped | rejected | expired
  woven_at: string;
}

export interface ReturnRefundRecordRow {
  id: string;
  buyer_id: string;
  fabric_batch_id: string;
  fabric_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_BATCHES_PER_MILL = 300; // TX-001: 방직 공장별 동시 직조 batch 한도 (기본값)

// ---------------------------------------------------------------------------
// TX-001: 방직 공장 동시 직조 batch 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function startWeavingBatch(
  db: Database.Database,
  millId: string,
  contractId: string,
): { orderId: string; millId: string; contractId: string; orderedAt: string } {
  const mill = db
    .prepare('SELECT active_batches, total_capacity FROM mills WHERE id = ?')
    .get(millId) as { active_batches: number; total_capacity: number } | undefined;

  if (!mill) throw new TextileError('E404-MILL', 'Mill not found', 404);

  const limit = mill.total_capacity ?? MAX_CONCURRENT_BATCHES_PER_MILL;

  if (mill.active_batches >= limit) {
    throw new TextileError(
      'E422-MILL-CAPACITY-EXCEEDED',
      `Mill is at full capacity (${mill.active_batches} >= ${limit})`,
      422,
    );
  }

  const orderId = randomUUID();
  const orderedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO fabric_orders (id, mill_id, contract_id, fabric_batch_id, dye_payment_id, status, ordered_at)
    VALUES (?, ?, ?, NULL, NULL, 'ordered', ?)
  `).run(orderId, millId, contractId, orderedAt);

  db.prepare(`
    UPDATE mills SET active_batches = active_batches + 1 WHERE id = ?
  `).run(millId);

  return { orderId, millId, contractId, orderedAt };
}

// ---------------------------------------------------------------------------
// TX-002: 구매자 염료 수수료 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, dyeFeePaymentLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyDyeFeeTier(
  db: Database.Database,
  buyerId: string,
  contractId: string,
  fee: number,
): { buyerId: string; contractId: string; dyeFeePaymentLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT fee_used, fee_limit FROM dye_contracts WHERE id = ? AND buyer_id = ? LIMIT 1')
    .get(contractId, buyerId) as { fee_used: number; fee_limit: number } | undefined;

  if (!contract) throw new TextileError('E404-CONTRACT', 'Dye contract not found', 404);

  // F445 Path B: var-vs-var, left=`dyeFeePaymentLimit` (`limit` keyword 매칭)
  const dyeFeePaymentLimit = contract.fee_limit;

  if (contract.fee_used + fee >= dyeFeePaymentLimit) {
    throw new TextileError(
      'E422-DYE-FEE-PAYMENT-LIMIT-EXCEEDED',
      `Dye fee payment quota exhausted (${contract.fee_used + fee} >= ${dyeFeePaymentLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE dye_contracts SET fee_used = fee_used + ? WHERE id = ?
  `).run(fee, contractId);

  return { buyerId, contractId, dyeFeePaymentLimit, approved: true };
}

// ---------------------------------------------------------------------------
// TX-003: 염색 batch atomic — fabric_batches + fabric_orders 상태전환 + dye_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processFabricBatch(
  db: Database.Database,
  millId: string,
  orderId: string,
  boltNo: string,
  amount: number,
): { fabricBatchId: string; dyePaymentId: string; orderId: string; millId: string; wovenAt: string } {
  const order = db
    .prepare("SELECT status FROM fabric_orders WHERE id = ? AND status = 'woven'")
    .get(orderId) as { status: string } | undefined;

  if (!order) throw new TextileError('E404-ORDER', 'Woven fabric order not found', 404);

  const fabricBatchId = randomUUID();
  const dyePaymentId = randomUUID();
  const wovenAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO fabric_batches (id, mill_id, order_id, bolt_no, status, woven_at)
      VALUES (?, ?, ?, ?, 'dyed', ?)
    `).run(fabricBatchId, millId, orderId, boltNo, wovenAt);

    db.prepare(`
      UPDATE fabric_orders SET status = 'dyed', fabric_batch_id = ?, dye_payment_id = ? WHERE id = ?
    `).run(fabricBatchId, dyePaymentId, orderId);

    db.prepare(`
      INSERT INTO dye_payments (id, order_id, fabric_batch_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(dyePaymentId, orderId, fabricBatchId, amount, wovenAt);
  });
  tx();

  return { fabricBatchId, dyePaymentId, orderId, millId, wovenAt };
}

// ---------------------------------------------------------------------------
// TX-004: 발주 상태 전환 (ordered → woven → dyed → qc → shipped/rejected)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionOrderStatus(
  db: Database.Database,
  orderId: string,
  newStatus: 'woven' | 'dyed' | 'qc' | 'shipped' | 'rejected',
): { orderId: string; previousStatus: string; newStatus: string } {
  const order = db
    .prepare('SELECT status FROM fabric_orders WHERE id = ?')
    .get(orderId) as { status: string } | undefined;

  if (!order) throw new TextileError('E404-ORDER', 'Fabric order not found', 404);

  const previousStatus = order.status;
  const allowed =
    (order.status === 'ordered' && newStatus === 'woven') ||
    (order.status === 'woven' && newStatus === 'dyed') ||
    (order.status === 'dyed' && newStatus === 'qc') ||
    (order.status === 'qc' && newStatus === 'shipped') ||
    (order.status === 'qc' && newStatus === 'rejected') ||
    (order.status === 'dyed' && newStatus === 'rejected') ||
    (order.status === 'woven' && newStatus === 'rejected');

  if (!allowed) {
    throw new TextileError(
      'E409-ORDER',
      `Cannot transition fabric order from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE fabric_orders SET status = ? WHERE id = ?`).run(newStatus, orderId);

  return { orderId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// TX-005: 만료 rejected 직물 batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SH-005/MU-005/PB-005 43번째 재사용)
// ---------------------------------------------------------------------------
export function expireRejectedFabricBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM fabric_batches
      WHERE status = 'rejected'
        AND woven_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE fabric_batches
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// TX-006: 반품 환불 atomic — fabric 비용 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processReturnRefund(
  db: Database.Database,
  buyerId: string,
  fabricBatchId: string,
  fabricCost: number,
  refundRate: number,
): { returnRefundId: string; refundId: string; buyerId: string; refundAmount: number; refundedAt: string } {
  const fabricBatch = db
    .prepare("SELECT status FROM fabric_batches WHERE id = ? AND status = 'rejected'")
    .get(fabricBatchId) as { status: string } | undefined;

  if (!fabricBatch) throw new TextileError('E404-REJECTED-BATCH', 'Rejected fabric batch not found', 404);

  const returnRefundId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(fabricCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO return_refund_records (id, buyer_id, fabric_batch_id, fabric_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(returnRefundId, buyerId, fabricBatchId, fabricCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO return_refunds (id, return_refund_id, buyer_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, returnRefundId, buyerId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE return_refund_records SET status = 'refunded' WHERE id = ?
    `).run(returnRefundId);
  });
  tx();

  return { returnRefundId, refundId, buyerId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class TextileError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'TextileError';
  }
}
