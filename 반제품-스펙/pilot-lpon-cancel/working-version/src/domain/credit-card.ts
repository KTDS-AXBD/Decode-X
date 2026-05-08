import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-CC (CC-001~CC-006): Credit Card 합성 도메인 — 12번째 도메인 (LPON 외 산업 다양성)
//   - credit-card spec-container rules.md 기반 PoC source
//   - 합성 schema: credit_cards, card_transactions, card_payments
//   - 신용카드 산업 패턴 — 발급/한도/승인/상태/연체/취소
//   - withRuleId 재사용 12번째 도메인 (신규 detector 0개, 10 Sprint 연속 정점)
//   - CreditCardError code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------

export interface CreditCardRow {
  id: string;
  user_id: string;
  card_no: string;          // PAN (마스킹 권장)
  credit_score: number;     // 신용평가 점수
  credit_limit: number;     // 신용한도
  used_amount: number;      // 사용금액
  status: string;           // active | blocked | expired | cancelled | delinquent
  issued_at: string;
  expires_at: string;
  delinquent_since: string | null;
}

export interface CardTransactionRow {
  id: string;
  card_id: string;
  amount: number;
  merchant_id: string;
  status: string;           // approved | declined | cancelled | refunded
  approved_at: string | null;
  cancelled_at: string | null;
}

const MIN_CREDIT_SCORE = 600;
const MIN_INCOME_KRW = 24_000_000;
const DELINQUENT_DAYS = 30;

// ---------------------------------------------------------------------------
// CC-001: 카드 발급 신용평가 (신용점수 ≥ 600 AND 연소득 ≥ 24,000,000)
// (ThresholdCheck detector)
// ---------------------------------------------------------------------------
export function issueCard(
  db: Database.Database,
  userId: string,
  creditScore: number,
  annualIncome: number,
  requestedLimit: number,
): { cardId: string; approvedLimit: number; status: string } {
  if (creditScore < MIN_CREDIT_SCORE) {
    throw new CreditCardError('E422-CS', `Credit score below minimum (${creditScore} < ${MIN_CREDIT_SCORE})`, 422);
  }
  if (annualIncome < MIN_INCOME_KRW) {
    throw new CreditCardError('E422-IN', `Annual income below minimum (${annualIncome} < ${MIN_INCOME_KRW})`, 422);
  }

  // 한도 자동 산정: 연소득 30% + 신용점수 가산
  const baseLimit = Math.floor(annualIncome * 0.3);
  const scoreBonus = creditScore >= 750 ? 5_000_000 : creditScore >= 700 ? 2_000_000 : 0;
  const approvedLimit = Math.min(requestedLimit, baseLimit + scoreBonus);

  const cardId = randomUUID();
  const cardNo = `4xxx-xxxx-xxxx-${randomUUID().slice(0, 4)}`;
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 5 * 365 * 86_400_000).toISOString();

  db.prepare(`
    INSERT INTO credit_cards (id, user_id, card_no, credit_score, credit_limit, used_amount, status, issued_at, expires_at, delinquent_since)
    VALUES (?, ?, ?, ?, ?, 0, 'active', ?, ?, NULL)
  `).run(cardId, userId, cardNo, creditScore, approvedLimit, now, expires);

  return { cardId, approvedLimit, status: 'active' };
}

// ---------------------------------------------------------------------------
// CC-002: 결제 한도 검증 (used_amount + amount ≤ credit_limit)
// (ThresholdCheck detector)
// ---------------------------------------------------------------------------
export function checkPaymentLimit(
  db: Database.Database,
  cardId: string,
  amount: number,
): { canPay: boolean; remainingLimit: number } {
  const card = db
    .prepare('SELECT credit_limit, used_amount, status FROM credit_cards WHERE id = ?')
    .get(cardId) as { credit_limit: number; used_amount: number; status: string } | undefined;

  if (!card) {
    throw new CreditCardError('E404-CARD', 'Card not found', 404);
  }
  if (card.status !== 'active') {
    throw new CreditCardError('E409-ST', `Card not active (status=${card.status})`, 409);
  }

  const remainingLimit = card.credit_limit - card.used_amount;
  if (remainingLimit < amount) {
    throw new CreditCardError('E422-LIMIT', `Payment exceeds remaining limit (${amount} > ${remainingLimit})`, 422);
  }
  return { canPay: true, remainingLimit };
}

