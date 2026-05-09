import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-GV (GV-001~GV-006): Government/Public 합성 도메인 — 25번째 도메인 (공공 산업, 14번째 신규 산업)
//   - government spec-container rules.md 기반 PoC source
//   - 합성 schema: permits, fee_tiers, approval_workflows, permit_applications, overdue_penalties
//   - 공공 lifecycle 패턴 — 허가신청한도/누진수수료/결재승인atomic/신청상태전환/연체가산배치/문서검증atomic
//   - withRuleId 재사용 25번째 도메인 (신규 detector 0개, 23 Sprint 연속 정점)
//   - GovernmentError code-in-message 패턴 (S275 표준)
//   - 14 산업 연속 0 ABSENCE 목표 (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN + GV)
// ---------------------------------------------------------------------------

export interface PermitApplicationRow {
  id: string;
  applicant_id: string;
  permit_type: string;     // construction | business | environmental | vehicle | trade
  status: string;          // submitted | reviewing | approved | issued | rejected | expired
  fiscal_year: string;
  application_count: number;
  submitted_at: string;
}

export interface FeeTierRow {
  id: string;
  tier_level: number;
  fee_tier_limit: number;
  rate_per_unit: number;
}

export interface ApprovalWorkflowRow {
  id: string;
  permit_id: string;
  status: string;     // pending | approved | rejected
  approved_at: string | null;
  issued_at: string | null;
}

export interface DocumentRow {
  id: string;
  permit_id: string;
  doc_type: string;   // identity | business_reg | site_plan | environmental_impact
  status: string;     // pending | validated | certified | issued | rejected
  validated_at: string | null;
  certified_at: string | null;
  issued_at: string | null;
}

export interface OverduePenaltyRow {
  id: string;
  applicant_id: string;
  overdue_amount: number;
  status: string;     // pending | penalized | waived
  penalty_applied_at: string | null;
}

const MAX_ANNUAL_PERMIT_COUNT = 10;   // GV-001: 해당 회계연도 허가 신청 한도
const MAX_OVERDUE_PENALTY_RATE = 0.05; // GV-005: 연체 가산 비율 (5%)

// ---------------------------------------------------------------------------
// GV-001: 허가 신청 — 연간 신청 한도 검증 (해당 회계연도 한도)
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function submitPermitApplication(
  db: Database.Database,
  applicantId: string,
  permitType: string,
  fiscalYear: string,
): { applicationId: string; permitType: string; submittedAt: string } {
  const existing = db
    .prepare(`SELECT COUNT(*) as cnt FROM permit_applications WHERE applicant_id = ? AND fiscal_year = ?`)
    .get(applicantId, fiscalYear) as { cnt: number };

  const currentCount = existing.cnt;
  if (currentCount >= MAX_ANNUAL_PERMIT_COUNT) {
    throw new GovernmentError(
      'E422-PERMIT-LIMIT',
      `Annual permit limit reached (${currentCount} >= ${MAX_ANNUAL_PERMIT_COUNT}) for fiscal year ${fiscalYear}`,
      422,
    );
  }

  const applicationId = randomUUID();
  const submittedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO permit_applications (id, applicant_id, permit_type, status, fiscal_year, application_count, submitted_at)
    VALUES (?, ?, ?, 'submitted', ?, ?, ?)
  `).run(applicationId, applicantId, permitType, fiscalYear, currentCount + 1, submittedAt);

  return { applicationId, permitType, submittedAt };
}

// ---------------------------------------------------------------------------
// GV-002: 누진 수수료 구간 계산 — 누진 수수료 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, feeAmount > feeTierLimit 'limit' keyword 매칭)
// ---------------------------------------------------------------------------
export function computeFeeTier(
  db: Database.Database,
  permitId: string,
  feeAmount: number,
): { tierId: string; tierLevel: number; ratePerUnit: number; computedFee: number } {
  const tiers = db
    .prepare('SELECT * FROM fee_tiers ORDER BY tier_level ASC')
    .all() as FeeTierRow[];

  if (tiers.length === 0) {
    throw new GovernmentError('E404-FEE-TIER', 'No fee tiers configured', 404);
  }

  // F445 Path B: var-vs-var, left=`feeTierLimit` (`limit` keyword 매칭)
  let selectedTier = tiers[tiers.length - 1]!;
  for (const tier of tiers) {
    const feeTierLimit = tier.fee_tier_limit;
    if (feeAmount <= feeTierLimit) {
      selectedTier = tier;
      break;
    }
  }

  const computedFee = Math.round(feeAmount * selectedTier.rate_per_unit * 100) / 100;

  db.prepare(`UPDATE permit_applications SET status = 'reviewing' WHERE id = ? AND status = 'submitted'`)
    .run(permitId);

  return {
    tierId: selectedTier.id,
    tierLevel: selectedTier.tier_level,
    ratePerUnit: selectedTier.rate_per_unit,
    computedFee,
  };
}

// ---------------------------------------------------------------------------
// GV-003: 결재 워크플로우 atomic — 결재 + 승인 + 발급 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processApproval(
  db: Database.Database,
  permitId: string,
): { workflowId: string; permitId: string; approvedAt: string; issuedAt: string } {
  const permit = db
    .prepare('SELECT id, status FROM permit_applications WHERE id = ?')
    .get(permitId) as { id: string; status: string } | undefined;

  if (!permit) throw new GovernmentError('E404-PERMIT', 'Permit application not found', 404);
  if (permit.status !== 'reviewing') {
    throw new GovernmentError(
      'E409-PERMIT',
      `Cannot process approval for permit with status=${permit.status}`,
      409,
    );
  }

  const workflowId = randomUUID();
  const approvedAt = new Date().toISOString();
  const issuedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO approval_workflows (id, permit_id, status, approved_at, issued_at)
      VALUES (?, ?, 'approved', ?, ?)
    `).run(workflowId, permitId, approvedAt, issuedAt);
    db.prepare(`UPDATE permit_applications SET status = 'approved' WHERE id = ?`)
      .run(permitId);
    db.prepare(`UPDATE permit_applications SET status = 'issued' WHERE id = ?`)
      .run(permitId);
  });
  tx();

  return { workflowId, permitId, approvedAt, issuedAt };
}

