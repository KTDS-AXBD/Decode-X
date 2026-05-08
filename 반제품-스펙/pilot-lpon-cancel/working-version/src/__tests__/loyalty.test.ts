import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  earnPoints,
  usePoints,
  redeemPoints,
  expirePoints,
  promoteGrade,
  clawbackOnRefund,
  LoyaltyError,
} from '../domain/loyalty.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.prepare(
    `CREATE TABLE loyalty_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0,
      total_earned INTEGER NOT NULL DEFAULT 0,
      grade TEXT NOT NULL DEFAULT 'BRONZE',
      status TEXT NOT NULL DEFAULT 'active',
      earned_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`
  ).run();
  db.prepare(
    `CREATE TABLE loyalty_ledger_entries (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      amount INTEGER NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  ).run();
  return db;
}

describe('loyalty domain (LP-001~LP-006)', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });

  // ── LP-001 적립 한도 ─────────────────────────────────
  describe('LP-001 earnPoints', () => {
    it('정상 적립', () => {
      const r = earnPoints(db, 'user-A', 5000, 'PURCHASE');
      expect(r.ledgerId).toMatch(/^[\w-]{36}$/);
      expect(r.newBalance).toBe(5000);
    });

    it('일일 한도 초과 → E429-LIMIT', () => {
      earnPoints(db, 'user-A', 9000, 'PURCHASE');
      expect(() => earnPoints(db, 'user-A', 2000, 'PURCHASE')).toThrow(/E429-LIMIT/);
    });

    it('다른 사용자 한도 별도', () => {
      earnPoints(db, 'user-A', 10_000, 'PURCHASE');
      const r = earnPoints(db, 'user-B', 5000, 'PURCHASE');
      expect(r.newBalance).toBe(5000);
    });
  });

  // ── LP-002 사용 가능 검증 ─────────────────────────────
  describe('LP-002 usePoints', () => {
    it('잔액 충분 → canUse=true', () => {
      earnPoints(db, 'user-A', 5000, 'PURCHASE');
      const r = usePoints(db, 'user-A', 1000);
      expect(r.canUse).toBe(true);
    });

    it('계정 없음 → E404-ACCOUNT', () => {
      expect(() => usePoints(db, 'nonexistent', 100)).toThrow(/E404-ACCOUNT/);
    });

    it('잔액 부족 → E422-BAL', () => {
      earnPoints(db, 'user-A', 1000, 'PURCHASE');
      expect(() => usePoints(db, 'user-A', 5000)).toThrow(/E422-BAL/);
    });

    it('비활성 → E409-STATUS', () => {
      earnPoints(db, 'user-A', 5000, 'PURCHASE');
      db.prepare(`UPDATE loyalty_accounts SET status='expired' WHERE user_id='user-A'`).run();
      expect(() => usePoints(db, 'user-A', 1000)).toThrow(/E409-STATUS/);
    });
  });

  // ── LP-003 사용 atomic ─────────────────────────────────
  describe('LP-003 redeemPoints', () => {
    it('atomic 차감 + ledger', () => {
      earnPoints(db, 'user-A', 5000, 'PURCHASE');
      const r = redeemPoints(db, 'user-A', 1500, 'ORDER-001');
      expect(r.remainingBalance).toBe(3500);

      const ledgers = db.prepare(`SELECT * FROM loyalty_ledger_entries WHERE direction='REDEEM'`).all() as Array<{ amount: number }>;
      expect(ledgers).toHaveLength(1);
      expect(ledgers[0]?.amount).toBe(1500);
    });

    it('잔액 부족 → E422-BAL', () => {
      earnPoints(db, 'user-A', 1000, 'PURCHASE');
      expect(() => redeemPoints(db, 'user-A', 5000, 'ORDER-X')).toThrow(/E422-BAL/);
    });
  });

  // ── LP-004 만료 자동 소멸 ─────────────────────────────
  describe('LP-004 expirePoints', () => {
    it('1년 경과 시 expired', () => {
      earnPoints(db, 'user-A', 5000, 'PURCHASE');
      const past = new Date(Date.now() - 86_400_000).toISOString();
      db.prepare(`UPDATE loyalty_accounts SET expires_at=? WHERE user_id='user-A'`).run(past);
      const r = expirePoints(db, 'user-A');
      expect(r.expired).toBe(true);
      expect(r.status).toBe('expired');
      expect(r.finalBalance).toBe(0);
    });

    it('만료 전 active 유지', () => {
      earnPoints(db, 'user-A', 5000, 'PURCHASE');
      const r = expirePoints(db, 'user-A');
      expect(r.expired).toBe(false);
      expect(r.status).toBe('active');
      expect(r.finalBalance).toBe(5000);
    });
  });

  // ── LP-005 등급 승급 ─────────────────────────────────
  describe('LP-005 promoteGrade', () => {
    it('SILVER 승급 (50,000P)', () => {
      earnPoints(db, 'user-A', 10_000, 'P1');
      // total_earned 50_000 시뮬 (직접 update)
      db.prepare(`UPDATE loyalty_accounts SET total_earned=50000 WHERE user_id='user-A'`).run();
      const r = promoteGrade(db, 'user-A');
      expect(r.promoted).toBe(true);
      expect(r.oldGrade).toBe('BRONZE');
      expect(r.newGrade).toBe('SILVER');
    });

    it('GOLD 승급 (200,000P)', () => {
      earnPoints(db, 'user-A', 10_000, 'P1');
      db.prepare(`UPDATE loyalty_accounts SET total_earned=250000, grade='SILVER' WHERE user_id='user-A'`).run();
      const r = promoteGrade(db, 'user-A');
      expect(r.promoted).toBe(true);
      expect(r.newGrade).toBe('GOLD');
    });

    it('임계 미달 → 등급 유지', () => {
      earnPoints(db, 'user-A', 10_000, 'P1');
      const r = promoteGrade(db, 'user-A');
      expect(r.promoted).toBe(false);
      expect(r.newGrade).toBe('BRONZE');
    });
  });

  // ── LP-006 환불 회수 ─────────────────────────────────
  describe('LP-006 clawbackOnRefund', () => {
    it('30일 이내 정상 회수', () => {
      const e = earnPoints(db, 'user-A', 5000, 'PURCHASE');
      const r = clawbackOnRefund(db, e.ledgerId);
      expect(r.clawbackAmount).toBe(5000);

      const acc = db.prepare(`SELECT balance, total_earned FROM loyalty_accounts WHERE user_id='user-A'`).get() as { balance: number; total_earned: number };
      expect(acc.balance).toBe(0);
      expect(acc.total_earned).toBe(0);
    });

    it('30일 초과 → E422-WINDOW', () => {
      const e = earnPoints(db, 'user-A', 5000, 'PURCHASE');
      const past = new Date(Date.now() - 31 * 86_400_000).toISOString();
      db.prepare(`UPDATE loyalty_ledger_entries SET created_at=? WHERE id=?`).run(past, e.ledgerId);
      expect(() => clawbackOnRefund(db, e.ledgerId)).toThrow(/E422-WINDOW/);
    });

    it('이미 사용된 포인트 회수 시도 → E422-USED', () => {
      const e = earnPoints(db, 'user-A', 5000, 'PURCHASE');
      redeemPoints(db, 'user-A', 5000, 'ORDER-X');
      // balance=0, total_earned=5000 — 회수 시 잔액 부족
      expect(() => clawbackOnRefund(db, e.ledgerId)).toThrow(/E422-USED/);
    });

    it('미존재 ledger → E404-LEDGER', () => {
      expect(() => clawbackOnRefund(db, 'nonexistent-id')).toThrow(/E404-LEDGER/);
    });
  });
});
