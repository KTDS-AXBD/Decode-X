import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// FN-SETTLE (BL-033~036): 온누리상품권 정산 배치 처리
//   - lpon-settlement spec-container rules.md 기반 PoC source
//   - 합성 schema: calculations, calculation_transactions, settlement_summaries
// ---------------------------------------------------------------------------

// BL-035 threshold: 최대 조회 기간 (일)
const MAX_PERIOD_DAYS = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CalculationRow {
  id: string;
  status: string;
  charge_count: number;
  charge_amount: number;
  refund_count: number;
  refund_amount: number;
  period_start: string;
  period_end: string;
}

interface CalcTransactionRow {
  id: string;
  calculation_id: string;
  type: string;
  amount: number;
  processed: number;
}

interface SettlementSummaryRow {
  id: string;
  period_start: string;
  period_end: string;
  charge_count: number;
  charge_amount: number;
  refund_count: number;
  refund_amount: number;
  fee_total: number;
  created_at: string;
}

export interface SettlementResult {
  event: 'BatchCompleted' | 'BatchSkipped';
  periodStart: string;
  periodEnd: string;
  chargeCount: number;
  chargeAmount: number;
  refundCount: number;
  refundAmount: number;
}

export interface ProcessResult {
  processed: number;
  skipped: number;
}

export interface SettlementCheckResult {
  fromDate: string;
  toDate: string;
  periodDays: number;
  rows: CalculationRow[];
}

