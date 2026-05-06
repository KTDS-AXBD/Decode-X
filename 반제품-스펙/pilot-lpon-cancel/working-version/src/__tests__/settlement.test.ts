import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  runBatchSettlement,
  processCalculations,
  getSettlementCheck,
  applyFeeAdjustment,
  SettlementError,
} from '../domain/settlement.js';

// ---------------------------------------------------------------------------
// 합성 schema (lpon-settlement PoC — 운영 schema 미존재)
// ---------------------------------------------------------------------------
function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.prepare(`
    CREATE TABLE calculations (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      charge_count INTEGER NOT NULL DEFAULT 0,
      charge_amount INTEGER NOT NULL DEFAULT 0,
      refund_count INTEGER NOT NULL DEFAULT 0,
      refund_amount INTEGER NOT NULL DEFAULT 0,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      updated_at TEXT
    )
  `).run();
  db.prepare(`
    CREATE TABLE calculation_transactions (
      id TEXT PRIMARY KEY,
      calculation_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      processed INTEGER NOT NULL DEFAULT 0,
      processed_at TEXT
    )
  `).run();
  db.prepare(`
    CREATE TABLE settlement_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      charge_count INTEGER NOT NULL DEFAULT 0,
      charge_amount INTEGER NOT NULL DEFAULT 0,
      refund_count INTEGER NOT NULL DEFAULT 0,
      refund_amount INTEGER NOT NULL DEFAULT 0,
      fee_total INTEGER NOT NULL DEFAULT 0,
      fee_reflected TEXT,
      net_amount INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT
    )
  `).run();
  return db;
}