// ---------------------------------------------------------------------------
// GV-004: 신청 상태 전환 (submitted → reviewing → approved → issued)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionApplicationStatus(
  db: Database.Database,
  applicationId: string,
  newStatus: 'reviewing' | 'approved' | 'issued' | 'rejected' | 'expired',
): { applicationId: string; previousStatus: string; newStatus: string } {
  const application = db
    .prepare('SELECT status FROM permit_applications WHERE id = ?')
    .get(applicationId) as { status: string } | undefined;

  if (!application) throw new GovernmentError('E404-APPLICATION', 'Permit application not found', 404);

  const previousStatus = application.status;
  const allowed =
    (previousStatus === 'submitted' && newStatus === 'reviewing') ||
    (previousStatus === 'reviewing' && newStatus === 'approved') ||
    (previousStatus === 'approved' && newStatus === 'issued') ||
    (previousStatus === 'reviewing' && newStatus === 'rejected') ||
    (previousStatus === 'submitted' && newStatus === 'expired');

  if (!allowed) {
    throw new GovernmentError(
      'E409-APPLICATION',
      `Cannot transition application from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE permit_applications SET status = ? WHERE id = ?`).run(newStatus, applicationId);

  return { applicationId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// GV-005: 연체 가산금 일괄 처리 (pending → penalized 배치)
// (StatusTransition detector — batch 패턴, CC-005 batch 14번째 재사용)
// ---------------------------------------------------------------------------
export function applyOverduePenalty(
  db: Database.Database,
  applicantId: string,
): { penalizedCount: number; penalizedIds: string[] } {
  const candidates = db
    .prepare(`SELECT id, overdue_amount FROM overdue_penalties WHERE status = 'pending' AND applicant_id = ?`)
    .all(applicantId) as Array<{ id: string; overdue_amount: number }>;

  const penalizedIds: string[] = [];
  const penaltyAppliedAt = new Date().toISOString();

  for (const penalty of candidates) {
    const penaltyAmount = Math.round(penalty.overdue_amount * MAX_OVERDUE_PENALTY_RATE * 100) / 100;
    db.prepare(`
      UPDATE overdue_penalties
      SET status = 'penalized', penalty_applied_at = ?, overdue_amount = overdue_amount + ?
      WHERE id = ?
    `).run(penaltyAppliedAt, penaltyAmount, penalty.id);
    penalizedIds.push(penalty.id);
  }

  return { penalizedCount: penalizedIds.length, penalizedIds };
}

// ---------------------------------------------------------------------------
// GV-006: 문서 검증 atomic — 문서 검증 + 인증 + 발급 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function validateDocument(
  db: Database.Database,
  documentId: string,
): { documentId: string; permitId: string; validatedAt: string; certifiedAt: string; issuedAt: string } {
  const doc = db
    .prepare('SELECT * FROM documents WHERE id = ?')
    .get(documentId) as DocumentRow | undefined;

  if (!doc) throw new GovernmentError('E404-DOCUMENT', 'Document not found', 404);
  if (doc.status !== 'pending') {
    throw new GovernmentError(
      'E409-DOCUMENT',
      `Cannot validate document with status=${doc.status}`,
      409,
    );
  }

  const validatedAt = new Date().toISOString();
  const certifiedAt = new Date().toISOString();
  const issuedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE documents SET status = 'validated', validated_at = ? WHERE id = ?`)
      .run(validatedAt, documentId);
    db.prepare(`UPDATE documents SET status = 'certified', certified_at = ? WHERE id = ?`)
      .run(certifiedAt, documentId);
    db.prepare(`UPDATE documents SET status = 'issued', issued_at = ? WHERE id = ?`)
      .run(issuedAt, documentId);
  });
  tx();

  return { documentId, permitId: doc.permit_id, validatedAt, certifiedAt, issuedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class GovernmentError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'GovernmentError';
  }
}
