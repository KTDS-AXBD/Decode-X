import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-LB (LB-001~LB-006): Library 합성 도메인 — 77번째 도메인 (도서관 산업, 66번째 신규 산업) 📚 단일 클러스터 8 도메인 첫 사례 마일스톤
//   - library spec-container rules.md 기반 PoC source
//   - 합성 schema: libraries, member_cards, loans, library_visits,
//                  loan_payments, overdue_fee_records, overdue_refunds
//   - 도서관 lifecycle 패턴 — 동시대출한도/회원일일대출한도/도서대출atomic/대출상태전환/연체loan일괄만료/연체료환불atomic
//   - withRuleId 재사용 77번째 도메인 (신규 detector 0개, 78 Sprint 연속 정점 도전)
//   - LibraryError code-in-message 패턴 (S275 표준)
//   - 66 산업 연속 0 ABSENCE 도전 (..+SK+EX+GF+KP+SF+AQ+ZO+MS+MV+LB)
//   - 📚 단일 클러스터 8 도메인 첫 사례 마일스톤 (AM+TH+KP+AQ+ZO+MS+MV+LB 오프라인 엔터 8-클러스터)
//   - 거울 변환 30회차 round 마일스톤 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio → art → gambling → amusement → theater → skiing → exhibition → golf → kpop → surfing → aquarium → zoo → museum → movie → library)
//   - Sprint WT autopilot 분리 작업 4회차 (S370 1회차 ✅ + S371 2회차 fix-forward + S372 3회차 utils test DoD 보강 + S373 4회차 재현)
// ---------------------------------------------------------------------------

export interface LibraryRow {
  id: string;
  name: string;
  total_loan_capacity: number;
  active_loans: number;
  status: string; // active | suspended | retired
}

