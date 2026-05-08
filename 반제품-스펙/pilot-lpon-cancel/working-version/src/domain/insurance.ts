import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-IN (IN-001~IN-006): Insurance 합성 도메인 — 15번째 도메인 (보험 산업, 4번째 신규 산업)
//   - insurance spec-container rules.md 기반 PoC source
//   - 합성 schema: policies, claims, claim_payments
//   - 보험 lifecycle 패턴 — 가입/청구한도/청구승인/상태/만료/청구거절-환불
//   - withRuleId 재사용 15번째 도메인 (신규 detector 0개, 13 Sprint 연속 정점)
//   - InsuranceError code-in-message 패턴 (S275 표준)
//   - detector 신뢰도 5 Sprint cascade(S278~S282) + 3 산업 연속 입증 패턴(S278+S283+S284) 활용
// ---------------------------------------------------------------------------

export interface PolicyRow {
  id: string;
  user_id: string;
  policy_type: string;       // LIFE | HEALTH | AUTO | PROPERTY
  premium_krw: number;        // 월 보험료
  coverage_limit: number;     // 보장 한도
  reserved_amount: number;    // 누적 청구 사용 금액
  status: string;             // active | suspended | cancelled | expired
  insured_age: number;
  issued_at: string;
  expires_at: string | null;
  cancelled_at: string | null;
}

export interface ClaimRow {
  id: string;
  policy_id: string;
  claim_amount: number;
  claim_type: string;         // MEDICAL | ACCIDENT | DAMAGE | DEATH
  status: string;             // pending | approved | rejected | paid
  filed_at: string;
  approved_at: string | null;
  rejected_at: string | null;
}

const MIN_PREMIUM_KRW = 10_000;
const MAX_INSURED_AGE = 80;
const MIN_INSURED_AGE = 18;
const REFUND_GRACE_DAYS = 30;

// ---------------------------------------------------------------------------
// IN-001: 보험 가입 (premium ≥ 10,000 AND 18 ≤ age ≤ 80)
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function issuePolicy(
  db: Database.Database,
  userId: string,
  policyType: string,
  premiumKrw: number,
  coverageLimit: number,
  insuredAge: number,
): { policyId: string; status: string; expiresAt: string } {
  if (premiumKrw < MIN_PREMIUM_KRW) {
    throw new InsuranceError('E422-PR', `Premium below minimum (${premiumKrw} < ${MIN_PREMIUM_KRW})`, 422);
  }
  if (insuredAge < MIN_INSURED_AGE) {
    throw new InsuranceError('E422-AGE-MIN', `Age below minimum (${insuredAge} < ${MIN_INSURED_AGE})`, 422);
  }
  if (insuredAge > MAX_INSURED_AGE) {
    throw new InsuranceError('E422-AGE-MAX', `Age above maximum (${insuredAge} > ${MAX_INSURED_AGE})`, 422);
  }

  const policyId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 365 * 86_400_000).toISOString();
  const issuedAt = now.toISOString();

  db.prepare(`
    INSERT INTO policies (id, user_id, policy_type, premium_krw, coverage_limit, reserved_amount, status, insured_age, issued_at, expires_at, cancelled_at)
    VALUES (?, ?, ?, ?, ?, 0, 'active', ?, ?, ?, NULL)
  `).run(policyId, userId, policyType, premiumKrw, coverageLimit, insuredAge, issuedAt, expiresAt);

  return { policyId, status: 'active', expiresAt };
}

// ---------------------------------------------------------------------------
// IN-002: 청구 한도 검증 (reserved_amount + claim_amount ≤ coverage_limit)
// (ThresholdCheck detector — F445 Path B var-vs-var with `limit` keyword)
// ---------------------------------------------------------------------------
export function checkClaimLimit(
  db: Database.Database,
  policyId: string,
  claimAmount: number,
): { canClaim: boolean; remainingCoverage: number } {
  const policy = db
    .prepare('SELECT coverage_limit, reserved_amount, status FROM policies WHERE id = ?')
    .get(policyId) as { coverage_limit: number; reserved_amount: number; status: string } | undefined;

  if (!policy) {
    throw new InsuranceError('E404-PO', 'Policy not found', 404);
  }
  if (policy.status !== 'active') {
    throw new InsuranceError('E409-ST', `Policy not active (status=${policy.status})`, 409);
  }

  const remainingCoverage = policy.coverage_limit - policy.reserved_amount;
  // F445 Path B: var-vs-var, left=`remainingCoverage` (no keyword) but right=`claimAmount` (has `amount`-not in pattern)
  // 실제: left에 `Coverage` (no match) — Use coverage_limit < required pattern instead
  if (remainingCoverage < claimAmount) {
    throw new InsuranceError('E422-LIMIT', `Claim exceeds remaining coverage (${claimAmount} > ${remainingCoverage})`, 422);
  }
  return { canClaim: true, remainingCoverage };
}

