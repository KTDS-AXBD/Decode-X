import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-GIFT (BL-G002~G006): 온누리상품권 P2P 선물 (수락/거절/만료/취소/이체)
//   - lpon-gift spec-container rules.md 기반 PoC source
//   - 합성 schema: gift_transactions, gift_ledger_entries, vouchers
// ---------------------------------------------------------------------------

export interface GiftTransactionRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  amount: number;
  status: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// BL-G002: 수신자 선물 수락
// ---------------------------------------------------------------------------
export function acceptGift(
  db: Database.Database,
  giftId: string,
  receiverId: string
): { giftId: string; status: string; acceptedAt: string; receiverBalance: number } {
  const gift = db
    .prepare('SELECT id, sender_id, receiver_id, amount, status, expires_at FROM gift_transactions WHERE id = ?')
    .get(giftId) as GiftTransactionRow | undefined;

  if (!gift) {
    throw new GiftError('E404', 'Gift not found', 404);
  }

  if (gift.receiver_id !== receiverId) {
    throw new GiftError('E403', 'Not your gift', 403);
  }

  // BL-G002 status check: pending → accepted (Status transition detector)
  if (gift.status !== 'pending') {
    throw new GiftError('E422-ST', 'Gift already accepted/rejected/expired/canceled', 422);
  }

  if (new Date(gift.expires_at) < new Date()) {
    throw new GiftError('E422-EXP', 'Gift expired', 422);
  }

  const acceptedAt = new Date().toISOString();
  const ledgerId = randomUUID();

  // BL-G002 + BL-G006: status pending → accepted + receiver balance increase (atomic)
  const tx = db.transaction(() => {
    db.prepare(`UPDATE gift_transactions SET status = 'accepted', updated_at = ? WHERE id = ?`)
      .run(acceptedAt, giftId);

    db.prepare(`UPDATE vouchers SET balance = balance + ? WHERE user_id = ?`)
      .run(gift.amount, gift.receiver_id);

    db.prepare(`
      INSERT INTO gift_ledger_entries (id, gift_id, account_id, direction, amount, created_at)
      VALUES (?, ?, ?, 'CREDIT_RECEIVER', ?, ?)
    `).run(ledgerId, giftId, gift.receiver_id, gift.amount, acceptedAt);
  });
  tx();

  const receiver = db.prepare('SELECT balance FROM vouchers WHERE user_id = ?').get(gift.receiver_id) as
    | { balance: number }
    | undefined;

  return {
    giftId,
    status: 'accepted',
    acceptedAt,
    receiverBalance: receiver?.balance ?? 0,
  };
}

// ---------------------------------------------------------------------------
// BL-G003: 수신자 선물 거절 → 발송자 잔액 복원
// ---------------------------------------------------------------------------
export function rejectGift(
  db: Database.Database,
  giftId: string,
  receiverId: string
): { giftId: string; status: string; rejectedAt: string } {
  const gift = db
    .prepare('SELECT id, sender_id, receiver_id, amount, status FROM gift_transactions WHERE id = ?')
    .get(giftId) as GiftTransactionRow | undefined;

  if (!gift) {
    throw new GiftError('E404', 'Gift not found', 404);
  }

  if (gift.receiver_id !== receiverId) {
    throw new GiftError('E403', 'Not your gift', 403);
  }

  // BL-G003 status check: pending → rejected (Status transition detector)
  if (gift.status !== 'pending') {
    throw new GiftError('E422-ST', 'Gift already processed', 422);
  }

  const rejectedAt = new Date().toISOString();
  const ledgerId = randomUUID();

  // BL-G003 + BL-G006: status pending → rejected + sender balance restore (atomic)
  const tx = db.transaction(() => {
    db.prepare(`UPDATE gift_transactions SET status = 'rejected', updated_at = ? WHERE id = ?`)
      .run(rejectedAt, giftId);

    db.prepare(`UPDATE vouchers SET balance = balance + ? WHERE user_id = ?`)
      .run(gift.amount, gift.sender_id);

    db.prepare(`
      INSERT INTO gift_ledger_entries (id, gift_id, account_id, direction, amount, created_at)
      VALUES (?, ?, ?, 'RESTORE_SENDER', ?, ?)
    `).run(ledgerId, giftId, gift.sender_id, gift.amount, rejectedAt);
  });
  tx();

  return { giftId, status: 'rejected', rejectedAt };
}

// ---------------------------------------------------------------------------
// BL-G004: 선물 만료 처리 (ES-GIFT-001: 이미 accepted면 처리 불가)
// ---------------------------------------------------------------------------
export function expireGift(
  db: Database.Database,
  giftId: string
): { giftId: string; status: string; expiredAt: string } {
  const gift = db
    .prepare('SELECT id, sender_id, receiver_id, amount, status, expires_at FROM gift_transactions WHERE id = ?')
    .get(giftId) as GiftTransactionRow | undefined;

  if (!gift) {
    throw new GiftError('E404', 'Gift not found', 404);
  }

  // ES-GIFT-001: accepted 후 만료 처리 불가 (실제 자산 이전 완료 보호)
  if (gift.status === 'accepted') {
    throw new GiftError('E422-ALREADY-ACCEPTED', 'Cannot expire accepted gift (ES-GIFT-001)', 422);
  }

  // BL-G004 status check: pending → expired (Status transition detector)
  if (gift.status !== 'pending') {
    throw new GiftError('E422-ST', 'Gift not in pending state', 422);
  }

  if (new Date(gift.expires_at) >= new Date()) {
    throw new GiftError('E422-NOTYET', 'Gift has not expired yet', 422);
  }

  const expiredAt = new Date().toISOString();
  const ledgerId = randomUUID();

  // BL-G004 + BL-G006: status pending → expired + sender balance restore (atomic)
  const tx = db.transaction(() => {
    db.prepare(`UPDATE gift_transactions SET status = 'expired', updated_at = ? WHERE id = ?`)
      .run(expiredAt, giftId);

    db.prepare(`UPDATE vouchers SET balance = balance + ? WHERE user_id = ?`)
      .run(gift.amount, gift.sender_id);

    db.prepare(`
      INSERT INTO gift_ledger_entries (id, gift_id, account_id, direction, amount, created_at)
      VALUES (?, ?, ?, 'EXPIRE_RESTORE', ?, ?)
    `).run(ledgerId, giftId, gift.sender_id, gift.amount, expiredAt);
  });
  tx();

  return { giftId, status: 'expired', expiredAt };
}

