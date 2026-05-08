import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-RE (RE-001~RE-006): Real Estate 합성 도메인 — 18번째 도메인 (부동산 산업, 7번째 신규 산업)
//   - realestate spec-container rules.md 기반 PoC source
//   - 합성 schema: properties, leases, lease_payments, tenants
//   - 부동산 lifecycle 패턴 — 매물등록/임차한도/계약/상태/만료/환불
//   - withRuleId 재사용 18번째 도메인 (신규 detector 0개, 16 Sprint 연속 정점)
//   - RealEstateError code-in-message 패턴 (S275 표준)
//   - detector 신뢰도 5 Sprint cascade(S278~S282) + 6 산업 연속 입증(S278+S283~S287) 활용
// ---------------------------------------------------------------------------

export interface PropertyRow {
  id: string;
  owner_id: string;
  address: string;
  property_type: string;     // APARTMENT | HOUSE | OFFICE | RETAIL
  size_m2: number;
  monthly_rent_krw: number;
  deposit_krw: number;
  status: string;             // available | listed | leased | maintenance
  listed_at: string;
}

export interface LeaseRow {
  id: string;
  property_id: string;
  tenant_id: string;
  monthly_rent_krw: number;
  deposit_krw: number;
  status: string;             // active | expiring | terminated | renewed
  start_at: string;
  end_at: string;
  terminated_at: string | null;
}

export interface TenantRow {
  id: string;
  user_id: string;
  monthly_income_krw: number;
  status: string;             // verified | pending | rejected
}

const MIN_SIZE_M2 = 5;
const MAX_SIZE_M2 = 10_000;
const MAX_RENT_INCOME_RATIO = 0.4;  // 월세 ≤ 월소득 40%
const REFUND_DAYS_BEFORE_LEASE_START = 14;

// ---------------------------------------------------------------------------
// RE-001: 매물 등록 (5 ≤ size ≤ 10,000 m²)
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function listProperty(
  db: Database.Database,
  ownerId: string,
  address: string,
  propertyType: string,
  sizeM2: number,
  monthlyRentKrw: number,
  depositKrw: number,
): { propertyId: string; status: string } {
  if (sizeM2 < MIN_SIZE_M2) {
    throw new RealEstateError('E422-SZ-MIN', `Size below minimum (${sizeM2} < ${MIN_SIZE_M2})`, 422);
  }
  if (sizeM2 > MAX_SIZE_M2) {
    throw new RealEstateError('E422-SZ-MAX', `Size above maximum (${sizeM2} > ${MAX_SIZE_M2})`, 422);
  }

  const propertyId = randomUUID();
  const listedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO properties (id, owner_id, address, property_type, size_m2, monthly_rent_krw, deposit_krw, status, listed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'listed', ?)
  `).run(propertyId, ownerId, address, propertyType, sizeM2, monthlyRentKrw, depositKrw, listedAt);

  return { propertyId, status: 'listed' };
}

// ---------------------------------------------------------------------------
// RE-002: 임차 한도 검증 (월세 ≤ 월소득 × MAX_RENT_INCOME_RATIO)
// (ThresholdCheck detector — F445 Path B var-vs-var, rentLimit ≥ monthlyRentKrw)
// ---------------------------------------------------------------------------
export function checkRentAffordabilityLimit(
  db: Database.Database,
  tenantId: string,
  monthlyRentKrw: number,
): { canLease: boolean; remainingRentLimit: number } {
  const tenant = db
    .prepare('SELECT monthly_income_krw, status FROM tenants WHERE id = ?')
    .get(tenantId) as { monthly_income_krw: number; status: string } | undefined;

  if (!tenant) {
    throw new RealEstateError('E404-TN', 'Tenant not found', 404);
  }
  if (tenant.status !== 'verified') {
    throw new RealEstateError('E409-ST', `Tenant not verified (status=${tenant.status})`, 409);
  }

  const rentLimit = Math.floor(tenant.monthly_income_krw * MAX_RENT_INCOME_RATIO);
  // F445 Path B: var-vs-var, left=`rentLimit` (`limit` keyword 매칭)
  if (rentLimit < monthlyRentKrw) {
    throw new RealEstateError('E422-LIMIT', `Rent exceeds affordability limit (${monthlyRentKrw} > ${rentLimit})`, 422);
  }
  return { canLease: true, remainingRentLimit: rentLimit - monthlyRentKrw };
}

// ---------------------------------------------------------------------------
// RE-003: 계약 체결 atomic (lease INSERT + property status='leased' UPDATE)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function signLease(
  db: Database.Database,
  propertyId: string,
  tenantId: string,
  startAt: string,
  endAt: string,
): { leaseId: string; status: string; startAt: string; endAt: string } {
  const property = db
    .prepare('SELECT monthly_rent_krw, deposit_krw, status FROM properties WHERE id = ?')
    .get(propertyId) as { monthly_rent_krw: number; deposit_krw: number; status: string } | undefined;

  if (!property) throw new RealEstateError('E404-PR', 'Property not found', 404);
  if (property.status !== 'listed') {
    throw new RealEstateError('E409-PR', `Property not available (status=${property.status})`, 409);
  }

  const leaseId = randomUUID();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO leases (id, property_id, tenant_id, monthly_rent_krw, deposit_krw, status, start_at, end_at, terminated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, NULL)
    `).run(leaseId, propertyId, tenantId, property.monthly_rent_krw, property.deposit_krw, startAt, endAt);
    db.prepare(`UPDATE properties SET status = 'leased' WHERE id = ?`)
      .run(propertyId);
  });
  tx();

  return { leaseId, status: 'active', startAt, endAt };
}