function seedCalc(
  db: Database.Database,
  id: string,
  chargeCount: number,
  chargeAmount: number,
  refundCount: number,
  refundAmount: number,
  periodStart = '2026-04-01',
  periodEnd = '2026-04-30'
) {
  db.prepare(`
    INSERT INTO calculations (id, charge_count, charge_amount, refund_count, refund_amount, period_start, period_end)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, chargeCount, chargeAmount, refundCount, refundAmount, periodStart, periodEnd);
}

function seedCalcTxn(db: Database.Database, id: string, calcId: string, type = 'charge', amount = 1000) {
  db.prepare(`
    INSERT INTO calculation_transactions (id, calculation_id, type, amount)
    VALUES (?, ?, ?, ?)
  `).run(id, calcId, type, amount);
}

function seedSummary(db: Database.Database, periodStart: string, periodEnd: string, feeTotal = 5000) {
  db.prepare(`
    INSERT INTO settlement_summaries (period_start, period_end, charge_count, charge_amount, refund_count, refund_amount, fee_total, created_at)
    VALUES (?, ?, 10, 100000, 2, 10000, ?, datetime('now'))
  `).run(periodStart, periodEnd, feeTotal);
  return (db.prepare(`SELECT id FROM settlement_summaries WHERE period_start = ?`).get(periodStart) as { id: number }).id;
}

// ---------------------------------------------------------------------------
// BL-033: runBatchSettlement
// ---------------------------------------------------------------------------
describe('runBatchSettlement (BL-033)', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });

  it('calculations 3건 → BatchCompleted + settlement_summaries 1행 생성', () => {
    seedCalc(db, 'c1', 5, 50000, 1, 5000);
    seedCalc(db, 'c2', 3, 30000, 0, 0);
    seedCalc(db, 'c3', 2, 20000, 1, 8000);

    const result = runBatchSettlement(db, '2026-04-01', '2026-04-30');

    expect(result.event).toBe('BatchCompleted');
    expect(result.chargeCount).toBe(10);
    expect(result.chargeAmount).toBe(100000);
    expect(result.refundCount).toBe(2);
    expect(result.refundAmount).toBe(13000);

    const summaries = db.prepare('SELECT * FROM settlement_summaries').all() as { charge_count: number }[];
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.charge_count).toBe(10);
  });

  it('거래 0건 → BatchSkipped 이벤트 반환', () => {
    const result = runBatchSettlement(db, '2026-04-01', '2026-04-30');
    expect(result.event).toBe('BatchSkipped');
    expect(result.chargeCount).toBe(0);
    const summaries = db.prepare('SELECT * FROM settlement_summaries').all();
    expect(summaries).toHaveLength(0);
  });

  it('이미 존재하는 summary upsert (중복 배치)', () => {
    seedCalc(db, 'c1', 5, 50000, 1, 5000);
    runBatchSettlement(db, '2026-04-01', '2026-04-30');
    // 두 번 실행 — upsert
    seedCalc(db, 'c2', 3, 30000, 0, 0, '2026-04-01', '2026-04-30');
    runBatchSettlement(db, '2026-04-01', '2026-04-30');
    const summaries = db.prepare('SELECT * FROM settlement_summaries').all();
    expect(summaries).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// BL-034: processCalculations
// ---------------------------------------------------------------------------
describe('processCalculations (BL-034)', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });

  it('4 rows 반복 처리 — 각 update commit', () => {
    for (let i = 1; i <= 4; i++) {
      seedCalc(db, `c${i}`, 1, 10000, 0, 0);
      seedCalcTxn(db, `t${i}`, `c${i}`);
    }

    const result = processCalculations(db, ['c1', 'c2', 'c3', 'c4']);

    expect(result.processed).toBe(4);
    expect(result.skipped).toBe(0);

    const processed = db.prepare(`SELECT * FROM calculations WHERE status = 'processed'`).all() as { id: string }[];
    expect(processed).toHaveLength(4);

    const txns = db.prepare(`SELECT * FROM calculation_transactions WHERE processed = 1`).all() as { processed: number }[];
    expect(txns).toHaveLength(4);
  });

  it('미존재 id → skipped 카운트', () => {
    const result = processCalculations(db, ['nonexistent-1', 'nonexistent-2']);
    expect(result.skipped).toBe(2);
    expect(result.processed).toBe(0);
  });

  it('빈 calculationIds → 즉시 반환', () => {
    const result = processCalculations(db, []);
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// BL-035: getSettlementCheck
// ---------------------------------------------------------------------------
describe('getSettlementCheck (BL-035)', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = createTestDb();
    seedCalc(db, 'c1', 3, 30000, 1, 5000, '2026-04-10', '2026-04-20');
  });

  it('유효 기간 (from < to + 60일 이내) → rows 반환', () => {
    const result = getSettlementCheck(db, '2026-04-01', '2026-04-30');
    expect(result.periodDays).toBeLessThanOrEqual(60);
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    expect(result.fromDate).toBe('2026-04-01');
  });

  it('to < from → SettlementError 400', () => {
    expect(() => getSettlementCheck(db, '2026-04-30', '2026-04-01'))
      .toThrow(SettlementError);
    try {
      getSettlementCheck(db, '2026-04-30', '2026-04-01');
    } catch (e) {
      expect((e as SettlementError).status).toBe(400);
      expect((e as SettlementError).code).toBe('E400-RANGE');
    }
  });

  it('61일 초과 → SettlementError 422 (MAX_PERIOD_DAYS threshold)', () => {
    expect(() => getSettlementCheck(db, '2026-01-01', '2026-03-15'))
      .toThrow(SettlementError);
    try {
      getSettlementCheck(db, '2026-01-01', '2026-03-15');
    } catch (e) {
      expect((e as SettlementError).status).toBe(422);
      expect((e as SettlementError).code).toBe('E422-THRESHOLD');
    }
  });
});

// ---------------------------------------------------------------------------
// BL-036: applyFeeAdjustment
// ---------------------------------------------------------------------------
describe('applyFeeAdjustment (BL-036)', () => {
  let db: Database.Database;
  let summaryId: number;
  beforeEach(() => {
    db = createTestDb();
    summaryId = seedSummary(db, '2026-04-01', '2026-04-30', 5000);
  });

  it('fee_reflected Y → 수수료 차감 후 정산 (100000 - 10000 - 5000 = 85000)', () => {
    const result = applyFeeAdjustment(db, String(summaryId), 'Y');
    expect(result.feeReflected).toBe('Y');
    expect(result.netAmount).toBe(85000);
  });

  it('fee_reflected N → 전액 정산 (100000 - 10000 = 90000)', () => {
    const result = applyFeeAdjustment(db, String(summaryId), 'N');
    expect(result.feeReflected).toBe('N');
    expect(result.netAmount).toBe(90000);
  });

  it('fee_reflected null → INVALID_FEE_FLAG 에러 422', () => {
    expect(() => applyFeeAdjustment(db, String(summaryId), null as unknown as string))
      .toThrow(SettlementError);
    try {
      applyFeeAdjustment(db, String(summaryId), null as unknown as string);
    } catch (e) {
      expect((e as SettlementError).code).toBe('E422-FEE');
      expect((e as SettlementError).status).toBe(422);
    }
  });

  it("fee_reflected 'X' → INVALID_FEE_FLAG 에러 422", () => {
    expect(() => applyFeeAdjustment(db, String(summaryId), 'X'))
      .toThrow(SettlementError);
  });

  it('존재하지 않는 summaryId → 404', () => {
    expect(() => applyFeeAdjustment(db, '99999', 'Y')).toThrow(SettlementError);
    try {
      applyFeeAdjustment(db, '99999', 'Y');
    } catch (e) {
      expect((e as SettlementError).status).toBe(404);
    }
  });
});
