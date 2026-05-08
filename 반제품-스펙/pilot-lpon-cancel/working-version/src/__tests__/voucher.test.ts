import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  issueVoucher,
  useVoucher,
  redeemVoucher,
  autoDestroyVoucher,
  refundVoucher,
  transferVoucher,
  VoucherError,
} from '../domain/voucher.js';

// ---------------------------------------------------------------------------
// 합성 schema (generic-voucher PoC — 운영 schema 미존재)
// ---------------------------------------------------------------------------
function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.prepare(
    `CREATE TABLE vouchers (
      id TEXT PRIMARY KEY,
      issuer_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      transferred_count INTEGER NOT NULL DEFAULT 0,
      used_count INTEGER NOT NULL DEFAULT 0
    )`
  ).run();
  db.prepare(
    `CREATE TABLE voucher_ledger_entries (
      id TEXT PRIMARY KEY,
      voucher_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      amount INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )`
  ).run();
  return db;
}

describe('voucher domain (V-001~V-006)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  // ─────────────────────────────────────────────────────────────────────
  // V-001: 발행 한도
  // ─────────────────────────────────────────────────────────────────────
  describe('V-001 issueVoucher', () => {
    it('발행 정상 처리 (한도 이내)', () => {
      const result = issueVoucher(db, 'issuer-A', 'owner-X', 10_000);
      expect(result.voucherId).toMatch(/^[\w-]{36}$/);
      expect(result.issuedAt).toBeTruthy();
      expect(result.expiresAt).toBeTruthy();

      const row = db.prepare(`SELECT * FROM vouchers WHERE id = ?`).get(result.voucherId) as { balance: number; status: string };
      expect(row.balance).toBe(10_000);
      expect(row.status).toBe('active');
    });

    it('한도 초과 시 E429 throw', () => {
      // 1,000건 사전 시드
      const today = new Date().toISOString();
      for (let i = 0; i < 1000; i++) {
        db.prepare(
          `INSERT INTO vouchers (id, issuer_id, owner_id, balance, status, issued_at, expires_at, transferred_count, used_count)
           VALUES (?, 'issuer-A', 'owner-X', 1000, 'active', ?, ?, 0, 0)`
        ).run(`v${String(i)}`, today, today);
      }

      expect(() => issueVoucher(db, 'issuer-A', 'owner-X', 1000)).toThrow(VoucherError);
      try {
        issueVoucher(db, 'issuer-A', 'owner-X', 1000);
      } catch (e) {
        expect((e as VoucherError).code).toBe('E429-LIMIT');
      }
    });

    it('다른 issuer는 영향 없음', () => {
      const today = new Date().toISOString();
      for (let i = 0; i < 1000; i++) {
        db.prepare(
          `INSERT INTO vouchers (id, issuer_id, owner_id, balance, status, issued_at, expires_at, transferred_count, used_count)
           VALUES (?, 'issuer-A', 'owner-X', 1000, 'active', ?, ?, 0, 0)`
        ).run(`v${String(i)}`, today, today);
      }
      // issuer-B는 한도 별도
      const r = issueVoucher(db, 'issuer-B', 'owner-Y', 5000);
      expect(r.voucherId).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // V-002: 사용 가능 검증
  // ─────────────────────────────────────────────────────────────────────
  describe('V-002 useVoucher', () => {
    it('정상 active + 미만료', () => {
      const r = issueVoucher(db, 'issuer-A', 'owner-X', 10_000);
      const u = useVoucher(db, r.voucherId);
      expect(u.canUse).toBe(true);
      expect(u.daysLeft).toBeGreaterThanOrEqual(364);
    });

    it('미존재 voucher → E404', () => {
      expect(() => useVoucher(db, 'nonexistent-id')).toThrow(/E404-VOUCHER/);
    });

    it('만료 → E410', () => {
      // 직접 expires_at 과거로 시드
      const past = new Date(Date.now() - 86_400_000).toISOString();
      db.prepare(
        `INSERT INTO vouchers (id, issuer_id, owner_id, balance, status, issued_at, expires_at, transferred_count, used_count)
         VALUES ('v-expired', 'issuer-A', 'owner-X', 10000, 'active', '2025-01-01T00:00:00Z', ?, 0, 0)`
      ).run(past);

      expect(() => useVoucher(db, 'v-expired')).toThrow(/E410-EXPIRED/);
    });

    it('비활성 status → E409', () => {
      const r = issueVoucher(db, 'issuer-A', 'owner-X', 10_000);
      db.prepare(`UPDATE vouchers SET status = 'destroyed' WHERE id = ?`).run(r.voucherId);
      expect(() => useVoucher(db, r.voucherId)).toThrow(/E409-STATUS/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // V-003: 사용 시 잔액 차감 (atomic)
  // ─────────────────────────────────────────────────────────────────────
  describe('V-003 redeemVoucher', () => {
    it('atomic 차감 + ledger 기록', () => {
      const v = issueVoucher(db, 'issuer-A', 'owner-X', 10_000);
      const r = redeemVoucher(db, v.voucherId, 3000);
      expect(r.remainingBalance).toBe(7000);

      const row = db.prepare(`SELECT * FROM vouchers WHERE id = ?`).get(v.voucherId) as {
        balance: number;
        used_count: number;
      };
      expect(row.balance).toBe(7000);
      expect(row.used_count).toBe(1);

      const ledgers = db.prepare(`SELECT * FROM voucher_ledger_entries WHERE voucher_id = ?`).all(v.voucherId) as Array<{
        direction: string;
        amount: number;
      }>;
      expect(ledgers).toHaveLength(1);
      expect(ledgers[0]?.direction).toBe('DEBIT_REDEEM');
      expect(ledgers[0]?.amount).toBe(3000);
    });

    it('잔액 부족 → E422', () => {
      const v = issueVoucher(db, 'issuer-A', 'owner-X', 1000);
      expect(() => redeemVoucher(db, v.voucherId, 5000)).toThrow(/E422-BAL/);
    });

    it('미존재 voucher → E404', () => {
      expect(() => redeemVoucher(db, 'nonexistent', 100)).toThrow(/E404-VOUCHER/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // V-004: 자동 소멸
  // ─────────────────────────────────────────────────────────────────────
  describe('V-004 autoDestroyVoucher', () => {
    it('잔액 ≤ 1,000원 → status=destroyed', () => {
      const v = issueVoucher(db, 'issuer-A', 'owner-X', 800);
      const r = autoDestroyVoucher(db, v.voucherId);
      expect(r.destroyed).toBe(true);
      expect(r.status).toBe('destroyed');
      expect(r.finalBalance).toBe(0);
    });

    it('잔액 = 1,000원 (경계) → destroy', () => {
      const v = issueVoucher(db, 'issuer-A', 'owner-X', 1000);
      const r = autoDestroyVoucher(db, v.voucherId);
      expect(r.destroyed).toBe(true);
    });

    it('잔액 > 1,000원 → active 유지', () => {
      const v = issueVoucher(db, 'issuer-A', 'owner-X', 5000);
      const r = autoDestroyVoucher(db, v.voucherId);
      expect(r.destroyed).toBe(false);
      expect(r.status).toBe('active');
      expect(r.finalBalance).toBe(5000);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // V-005: 환불 (사용 0 + 7일 이내)
  // ─────────────────────────────────────────────────────────────────────
  describe('V-005 refundVoucher', () => {
    it('미사용 + 7일 이내 → 정상 환불', () => {
      const v = issueVoucher(db, 'issuer-A', 'owner-X', 10_000);
      const r = refundVoucher(db, v.voucherId);
      expect(r.refundable).toBe(true);
      expect(r.refundAmount).toBe(10_000);

      const row = db.prepare(`SELECT * FROM vouchers WHERE id = ?`).get(v.voucherId) as {
        status: string;
        balance: number;
      };
      expect(row.status).toBe('refunded');
      expect(row.balance).toBe(0);
    });

    it('1회 사용 시 → E422-USED 거부', () => {
      const v = issueVoucher(db, 'issuer-A', 'owner-X', 10_000);
      redeemVoucher(db, v.voucherId, 1000);
      expect(() => refundVoucher(db, v.voucherId)).toThrow(/E422-USED/);
    });

    it('7일 초과 → E422-WINDOW 거부', () => {
      // 8일 전 발행 시드
      const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
      db.prepare(
        `INSERT INTO vouchers (id, issuer_id, owner_id, balance, status, issued_at, expires_at, transferred_count, used_count)
         VALUES ('v-old', 'issuer-A', 'owner-X', 10000, 'active', ?, ?, 0, 0)`
      ).run(eightDaysAgo, new Date(Date.now() + 357 * 86_400_000).toISOString());

      expect(() => refundVoucher(db, 'v-old')).toThrow(/E422-WINDOW/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // V-006: 양도 1회만
  // ─────────────────────────────────────────────────────────────────────
  describe('V-006 transferVoucher', () => {
    it('1회 양도 정상 처리 + status=transferred', () => {
      const v = issueVoucher(db, 'issuer-A', 'owner-X', 10_000);
      const r = transferVoucher(db, v.voucherId, 'owner-Y');
      expect(r.previousOwner).toBe('owner-X');
      expect(r.newOwner).toBe('owner-Y');

      const row = db.prepare(`SELECT * FROM vouchers WHERE id = ?`).get(v.voucherId) as {
        owner_id: string;
        transferred_count: number;
        status: string;
      };
      expect(row.owner_id).toBe('owner-Y');
      expect(row.transferred_count).toBe(1);
      expect(row.status).toBe('transferred');
    });

    it('2회 양도 시도 → E423-LOCKED', () => {
      const v = issueVoucher(db, 'issuer-A', 'owner-X', 10_000);
      transferVoucher(db, v.voucherId, 'owner-Y');
      expect(() => transferVoucher(db, v.voucherId, 'owner-Z')).toThrow(/E423-LOCKED/);
    });

    it('비활성 상태에서 양도 시도 → 거부', () => {
      const v = issueVoucher(db, 'issuer-A', 'owner-X', 10_000);
      db.prepare(`UPDATE vouchers SET status = 'destroyed' WHERE id = ?`).run(v.voucherId);
      // status=destroyed인 경우 E409-STATUS 또는 E423-LOCKED — transferred_count=0이라 E409 우선
      expect(() => transferVoucher(db, v.voucherId, 'owner-Y')).toThrow(VoucherError);
    });
  });
});