// ---------------------------------------------------------------------------
// RE-004: 계약 상태 전환 (active → expiring / terminated / renewed)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionLeaseStatus(
  db: Database.Database,
  leaseId: string,
  newStatus: 'expiring' | 'terminated' | 'renewed',
): { leaseId: string; previousStatus: string; newStatus: string } {
  const lease = db
    .prepare('SELECT status FROM leases WHERE id = ?')
    .get(leaseId) as { status: string } | undefined;

  if (!lease) throw new RealEstateError('E404-LS', 'Lease not found', 404);

  const previousStatus = lease.status;
  const allowed =
    (previousStatus === 'active' && ['expiring', 'terminated', 'renewed'].includes(newStatus)) ||
    (previousStatus === 'expiring' && ['terminated', 'renewed'].includes(newStatus));

  if (!allowed) {
    throw new RealEstateError('E409-TR', `Cannot transition from ${previousStatus} to ${newStatus}`, 409);
  }

  const terminatedAt = newStatus === 'terminated' ? new Date().toISOString() : null;
  if (terminatedAt) {
    db.prepare(`UPDATE leases SET status = ?, terminated_at = ? WHERE id = ?`)
      .run(newStatus, terminatedAt, leaseId);
  } else {
    db.prepare(`UPDATE leases SET status = ? WHERE id = ?`)
      .run(newStatus, leaseId);
  }

  return { leaseId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// RE-005: 계약 만료 자동 처리 (end_at < now → status='expiring' batch)
// (StatusTransition detector — batch 패턴, CC/DV/SB/IN/HC/ED-005 동일 형태 7번째)
// ---------------------------------------------------------------------------
export function markExpiringLeases(
  db: Database.Database,
  asOfDate: string = new Date().toISOString(),
): { markedCount: number; expiringLeaseIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM leases
      WHERE status = 'active'
        AND end_at < ?
    `)
    .all(asOfDate) as Array<{ id: string }>;

  const expiringLeaseIds: string[] = [];
  for (const l of candidates) {
    db.prepare(`UPDATE leases SET status = 'expiring' WHERE id = ?`)
      .run(l.id);
    expiringLeaseIds.push(l.id);
  }

  return { markedCount: expiringLeaseIds.length, expiringLeaseIds };
}

// ---------------------------------------------------------------------------
// RE-006: 계약 취소 + 환불 atomic (계약 시작 14일 이전 시 deposit 100% 환불)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function cancelLeaseWithRefund(
  db: Database.Database,
  leaseId: string,
  reason: string,
): { refundAmount: number; terminatedAt: string; propertyReleased: boolean } {
  const lease = db
    .prepare('SELECT property_id, deposit_krw, start_at, status FROM leases WHERE id = ?')
    .get(leaseId) as { property_id: string; deposit_krw: number; start_at: string; status: string } | undefined;

  if (!lease) throw new RealEstateError('E404-LS', 'Lease not found', 404);
  if (lease.status !== 'active') {
    throw new RealEstateError('E409-LS', `Cannot cancel status=${lease.status}`, 409);
  }

  const startDate = new Date(lease.start_at);
  const now = new Date();
  const daysBefore = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  // 계약 시작 14일 이전 취소 시 deposit 100% 환불, 미만 시 0원
  const refundAmount = daysBefore >= REFUND_DAYS_BEFORE_LEASE_START ? lease.deposit_krw : 0;
  const terminatedAt = now.toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE leases SET status = 'terminated', terminated_at = ? WHERE id = ?`)
      .run(terminatedAt, leaseId);
    db.prepare(`UPDATE properties SET status = 'listed' WHERE id = ?`)
      .run(lease.property_id);
  });
  tx();

  void reason;
  return { refundAmount, terminatedAt, propertyReleased: true };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class RealEstateError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'RealEstateError';
  }
}