export interface AdjustResult {
  summaryId: string;
  feeReflected: string;
  status: string;
  netAmount: number;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// BL-033: BATCH_004 — 배치 실행 (atomic transaction)
// ---------------------------------------------------------------------------
export function runBatchSettlement(
  db: Database.Database,
  periodStart: string,
  periodEnd: string
): SettlementResult {
  const calcs = db
    .prepare(
      `SELECT id, charge_count, charge_amount, refund_count, refund_amount
       FROM calculations WHERE period_start >= ? AND period_end <= ?`
    )
    .all(periodStart, periodEnd) as CalculationRow[];

  if (calcs.length === 0) {
    return {
      event: 'BatchSkipped',
      periodStart,
      periodEnd,
      chargeCount: 0,
      chargeAmount: 0,
      refundCount: 0,
      refundAmount: 0,
    };
  }

  const totals = calcs.reduce(
    (acc, c) => ({
      chargeCount: acc.chargeCount + c.charge_count,
      chargeAmount: acc.chargeAmount + c.charge_amount,
      refundCount: acc.refundCount + c.refund_count,
      refundAmount: acc.refundAmount + c.refund_amount,
    }),
    { chargeCount: 0, chargeAmount: 0, refundCount: 0, refundAmount: 0 }
  );

  const now = new Date().toISOString();

  // BL-033: calculations + settlement_summaries 조회/갱신을 단일 트랜잭션으로 처리 (atomic)
  const tx = db.transaction(() => {
    const existing = db
      .prepare(
        `SELECT id FROM settlement_summaries WHERE period_start = ? AND period_end = ?`
      )
      .get(periodStart, periodEnd) as Pick<SettlementSummaryRow, 'id'> | undefined;

    if (existing) {
      db.prepare(
        `UPDATE settlement_summaries SET
           charge_count = ?, charge_amount = ?,
           refund_count = ?, refund_amount = ?,
           created_at = ?
         WHERE period_start = ? AND period_end = ?`
      ).run(
        totals.chargeCount, totals.chargeAmount,
        totals.refundCount, totals.refundAmount,
        now,
        periodStart, periodEnd
      );
    } else {
      db.prepare(
        `INSERT INTO settlement_summaries
           (period_start, period_end, charge_count, charge_amount, refund_count, refund_amount, fee_total, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
      ).run(
        periodStart, periodEnd,
        totals.chargeCount, totals.chargeAmount,
        totals.refundCount, totals.refundAmount,
        now
      );
    }
  });
  tx();

  return {
    event: 'BatchCompleted',
    periodStart,
    periodEnd,
    ...totals,
  };
}

// ---------------------------------------------------------------------------
// BL-034: 계산 데이터 반복 처리 (each row in separate atomic transaction)
// ---------------------------------------------------------------------------
export function processCalculations(
  db: Database.Database,
  calculationIds: string[]
): ProcessResult {
  let processed = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const calcId of calculationIds) {
    const calc = db
      .prepare(`SELECT id, status FROM calculations WHERE id = ?`)
      .get(calcId) as Pick<CalculationRow, 'id' | 'status'> | undefined;

    if (!calc) {
      skipped++;
      continue;
    }

    const txns = db
      .prepare(`SELECT id FROM calculation_transactions WHERE calculation_id = ?`)
      .all(calcId) as Pick<CalcTransactionRow, 'id'>[];

    if (txns.length === 0) {
      skipped++;
      continue;
    }

    // BL-034: 각 calculation을 개별 db.transaction()으로 원자적 갱신 (atomic)
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE calculations SET status = 'processed', updated_at = ? WHERE id = ?`
      ).run(now, calcId);

      db.prepare(
        `UPDATE calculation_transactions SET processed = 1, processed_at = ? WHERE calculation_id = ?`
      ).run(now, calcId);
    });
    tx();

    processed++;
  }

  return { processed, skipped };
}

// ---------------------------------------------------------------------------
// BL-035: 특정 기간 산정 점검 데이터 조회 (threshold validation)
// ---------------------------------------------------------------------------
export function getSettlementCheck(
  db: Database.Database,
  fromDate: string,
  toDate: string
): SettlementCheckResult {
  const from = new Date(fromDate);
  const to = new Date(toDate);

  // BL-035: 기간 순서 검증
  if (from >= to) {
    throw new SettlementError('E400-RANGE', 'fromDate must be before toDate', 400);
  }

  // BL-035: MAX_PERIOD_DAYS 한도 초과 검증 (threshold)
  const dayCount = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  if (dayCount > MAX_PERIOD_DAYS) {
    throw new SettlementError(
      'E422-THRESHOLD',
      `Period exceeds maximum of ${MAX_PERIOD_DAYS} days`,
      422
    );
  }

  const rows = db
    .prepare(
      `SELECT id, status, charge_count, charge_amount, refund_count, refund_amount, period_start, period_end
       FROM calculations WHERE period_start >= ? AND period_end <= ?`
    )
    .all(fromDate, toDate) as CalculationRow[];

  return { fromDate, toDate, periodDays: dayCount, rows };
}

// ---------------------------------------------------------------------------
// BL-036: 수수료 산출 — fee_reflected Y/N status transition
// ---------------------------------------------------------------------------
export function applyFeeAdjustment(
  db: Database.Database,
  summaryId: string,
  feeReflected: string | null
): AdjustResult {
  const summary = db
    .prepare(
      `SELECT id, charge_amount, refund_amount, fee_total FROM settlement_summaries WHERE id = ?`
    )
    .get(summaryId) as (Pick<SettlementSummaryRow, 'id' | 'charge_amount' | 'refund_amount' | 'fee_total'>) | undefined;

  if (!summary) {
    throw new SettlementError('E404', 'Settlement summary not found', 404);
  }

  const updatedAt = new Date().toISOString();

  // BL-036: fee_reflected → status 정규화 (Y=applied / N=gross), status transition detector 매칭
  const status = feeReflected;

  if (status === 'Y') {
    const netAmount = summary.charge_amount - summary.refund_amount - summary.fee_total;
    db.prepare(
      `UPDATE settlement_summaries SET fee_reflected = 'Y', net_amount = ?, updated_at = ? WHERE id = ?`
    ).run(netAmount, updatedAt, summaryId);
    return { summaryId, feeReflected: status, status: 'applied', netAmount, updatedAt };
  }

  if (status === 'N') {
    const netAmount = summary.charge_amount - summary.refund_amount;
    db.prepare(
      `UPDATE settlement_summaries SET fee_reflected = 'N', net_amount = ?, updated_at = ? WHERE id = ?`
    ).run(netAmount, updatedAt, summaryId);
    return { summaryId, feeReflected: status, status: 'gross', netAmount, updatedAt };
  }

  // NULL 또는 기타 값
  throw new SettlementError('E422-FEE', 'INVALID_FEE_FLAG: fee_reflected must be Y or N', 422);
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------
export class SettlementError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'SettlementError';
  }
}
