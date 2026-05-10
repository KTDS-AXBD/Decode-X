import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-PR (PR-001~PR-006): Property Mgmt 합성 도메인 — 41번째 도메인 (임대관리 산업, 30번째 신규 산업)
//   - property spec-container rules.md 기반 PoC source
//   - 합성 schema: utility_bills, maintenance_budgets, leases, lease_renewals,
//                  deposits, property_inspections, evictions, legal_proceedings
//   - 임대관리 lifecycle 패턴 — 공과금한도/유지보수한도/갱신atomic/임대상태전환/점검배치/명도atomic
//   - withRuleId 재사용 41번째 도메인 (신규 detector 0개, 39 Sprint 연속 정점)
//   - PropertyError code-in-message 패턴 (S275 표준)
//   - 🏆 30 산업 연속 0 ABSENCE round number 마일스톤
//     (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR)
//   - 30번째 신규 산업 round number 마일스톤
//   - RE 부동산 + PR 임대관리 클러스터 형성
//   - 6 BLs 균형 패턴 31번째 정착 (Threshold×2 + Atomic×2 + Status×2)
// ---------------------------------------------------------------------------

export interface UtilityBillRow {
  id: string;
  property_id: string;
  tenant_id: string;
  billing_month: string;
  total_amount: number;
  status: string;  // pending | approved | paid | disputed | cancelled
}

export interface MaintenanceBudgetRow {
  id: string;
  property_id: string;
  request_id: string;
  requested_amount: number;
  tier: string;  // standard | premium | luxury
  maintenanceBudgetLimit: number;
  status: string;  // pending | approved | rejected | completed
}

export interface LeaseRow {
  id: string;
  property_id: string;
  tenant_id: string;
  landlord_id: string;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  status: string;  // pending | active | renewed | terminated | archived
}

export interface DepositRow {
  id: string;
  lease_id: string;
  tenant_id: string;
  amount: number;
  status: string;  // held | returned | forfeited
}

export interface PropertyInspectionRow {
  id: string;
  property_id: string;
  scheduled_date: string;
  inspector_id: string;
  status: string;  // scheduled | in_progress | inspected | failed | archived
}

export interface EvictionRow {
  id: string;
  lease_id: string;
  tenant_id: string;
  property_id: string;
  reason: string;
  status: string;  // initiated | legal_review | notice_served | court_ordered | executed | completed

  initiated_at: string;
}

const MAX_UTILITY_BILL_AMOUNT = 500000; // PR-001: 공과금 청구 한도 (원, 기본값)