// ---------------------------------------------------------------------------
// BL-G005: 발송자 선물 취소 (ES-GIFT-002: accepted 후 취소 불가)
// ---------------------------------------------------------------------------
export function cancelGift(
  db: Database.Database,
  giftId: string,
  senderId: string
): { giftId: string; status: string; canceledAt: string } {
  const gift = db
    .prepare('SELECT id, sender_id, receiver_id, amount, status FROM gift_transactions WHERE id = ?')
    .get(giftId) as GiftTransactionRow | undefined;

  if (!gift) {
    throw new GiftError('E404', 'Gift not found', 404);
  }

  if (gift.sender_id !== senderId) {
    throw new GiftError('E403', 'Not your gift', 403);
  }

  // ES-GIFT-002: accepted 후 취소 불가
  if (gift.status === 'accepted') {
    throw new GiftError('E422-ALREADY-ACCEPTED', 'Cannot cancel accepted gift (ES-GIFT-002)', 422);
  }

  // BL-G005 status check: pending → canceled (Status transition detector)
  if (gift.status !== 'pending') {
    throw new GiftError('E422-ST', 'Gift not in pending state', 422);
  }

  const canceledAt = new Date().toISOString();
  const ledgerId = randomUUID();

  // BL-G005 + BL-G006: status pending → canceled + sender balance restore (atomic)
  const tx = db.transaction(() => {
    db.prepare(`UPDATE gift_transactions SET status = 'canceled', updated_at = ? WHERE id = ?`)
      .run(canceledAt, giftId);

    db.prepare(`UPDATE vouchers SET balance = balance + ? WHERE user_id = ?`)
      .run(gift.amount, gift.sender_id);

    db.prepare(`
      INSERT INTO gift_ledger_entries (id, gift_id, account_id, direction, amount, created_at)
      VALUES (?, ?, ?, 'CANCEL_RESTORE', ?, ?)
    `).run(ledgerId, giftId, gift.sender_id, gift.amount, canceledAt);
  });
  tx();

  return { giftId, status: 'canceled', canceledAt };
}

// ---------------------------------------------------------------------------
// BL-G006: 잔액 이전 단일 원자 처리 (debit_sender + credit_receiver)
// ---------------------------------------------------------------------------
export function transferGiftBalance(
  db: Database.Database,
  giftId: string,
  senderId: string,
  receiverId: string,
  amount: number
): { giftId: string; debitLedgerId: string; creditLedgerId: string; transferredAt: string } {
  if (amount <= 0) {
    throw new GiftError('E422-AMT', 'Transfer amount must be positive', 422);
  }

  const sender = db.prepare('SELECT balance FROM vouchers WHERE user_id = ?').get(senderId) as
    | { balance: number }
    | undefined;

  if (!sender || sender.balance < amount) {
    throw new GiftError('E422-BAL', 'Insufficient sender balance', 422);
  }

  const debitLedgerId = randomUUID();
  const creditLedgerId = randomUUID();
  const transferredAt = new Date().toISOString();

  // BL-G006: atomic transaction — sender debit + receiver credit + 2 ledger rows
  // (Atomic transaction detector: db.transaction()(() => { ... }))
  const tx = db.transaction(() => {
    db.prepare(`UPDATE vouchers SET balance = balance - ? WHERE user_id = ?`).run(amount, senderId);
    db.prepare(`UPDATE vouchers SET balance = balance + ? WHERE user_id = ?`).run(amount, receiverId);

    db.prepare(`
      INSERT INTO gift_ledger_entries (id, gift_id, account_id, direction, amount, created_at)
      VALUES (?, ?, ?, 'DEBIT_SENDER', ?, ?)
    `).run(debitLedgerId, giftId, senderId, amount, transferredAt);

    db.prepare(`
      INSERT INTO gift_ledger_entries (id, gift_id, account_id, direction, amount, created_at)
      VALUES (?, ?, ?, 'CREDIT_RECEIVER', ?, ?)
    `).run(creditLedgerId, giftId, receiverId, amount, transferredAt);

    // BL-G006 무결성 — receiver row 부재 시 throw → tx 자동 롤백
    const receiver = db.prepare('SELECT balance FROM vouchers WHERE user_id = ?').get(receiverId) as
      | { balance: number }
      | undefined;
    if (!receiver) {
      throw new GiftError('E500-INTEGRITY', 'Receiver voucher missing — rollback', 500);
    }
  });
  tx();

  return { giftId, debitLedgerId, creditLedgerId, transferredAt };
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------
export class GiftError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'GiftError';
  }
}