export interface MemberCardRow {
  id: string;
  member_id: string;
  library_id: string;
  tier_code: string; // free | basic | premium | vip
  loan_limit: number;
  loan_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface LoanRow {
  id: string;
  library_id: string;
  card_id: string;
  visit_id: string | null;
  payment_id: string | null;
  status: string; // reserved | active | returned | overdue | cancelled
  scheduled_at: string;
}

export interface LibraryVisitRow {
  id: string;
  library_id: string;
  loan_id: string;
  visit_no: string;
  status: string; // active | returned | overdue | cancelled | expired
  started_at: string;
}

export interface OverdueFeeRecordRow {
  id: string;
  member_id: string;
  visit_id: string;
  loan_cost: number;
  overdue_rate: number;
  overdue_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_LOANS_PER_LIBRARY = 500; // LB-001: 도서관별 동시 active 대출 한도 (공공도서관 기준 500권)

// ---------------------------------------------------------------------------
// LB-001: 도서관 동시 active 대출 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function borrowBook(
  db: Database.Database,
  libraryId: string,
  cardId: string,
): { loanId: string; libraryId: string; cardId: string; scheduledAt: string } {
  const library = db
    .prepare('SELECT active_loans, total_loan_capacity FROM libraries WHERE id = ?')
    .get(libraryId) as { active_loans: number; total_loan_capacity: number } | undefined;

  if (!library) throw new LibraryError('E404-LIBRARY', 'Library not found', 404);

  const limit = library.total_loan_capacity ?? MAX_CONCURRENT_LOANS_PER_LIBRARY;

  if (library.active_loans >= limit) {
    throw new LibraryError(
      'E422-LIBRARY-LOAN-LIMIT-EXCEEDED',
      `Library is at full loan capacity (${library.active_loans} >= ${limit})`,
      422,
    );
  }

  const loanId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO loans (id, library_id, card_id, visit_id, payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'reserved', ?)
  `).run(loanId, libraryId, cardId, scheduledAt);

  db.prepare(`
    UPDATE libraries SET active_loans = active_loans + 1 WHERE id = ?
  `).run(libraryId);

  return { loanId, libraryId, cardId, scheduledAt };
}

// ---------------------------------------------------------------------------
// LB-002: 회원 일일 대출 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, loanLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyMemberLimit(
  db: Database.Database,
  memberId: string,
  cardId: string,
  loans: number,
): { memberId: string; cardId: string; loanLimit: number; approved: boolean } {
  const card = db
    .prepare('SELECT loan_used, loan_limit FROM member_cards WHERE id = ? AND member_id = ? LIMIT 1')
    .get(cardId, memberId) as { loan_used: number; loan_limit: number } | undefined;

  if (!card) throw new LibraryError('E404-CARD', 'Member card not found', 404);

  // F445 Path B: var-vs-var, left=`loanLimit` (`limit` keyword 매칭)
  const loanLimit = card.loan_limit;

  if (card.loan_used + loans >= loanLimit) {
    throw new LibraryError(
      'E422-DAILY-LOAN-LIMIT-EXCEEDED',
      `Daily loan quota exhausted (${card.loan_used + loans} >= ${loanLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE member_cards SET loan_used = loan_used + ? WHERE id = ?
  `).run(loans, cardId);

  return { memberId, cardId, loanLimit, approved: true };
}

// ---------------------------------------------------------------------------
// LB-003: 도서 대출 atomic — library_visits + loans 상태전환 + loan_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processBookEntry(
  db: Database.Database,
  libraryId: string,
  loanId: string,
  visitNo: string,
  amount: number,
): { visitId: string; loanPaymentId: string; loanId: string; libraryId: string; startedAt: string } {
  const loan = db
    .prepare("SELECT status FROM loans WHERE id = ? AND status = 'reserved'")
    .get(loanId) as { status: string } | undefined;

  if (!loan) throw new LibraryError('E404-LOAN', 'Reserved loan not found', 404);

  const visitId = randomUUID();
  const loanPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO library_visits (id, library_id, loan_id, visit_no, status, started_at)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(visitId, libraryId, loanId, visitNo, startedAt);

    db.prepare(`
      UPDATE loans SET status = 'active', visit_id = ?, payment_id = ? WHERE id = ?
    `).run(visitId, loanPaymentId, loanId);

    db.prepare(`
      INSERT INTO loan_payments (id, loan_id, visit_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(loanPaymentId, loanId, visitId, amount, startedAt);
  });
  tx();

  return { visitId, loanPaymentId, loanId, libraryId, startedAt };
}

// ---------------------------------------------------------------------------
// LB-004: 대출 상태 전환 (reserved → active → returned / overdue / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionLoanStatus(
  db: Database.Database,
  loanId: string,
  newStatus: 'active' | 'returned' | 'overdue' | 'cancelled',
): { loanId: string; previousStatus: string; newStatus: string } {
  const loan = db
    .prepare('SELECT status FROM loans WHERE id = ?')
    .get(loanId) as { status: string } | undefined;

  if (!loan) throw new LibraryError('E404-LOAN', 'Loan not found', 404);

  const previousStatus = loan.status;
  const allowed =
    (loan.status === 'reserved' && newStatus === 'active') ||
    (loan.status === 'active' && newStatus === 'returned') ||
    (loan.status === 'active' && newStatus === 'overdue') ||
    (loan.status === 'reserved' && newStatus === 'cancelled') ||
    (loan.status === 'active' && newStatus === 'cancelled');

  if (!allowed) {
    throw new LibraryError(
      'E409-LOAN',
      `Cannot transition loan from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE loans SET status = ? WHERE id = ?`).run(newStatus, loanId);

  return { loanId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// LB-005: 연체 loan 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, SF-005/KP-005/.../MV-005 66번째 재사용)
// ---------------------------------------------------------------------------
export function expireOverdueLoanBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM library_visits
      WHERE status = 'overdue'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE library_visits
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// LB-006: 연체료 환불 atomic — 연체 visit 시 대출 비용 + 연체 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processOverdueRefund(
  db: Database.Database,
  memberId: string,
  visitId: string,
  loanCost: number,
  overdueRate: number,
): { feeRecordId: string; refundId: string; memberId: string; overdueAmount: number; refundedAt: string } {
  const visit = db
    .prepare("SELECT status FROM library_visits WHERE id = ? AND status = 'overdue'")
    .get(visitId) as { status: string } | undefined;

  if (!visit) throw new LibraryError('E404-OVERDUE-VISIT', 'Overdue visit not found', 404);

  const feeRecordId = randomUUID();
  const refundId = randomUUID();
  const overdueAmount = Math.round(loanCost * overdueRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO overdue_fee_records (id, member_id, visit_id, loan_cost, overdue_rate, overdue_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(feeRecordId, memberId, visitId, loanCost, overdueRate, overdueAmount);

    db.prepare(`
      INSERT INTO overdue_refunds (id, fee_record_id, member_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, feeRecordId, memberId, overdueAmount, refundedAt);

    db.prepare(`
      UPDATE overdue_fee_records SET status = 'refunded' WHERE id = ?
    `).run(feeRecordId);
  });
  tx();

  return { feeRecordId, refundId, memberId, overdueAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class LibraryError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'LibraryError';
  }
}