// ---------------------------------------------------------------------------
// PR-001: 공과금 청구 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function computeUtilityBill(
  db: Database.Database,
  propertyId: string,
  tenantId: string,
  billingMonth: string,
  totalAmount: number,
): { billId: string; propertyId: string; tenantId: string; billingMonth: string; approved: boolean } {
  const property = db
    .prepare('SELECT id FROM properties WHERE id = ? LIMIT 1')
    .get(propertyId) as { id: string } | undefined;

  if (!property) throw new PropertyError('E404-PROPERTY', 'Property not found', 404);

  const tenant = db
    .prepare('SELECT id FROM tenants WHERE id = ? LIMIT 1')
    .get(tenantId) as { id: string } | undefined;

  if (!tenant) throw new PropertyError('E404-TENANT', 'Tenant not found', 404);

  const limit = MAX_UTILITY_BILL_AMOUNT;

  if (totalAmount >= limit) {
    throw new PropertyError(
      'E422-UTILITY-BILL-EXCEEDED',
      `Utility bill exceeds limit (${totalAmount} >= ${limit})`,
      422,
    );
  }

  const billId = randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO utility_bills (id, property_id, tenant_id, billing_month, total_amount, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(billId, propertyId, tenantId, billingMonth, totalAmount, createdAt);

  return { billId, propertyId, tenantId, billingMonth, approved: true };
}

// ---------------------------------------------------------------------------
// PR-002: 유지보수 예산 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, maintenanceBudgetLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function approveMaintenance(
  db: Database.Database,
  requestId: string,
  propertyId: string,
): { requestId: string; propertyId: string; maintenanceBudgetLimit: number; approved: boolean } {
  const request = db
    .prepare('SELECT requested_amount, tier, maintenanceBudgetLimit FROM maintenance_requests WHERE id = ? AND property_id = ? LIMIT 1')
    .get(requestId, propertyId) as { requested_amount: number; tier: string; maintenanceBudgetLimit: number } | undefined;

  if (!request) throw new PropertyError('E404-MAINTENANCE', 'Maintenance request not found', 404);

  // F445 Path B: var-vs-var, left=`maintenanceBudgetLimit` (`limit` keyword 매칭)
  const maintenanceBudgetLimit = request.maintenanceBudgetLimit;

  if (request.requested_amount > maintenanceBudgetLimit) {
    throw new PropertyError(
      'E422-MAINTENANCE-BUDGET-EXCEEDED',
      `Maintenance request exceeds budget (${request.requested_amount} > ${maintenanceBudgetLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE maintenance_requests SET status = 'approved', approved_at = ? WHERE id = ?
  `).run(new Date().toISOString(), requestId);

  return { requestId, propertyId, maintenanceBudgetLimit, approved: true };
}

// ---------------------------------------------------------------------------
// PR-003: 임대 계약 갱신 atomic — 계약 검증 + 갱신 + 보증금 정산
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function renewLease(
  db: Database.Database,
  leaseId: string,
  newEndDate: string,
  newMonthlyRent: number,
  depositAdjustment: number,
): { leaseId: string; renewalId: string; depositId: string; renewedAt: string } {
  const lease = db
    .prepare("SELECT id, tenant_id, property_id, status FROM leases WHERE id = ? AND status = 'active'")
    .get(leaseId) as { id: string; tenant_id: string; property_id: string; status: string } | undefined;

  if (!lease) throw new PropertyError('E404-LEASE', 'Active lease not found for renewal', 404);

  const renewalId = randomUUID();
  const depositId = randomUUID();
  const renewedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE leases SET status = 'renewed', end_date = ?, monthly_rent = ?, updated_at = ? WHERE id = ?
    `).run(newEndDate, newMonthlyRent, renewedAt, leaseId);

    db.prepare(`
      INSERT INTO lease_renewals (id, lease_id, previous_end_date, new_end_date, monthly_rent, renewed_at)
      VALUES (?, ?, (SELECT end_date FROM leases WHERE id = ?), ?, ?, ?)
    `).run(renewalId, leaseId, leaseId, newEndDate, newMonthlyRent, renewedAt);

    db.prepare(`
      INSERT INTO deposits (id, lease_id, tenant_id, amount, status, created_at)
      VALUES (?, ?, ?, ?, 'held', ?)
    `).run(depositId, leaseId, lease.tenant_id, depositAdjustment, renewedAt);
  });
  tx();

  return { leaseId, renewalId, depositId, renewedAt };
}

// ---------------------------------------------------------------------------
// PR-004: 임대 상태 전환 (pending → active → renewed → terminated → archived)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionLeaseStatus(
  db: Database.Database,
  leaseId: string,
  newStatus: 'active' | 'renewed' | 'terminated' | 'archived',
): { leaseId: string; previousStatus: string; newStatus: string } {
  const lease = db
    .prepare('SELECT status FROM leases WHERE id = ?')
    .get(leaseId) as { status: string } | undefined;

  if (!lease) throw new PropertyError('E404-LEASE', 'Lease not found', 404);

  const previousStatus = lease.status;
  const allowed =
    (lease.status === 'pending' && newStatus === 'active') ||
    (lease.status === 'active' && newStatus === 'renewed') ||
    (lease.status === 'active' && newStatus === 'terminated') ||
    (lease.status === 'renewed' && newStatus === 'terminated') ||
    (lease.status === 'terminated' && newStatus === 'archived');

  if (!allowed) {
    throw new PropertyError(
      'E409-LEASE-STATUS',
      `Cannot transition lease status from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE leases SET status = ?, updated_at = ? WHERE id = ?`).run(
    newStatus,
    new Date().toISOString(),
    leaseId,
  );

  return { leaseId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// PR-005: 정기 점검 일괄 처리 (batch inspection archiving)
// (StatusTransition detector — batch 패턴, CC-005 30번째 재사용)
// ---------------------------------------------------------------------------
export function markInspectionBatch(
  db: Database.Database,
  scheduledBefore: string,
): { markedCount: number; markedIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT pi.id FROM property_inspections pi
      JOIN properties p ON pi.property_id = p.id
      WHERE pi.scheduled_date <= ?
        AND pi.status = 'scheduled'
    `)
    .all(scheduledBefore) as Array<{ id: string }>;

  const markedIds: string[] = [];

  for (const inspection of candidates) {
    db.prepare(`
      UPDATE property_inspections
      SET status = 'inspected'
      WHERE id = ?
    `).run(inspection.id);
    markedIds.push(inspection.id);
  }

  return { markedCount: markedIds.length, markedIds };
}

// ---------------------------------------------------------------------------
// PR-006: 명도 처리 atomic — 통보 + 법적 절차 + 명도 + 정산
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processEviction(
  db: Database.Database,
  leaseId: string,
  tenantId: string,
  propertyId: string,
  reason: string,
  noticeMessage: string,
): { evictionId: string; legalId: string; notificationId: string; closureId: string; initiatedAt: string } {
  const lease = db
    .prepare("SELECT id, status FROM leases WHERE id = ? AND tenant_id = ?")
    .get(leaseId, tenantId) as { id: string; status: string } | undefined;

  if (!lease) throw new PropertyError('E404-LEASE', 'Lease not found for eviction', 404);

  if (lease.status === 'archived') {
    throw new PropertyError('E409-LEASE-ARCHIVED', 'Cannot evict from an archived lease', 409);
  }

  const evictionId = randomUUID();
  const legalId = randomUUID();
  const notificationId = randomUUID();
  const closureId = randomUUID();
  const initiatedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO evictions (id, lease_id, tenant_id, property_id, reason, status, initiated_at)
      VALUES (?, ?, ?, ?, ?, 'initiated', ?)
    `).run(evictionId, leaseId, tenantId, propertyId, reason, initiatedAt);

    db.prepare(`
      INSERT INTO legal_proceedings (id, eviction_id, proceeding_type, status, started_at)
      VALUES (?, ?, 'eviction_notice', 'pending', ?)
    `).run(legalId, evictionId, initiatedAt);

    db.prepare(`
      INSERT INTO eviction_notifications (id, eviction_id, tenant_id, message, sent_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(notificationId, evictionId, tenantId, noticeMessage, initiatedAt);

    db.prepare(`
      INSERT INTO lease_closures (id, lease_id, eviction_id, closed_at)
      VALUES (?, ?, ?, ?)
    `).run(closureId, leaseId, evictionId, initiatedAt);

    db.prepare(`
      UPDATE leases SET status = 'terminated', updated_at = ? WHERE id = ?
    `).run(initiatedAt, leaseId);
  });
  tx();

  return { evictionId, legalId, notificationId, closureId, initiatedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class PropertyError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'PropertyError';
  }
}