// ---------------------------------------------------------------------------
// CC-003: 결제 승인 atomic (used_amount += amount + transactions INSERT)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function approvePayment(
  db: Database.Database,
  cardId: string,
  amount: number,
  merchantId: string,
): { transactionId: string; remainingLimit: number; approvedAt: string } {
  const card = db
    .prepare('SELECT credit_limit, used_amount, status FROM credit_cards WHERE id = ?')
    .get(cardId) as { credit_limit: number; used_amount: number; status: string } | undefined;

  if (!card) throw new CreditCardError('E404-CARD', 'Card not found', 404);
  if (card.status !== 'active') throw new CreditCardError('E409-ST', `Card not active`, 409);
  if (card.credit_limit - card.used_amount < amount) {
    throw new CreditCardError('E422-LIMIT', 'Payment exceeds limit', 422);
  }

  const transactionId = randomUUID();
  const approvedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE credit_cards SET used_amount = used_amount + ? WHERE id = ?`)
      .run(amount, cardId);
    db.prepare(`
      INSERT INTO card_transactions (id, card_id, amount, merchant_id, status, approved_at, cancelled_at)
      VALUES (?, ?, ?, ?, 'approved', ?, NULL)
    `).run(transactionId, cardId, amount, merchantId, approvedAt);
  });
  tx();

  const remainingLimit = card.credit_limit - card.used_amount - amount;
  return { transactionId, remainingLimit, approvedAt };
}

// ---------------------------------------------------------------------------
// CC-004: 카드 상태 전환 (active → blocked / expired / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionCardStatus(
  db: Database.Database,
  cardId: string,
  newStatus: 'blocked' | 'expired' | 'cancelled',
): { cardId: string; previousStatus: string; newStatus: string } {
  const card = db
    .prepare('SELECT status FROM credit_cards WHERE id = ?')
    .get(cardId) as { status: string } | undefined;

  if (!card) throw new CreditCardError('E404-CARD', 'Card not found', 404);

  const previousStatus = card.status;
  if (previousStatus !== 'active') {
    throw new CreditCardError('E409-TR', `Cannot transition from ${previousStatus} to ${newStatus}`, 409);
  }

  db.prepare(`UPDATE credit_cards SET status = ? WHERE id = ?`)
    .run(newStatus, cardId);

  return { cardId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// CC-005: 연체 자동 마킹 (결제일 + 30일 초과 → status='delinquent')
// (StatusTransition detector — 정기 batch)
// ---------------------------------------------------------------------------
export function markDelinquentCards(
  db: Database.Database,
  asOfDate: string = new Date().toISOString(),
): { markedCount: number; delinquentCardIds: string[] } {
  const cutoff = new Date(new Date(asOfDate).getTime() - DELINQUENT_DAYS * 86_400_000).toISOString();

  // 30일 이상 미결제 카드 조회 (가상 — 결제일 기반)
  const candidates = db
    .prepare(`
      SELECT c.id FROM credit_cards c
      WHERE c.status = 'active'
        AND c.used_amount > 0
        AND NOT EXISTS (
          SELECT 1 FROM card_payments p
          WHERE p.card_id = c.id AND p.paid_at > ?
        )
    `)
    .all(cutoff) as Array<{ id: string }>;

  const delinquentCardIds: string[] = [];
  for (const c of candidates) {
    db.prepare(`UPDATE credit_cards SET status = 'delinquent', delinquent_since = ? WHERE id = ?`)
      .run(asOfDate, c.id);
    delinquentCardIds.push(c.id);
  }

  return { markedCount: delinquentCardIds.length, delinquentCardIds };
}

// ---------------------------------------------------------------------------
// CC-006: 결제 취소 → 한도 복구 (atomic)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function cancelTransaction(
  db: Database.Database,
  transactionId: string,
): { transactionId: string; restoredAmount: number; cancelledAt: string } {
  const txnRow = db
    .prepare('SELECT card_id, amount, status FROM card_transactions WHERE id = ?')
    .get(transactionId) as { card_id: string; amount: number; status: string } | undefined;

  if (!txnRow) throw new CreditCardError('E404-TX', 'Transaction not found', 404);
  if (txnRow.status !== 'approved') {
    throw new CreditCardError('E409-TX', `Cannot cancel transaction in status=${txnRow.status}`, 409);
  }

  const cancelledAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE card_transactions SET status = 'cancelled', cancelled_at = ? WHERE id = ?`)
      .run(cancelledAt, transactionId);
    db.prepare(`UPDATE credit_cards SET used_amount = used_amount - ? WHERE id = ?`)
      .run(txnRow.amount, txnRow.card_id);
  });
  tx();

  return { transactionId, restoredAmount: txnRow.amount, cancelledAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class CreditCardError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'CreditCardError';
  }
}
