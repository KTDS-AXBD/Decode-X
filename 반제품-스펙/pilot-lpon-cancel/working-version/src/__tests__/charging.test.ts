import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { processCharge, ChargeError, type WithdrawalApi } from '../domain/charging.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  // Apply schema
  const { readFileSync } = require('node:fs');
  const { join } = require('node:path');
  const sql = readFileSync(join(__dirname, '..', '..', 'migrations', '0001_init.sql'), 'utf-8');
  db.exec(sql);
  return db;
}

function seedUser(db: Database.Database, id = 'user-1') {
  db.prepare(`INSERT INTO users (id, name, phone, role, status) VALUES (?, 'Test User', '010-1234-5678', 'USER', 'ACTIVE')`).run(id);
}

function seedVoucher(db: Database.Database, id = 'voucher-1', userId = 'user-1', balance = 100_000) {
  db.prepare(`INSERT INTO vouchers (id, user_id, face_amount, balance, status, purchased_at, expires_at) VALUES (?, ?, ?, ?, 'ACTIVE', datetime('now'), datetime('now', '+1 year'))`).run(id, userId, balance, balance);
}

const successApi: WithdrawalApi = {
  async requestWithdrawal() { return { externalTxId: 'WD-TEST-001' }; },
};

const failApi: WithdrawalApi = {
  async requestWithdrawal() { throw new Error('Bank system down'); },
};

describe('FN-001: 상품권 충전', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedUser(db);
    seedVoucher(db, 'voucher-1', 'user-1', 50_000);
  });

  it('BL-001/BL-002: 정상 충전 — 출금 성공 → 잔액 증가', async () => {
    const result = await processCharge(db, {
      userId: 'user-1',
      voucherId: 'voucher-1',
      amount: 10_000,
      paymentMethod: 'CARD',
      withdrawalAccountId: 'acc-1',
    }, successApi);

    expect(result.amount).toBe(10_000);
    expect(result.balanceAfter).toBe(60_000);

    // DB 확인
    const voucher = db.prepare('SELECT balance FROM vouchers WHERE id = ?').get('voucher-1') as { balance: number };
    expect(voucher.balance).toBe(60_000);

    const charge = db.prepare('SELECT status FROM charge_transactions WHERE id = ?').get(result.chargeId) as { status: string };
    expect(charge.status).toBe('CHARGED');
  });

  it('BL-003: 출금 실패 시 충전 중단', async () => {
    await expect(
      processCharge(db, {
        userId: 'user-1',
        voucherId: 'voucher-1',
        amount: 10_000,
        paymentMethod: 'CARD',
        withdrawalAccountId: 'acc-1',
      }, failApi)
    ).rejects.toThrow(ChargeError);

    // 잔액 변화 없음
    const voucher = db.prepare('SELECT balance FROM vouchers WHERE id = ?').get('voucher-1') as { balance: number };
    expect(voucher.balance).toBe(50_000);
  });

  it('E404: 존재하지 않는 상품권', async () => {
    try {
      await processCharge(db, {
        userId: 'user-1',
        voucherId: 'nonexistent',
        amount: 10_000,
        paymentMethod: 'CARD',
        withdrawalAccountId: 'acc-1',
      }, successApi);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ChargeError);
      expect((err as ChargeError).code).toBe('E404');
    }
  });

  it('BL-005: 충전 금액 범위 초과 (E422-AMT)', async () => {
    try {
      await processCharge(db, {
        userId: 'user-1',
        voucherId: 'voucher-1',
        amount: 600_000,
        paymentMethod: 'CARD',
        withdrawalAccountId: 'acc-1',
      }, successApi);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ChargeError);
      expect((err as ChargeError).code).toBe('E422-AMT');
    }
  });

  it('BL-005: 충전 금액 단위 불일치 (E422-AMT)', async () => {
    try {
      await processCharge(db, {
        userId: 'user-1',
        voucherId: 'voucher-1',
        amount: 1_500,
        paymentMethod: 'CARD',
        withdrawalAccountId: 'acc-1',
      }, successApi);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ChargeError);
      expect((err as ChargeError).code).toBe('E422-AMT');
    }
  });

  it('BL-005: 일일 충전 한도 초과 (E422-LMT)', async () => {
    // 먼저 900,000원 충전 (9번 x 100,000원은 한도 내)
    // 대신 한 번에 500,000원 2회 = 1,000,000원으로 한도 도달
    await processCharge(db, {
      userId: 'user-1', voucherId: 'voucher-1', amount: 500_000,
      paymentMethod: 'CARD', withdrawalAccountId: 'acc-1',
    }, successApi);
    await processCharge(db, {
      userId: 'user-1', voucherId: 'voucher-1', amount: 500_000,
      paymentMethod: 'CARD', withdrawalAccountId: 'acc-1',
    }, successApi);

    // 이제 추가 충전 시 한도 초과
    try {
      await processCharge(db, {
        userId: 'user-1', voucherId: 'voucher-1', amount: 1_000,
        paymentMethod: 'CARD', withdrawalAccountId: 'acc-1',
      }, successApi);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ChargeError);
      expect((err as ChargeError).code).toBe('E422-LMT');
    }
  });

  it('E409: 비활성 상품권 충전 시도', async () => {
    db.prepare(`UPDATE vouchers SET status = 'EXPIRED' WHERE id = 'voucher-1'`).run();

    try {
      await processCharge(db, {
        userId: 'user-1', voucherId: 'voucher-1', amount: 10_000,
        paymentMethod: 'CARD', withdrawalAccountId: 'acc-1',
      }, successApi);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ChargeError);
      expect((err as ChargeError).code).toBe('E409');
    }
  });
});
