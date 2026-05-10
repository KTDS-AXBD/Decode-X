import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-CN (CN-001~CN-006): Construction 합성 도메인 — 31번째 도메인 (건설 산업, 20번째 신규 산업)
//   - construction spec-container rules.md 기반 PoC source
//   - 합성 schema: projects, bids, change_orders, milestones, safety_inspections, inspection_orders
//   - 건설 lifecycle 패턴 — 입찰한도/보유금한도/변경atomic/프로젝트상태전환/마일스톤배치/안전검사atomic
//   - withRuleId 재사용 31번째 도메인 (신규 detector 0개, 29 Sprint 연속 정점)
//   - ConstructionError code-in-message 패턴 (S275 표준)
//   - 20 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN)
//   - 🏆 20번째 신규 산업 round number 마일스톤
// ---------------------------------------------------------------------------

export interface ProjectRow {
  id: string;
  title: string;
  owner_id: string;
  contract_value: number;
  status: string;               // bidding | awarded | in_progress | completed | closed
  awarded_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
}

export interface BidRow {
  id: string;
  project_id: string;
  contractor_id: string;
  bid_amount: number;
  submitted_at: string;
  status: string;               // submitted | awarded | rejected
}

export interface ChangeOrderRow {
  id: string;
  project_id: string;
  description: string;
  unit_price_adjustment: number;
  approved_at: string | null;
  status: string;               // pending | approved | rejected
}

export interface MilestoneRow {
  id: string;
  project_id: string;
  title: string;
  due_date: string;
  completed: number;            // 0 | 1
  completed_at: string | null;
}

export interface SafetyInspectionRow {
  id: string;
  project_id: string;
  inspector_id: string;
  inspected_at: string;
  result: string;               // passed | failed | pending
}

const MAX_BID_AMOUNT_LIMIT = 1_000_000_000; // CN-001: 최대 입찰 한도 (1,000,000,000 원)

// ---------------------------------------------------------------------------
// CN-001: 입찰 금액 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function submitBid(
  db: Database.Database,
  projectId: string,
  contractorId: string,
  bidAmount: number,
): { bidId: string; projectId: string; contractorId: string; bidAmount: number; submittedAt: string } {
  const project = db
    .prepare('SELECT id, status FROM projects WHERE id = ?')
    .get(projectId) as { id: string; status: string } | undefined;

  if (!project) throw new ConstructionError('E404-PROJECT', 'Project not found', 404);
  if (project.status !== 'bidding') {
    throw new ConstructionError(
      'E409-PROJECT',
      `Cannot submit bid for project with status=${project.status}`,
      409,
    );
  }

  if (bidAmount >= MAX_BID_AMOUNT_LIMIT) {
    throw new ConstructionError(
      'E422-BID-LIMIT',
      `Bid amount exceeded maximum limit (${bidAmount} >= ${MAX_BID_AMOUNT_LIMIT} KRW)`,
      422,
    );
  }

  const bidId = randomUUID();
  const submittedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO bids (id, project_id, contractor_id, bid_amount, submitted_at, status)
    VALUES (?, ?, ?, ?, ?, 'submitted')
  `).run(bidId, projectId, contractorId, bidAmount, submittedAt);

  return { bidId, projectId, contractorId, bidAmount, submittedAt };
}

// ---------------------------------------------------------------------------
// CN-002: 보유금 비율 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, retentionRateLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function computePaymentRetention(
  db: Database.Database,
  projectId: string,
  paymentAmount: number,
  retentionRate: number,
): { projectId: string; paymentAmount: number; retentionRate: number; retentionRateLimit: number; retentionAmount: number; approved: boolean } {
  const project = db
    .prepare('SELECT id, status, contract_value FROM projects WHERE id = ?')
    .get(projectId) as { id: string; status: string; contract_value: number } | undefined;

  if (!project) throw new ConstructionError('E404-PROJECT', 'Project not found', 404);
  if (project.status !== 'in_progress' && project.status !== 'completed') {
    throw new ConstructionError(
      'E409-PROJECT',
      `Cannot compute retention for project with status=${project.status}`,
      409,
    );
  }

  // 계약 규모별 최대 보유금 비율
  const retentionLimitByTier: Record<string, number> = {
    small:  0.10,  // < 100M
    medium: 0.07,  // 100M–1B
    large:  0.05,  // > 1B
  };

  const tier =
    project.contract_value < 100_000_000
      ? 'small'
      : project.contract_value <= 1_000_000_000
        ? 'medium'
        : 'large';

  // F445 Path B: var-vs-var, left=`retentionRateLimit` (`limit` keyword 매칭)
  const retentionRateLimit = retentionLimitByTier[tier] ?? 0.07;

  if (retentionRate > retentionRateLimit) {
    throw new ConstructionError(
      'E422-RETENTION-EXCEEDED',
      `Retention rate exceeded limit (${retentionRate} > ${retentionRateLimit})`,
      422,
    );
  }

  const retentionAmount = Math.round(paymentAmount * retentionRate);

  db.prepare(`
    INSERT INTO payment_retentions (id, project_id, payment_amount, retention_rate, retention_amount, computed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), projectId, paymentAmount, retentionRate, retentionAmount, new Date().toISOString());

  return { projectId, paymentAmount, retentionRate, retentionRateLimit, retentionAmount, approved: true };
}