// ---------------------------------------------------------------------------
// IN-003: 청구 승인 atomic (claim status='approved' + reserved_amount UPDATE)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function approveClaim(
  db: Database.Database,
  claimId: string,
): { claimId: string; approvedAmount: number; approvedAt: string } {
  const claim = db
    .prepare('SELECT id, policy_id, claim_amount, status FROM claims WHERE id = ?')
    .get(claimId) as { id: string; policy_id: string; claim_amount: number; status: string } | undefined;

  if (!claim) throw new InsuranceError('E404-CL', 'Claim not found', 404);
  if (claim.status !== 'pending') {
    throw new InsuranceError('E409-CL', `Cannot approve claim status=${claim.status}`, 409);
  }

  const policy = db
    .prepare('SELECT coverage_limit, reserved_amount, status FROM policies WHERE id = ?')
    .get(claim.policy_id) as { coverage_limit: number; reserved_amount: number; status: string } | undefined;

  if (!policy || policy.status !== 'active') {
    throw new InsuranceError('E409-PO', 'Policy not active', 409);
  }
  if (policy.coverage_limit - policy.reserved_amount < claim.claim_amount) {
    throw new InsuranceError('E422-LIMIT', 'Claim exceeds remaining coverage', 422);
  }

  const approvedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE claims SET status = 'approved', approved_at = ? WHERE id = ?`)
      .run(approvedAt, claimId);
    db.prepare(`UPDATE policies SET reserved_amount = reserved_amount + ? WHERE id = ?`)
      .run(claim.claim_amount, claim.policy_id);
  });
  tx();

  return { claimId, approvedAmount: claim.claim_amount, approvedAt };
}

// ---------------------------------------------------------------------------
// IN-004: 정책 상태 전환 (active ↔ suspended, → cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionPolicyStatus(
  db: Database.Database,
  policyId: string,
  newStatus: 'suspended' | 'cancelled' | 'active',
): { policyId: string; previousStatus: string; newStatus: string } {
  const policy = db
    .prepare('SELECT status FROM policies WHERE id = ?')
    .get(policyId) as { status: string } | undefined;

  if (!policy) throw new InsuranceError('E404-PO', 'Policy not found', 404);

  const previousStatus = policy.status;
  // 허용 전환: active ↔ suspended, active → cancelled, suspended → active/cancelled
  const allowed =
    (previousStatus === 'active' && ['suspended', 'cancelled'].includes(newStatus)) ||
    (previousStatus === 'suspended' && ['active', 'cancelled'].includes(newStatus));

  if (!allowed) {
    throw new InsuranceError('E409-TR', `Cannot transition from ${previousStatus} to ${newStatus}`, 409);
  }

  const cancelledAt = newStatus === 'cancelled' ? new Date().toISOString() : null;
  if (cancelledAt) {
    db.prepare(`UPDATE policies SET status = ?, cancelled_at = ? WHERE id = ?`)
      .run(newStatus, cancelledAt, policyId);
  } else {
    db.prepare(`UPDATE policies SET status = ? WHERE id = ?`)
      .run(newStatus, policyId);
  }

  return { policyId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// IN-005: 만료 자동 처리 (expires_at < now → status='expired' batch)
// (StatusTransition detector — batch 패턴, CC-005/DV-005/SB-005 동일 형태)
// ---------------------------------------------------------------------------
export function markExpiredPolicies(
  db: Database.Database,
  asOfDate: string = new Date().toISOString(),
): { markedCount: number; expiredPolicyIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM policies
      WHERE status = 'active'
        AND expires_at IS NOT NULL
        AND expires_at < ?
    `)
    .all(asOfDate) as Array<{ id: string }>;

  const expiredPolicyIds: string[] = [];
  for (const p of candidates) {
    db.prepare(`UPDATE policies SET status = 'expired' WHERE id = ?`)
      .run(p.id);
    expiredPolicyIds.push(p.id);
  }

  return { markedCount: expiredPolicyIds.length, expiredPolicyIds };
}

// ---------------------------------------------------------------------------
// IN-006: 청구 거절 + 부분 환불 atomic (claim 거절 + 30일 이내 premium 환불)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function rejectClaimWithRefund(
  db: Database.Database,
  claimId: string,
  reason: string,
): { refundPaymentId: string | null; refundAmount: number; rejectedAt: string } {
  const claim = db
    .prepare('SELECT id, policy_id, status, filed_at FROM claims WHERE id = ?')
    .get(claimId) as { id: string; policy_id: string; status: string; filed_at: string } | undefined;

  if (!claim) throw new InsuranceError('E404-CL', 'Claim not found', 404);
  if (claim.status !== 'pending') {
    throw new InsuranceError('E409-CL', `Cannot reject claim status=${claim.status}`, 409);
  }

  const policy = db
    .prepare('SELECT premium_krw FROM policies WHERE id = ?')
    .get(claim.policy_id) as { premium_krw: number } | undefined;

  if (!policy) throw new InsuranceError('E404-PO', 'Policy not found', 404);

  const filedDate = new Date(claim.filed_at);
  const now = new Date();
  const elapsedDays = (now.getTime() - filedDate.getTime()) / (1000 * 60 * 60 * 24);

  // 30일 이내 거절 시 premium 1회분 환불 (부분), 초과 시 0원
  const refundAmount = elapsedDays <= REFUND_GRACE_DAYS ? policy.premium_krw : 0;
  const refundPaymentId = refundAmount > 0 ? randomUUID() : null;
  const rejectedAt = now.toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE claims SET status = 'rejected', rejected_at = ? WHERE id = ?`)
      .run(rejectedAt, claimId);
    if (refundPaymentId && refundAmount > 0) {
      db.prepare(`
        INSERT INTO claim_payments (id, claim_id, amount, payment_type, paid_at)
        VALUES (?, ?, ?, 'refund', ?)
      `).run(refundPaymentId, claimId, refundAmount, rejectedAt);
    }
  });
  tx();

  void reason;
  return { refundPaymentId, refundAmount, rejectedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class InsuranceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'InsuranceError';
  }
}