// ---------------------------------------------------------------------------
// CN-003: 변경 청구 atomic — 변경 청구 + 단가 재계산 + 승인 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processChangeOrder(
  db: Database.Database,
  projectId: string,
  description: string,
  unitPriceAdjustment: number,
  approverId: string,
): { changeOrderId: string; projectId: string; description: string; unitPriceAdjustment: number; approvedAt: string } {
  const project = db
    .prepare('SELECT id, status, contract_value FROM projects WHERE id = ?')
    .get(projectId) as { id: string; status: string; contract_value: number } | undefined;

  if (!project) throw new ConstructionError('E404-PROJECT', 'Project not found', 404);
  if (project.status !== 'in_progress') {
    throw new ConstructionError(
      'E409-PROJECT',
      `Cannot process change order for project with status=${project.status}`,
      409,
    );
  }

  const changeOrderId = randomUUID();
  const approvedAt = new Date().toISOString();
  const newContractValue = project.contract_value + unitPriceAdjustment;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO change_orders (id, project_id, description, unit_price_adjustment, approved_at, status)
      VALUES (?, ?, ?, ?, ?, 'approved')
    `).run(changeOrderId, projectId, description, unitPriceAdjustment, approvedAt);
    db.prepare(`
      UPDATE projects SET contract_value = ? WHERE id = ?
    `).run(newContractValue, projectId);
    db.prepare(`
      INSERT INTO change_order_approvals (id, change_order_id, approver_id, approved_at)
      VALUES (?, ?, ?, ?)
    `).run(randomUUID(), changeOrderId, approverId, approvedAt);
  });
  tx();

  return { changeOrderId, projectId, description, unitPriceAdjustment, approvedAt };
}

// ---------------------------------------------------------------------------
// CN-004: 프로젝트 상태 전환 (bidding → awarded → in_progress → completed → closed)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionProjectStatus(
  db: Database.Database,
  projectId: string,
  newStatus: 'awarded' | 'in_progress' | 'completed' | 'closed',
): { projectId: string; previousStatus: string; newStatus: string } {
  const project = db
    .prepare('SELECT status FROM projects WHERE id = ?')
    .get(projectId) as { status: string } | undefined;

  if (!project) throw new ConstructionError('E404-PROJECT', 'Project not found', 404);

  const previousStatus = project.status;
  const allowed =
    (previousStatus === 'bidding' && newStatus === 'awarded') ||
    (previousStatus === 'awarded' && newStatus === 'in_progress') ||
    (previousStatus === 'in_progress' && newStatus === 'completed') ||
    (previousStatus === 'completed' && newStatus === 'closed');

  if (!allowed) {
    throw new ConstructionError(
      'E409-PROJECT',
      `Cannot transition project from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE projects SET status = ? WHERE id = ?`).run(newStatus, projectId);

  if (newStatus === 'awarded') {
    db.prepare(`UPDATE projects SET awarded_at = ? WHERE id = ?`).run(now, projectId);
  } else if (newStatus === 'in_progress') {
    db.prepare(`UPDATE projects SET started_at = ? WHERE id = ?`).run(now, projectId);
  } else if (newStatus === 'completed') {
    db.prepare(`UPDATE projects SET completed_at = ? WHERE id = ?`).run(now, projectId);
  } else if (newStatus === 'closed') {
    db.prepare(`UPDATE projects SET closed_at = ? WHERE id = ?`).run(now, projectId);
  }

  return { projectId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// CN-005: 마일스톤 일괄 갱신 (batch milestone completion)
// (StatusTransition detector — batch 패턴, CC-005 batch 20번째 재사용)
// ---------------------------------------------------------------------------
export function markMilestoneCompletion(
  db: Database.Database,
  dueDateCutoff: string,
): { markedCount: number; markedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM milestones
      WHERE completed = 0
        AND due_date <= ?
    `)
    .all(dueDateCutoff) as Array<{ id: string }>;

  const markedIds: string[] = [];

  for (const milestone of candidates) {
    db.prepare(`
      UPDATE milestones
      SET completed = 1, completed_at = ?, status = 'completed'
      WHERE id = ?
    `).run(new Date().toISOString(), milestone.id);
    markedIds.push(milestone.id);
  }

  return { markedCount: markedIds.length, markedIds };
}

// ---------------------------------------------------------------------------
// CN-006: 안전 검사 atomic — 안전 검사 + 시정 명령 + 통과 처리
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processSafetyInspection(
  db: Database.Database,
  projectId: string,
  inspectorId: string,
  passed: boolean,
  correctionNotes: string,
): { inspectionId: string; correctionOrderId: string | null; projectId: string; inspectorId: string; result: string; inspectedAt: string } {
  const project = db
    .prepare('SELECT id, status FROM projects WHERE id = ?')
    .get(projectId) as { id: string; status: string } | undefined;

  if (!project) throw new ConstructionError('E404-PROJECT', 'Project not found', 404);
  if (project.status !== 'in_progress') {
    throw new ConstructionError(
      'E409-PROJECT',
      `Cannot perform safety inspection for project with status=${project.status}`,
      409,
    );
  }

  const inspectionId = randomUUID();
  const correctionOrderId = passed ? null : randomUUID();
  const inspectedAt = new Date().toISOString();
  const result = passed ? 'passed' : 'failed';

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO safety_inspections (id, project_id, inspector_id, inspected_at, result)
      VALUES (?, ?, ?, ?, ?)
    `).run(inspectionId, projectId, inspectorId, inspectedAt, result);

    if (!passed && correctionOrderId) {
      db.prepare(`
        INSERT INTO correction_orders (id, inspection_id, project_id, notes, issued_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(correctionOrderId, inspectionId, projectId, correctionNotes, inspectedAt);
    }

    db.prepare(`
      UPDATE projects SET last_inspection_at = ?, last_inspection_result = ? WHERE id = ?
    `).run(inspectedAt, result, projectId);
  });
  tx();

  return { inspectionId, correctionOrderId, projectId, inspectorId, result, inspectedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class ConstructionError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'ConstructionError';
  }
}
