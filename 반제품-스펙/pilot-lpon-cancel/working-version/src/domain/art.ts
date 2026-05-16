import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-AR (AR-001~AR-006): Art 합성 도메인 — 64번째 도메인 (예술/갤러리 산업, 53번째 신규 산업)
//   - art spec-container rules.md 기반 PoC source
//   - 합성 schema: galleries, collector_contracts, exhibition_schedules, artworks,
//                  commission_payments, commission_refund_records, commission_refunds
//   - 예술 lifecycle 패턴 — 갤러리artwork한도/acquisitiondaily한도/거래batchatomic/artwork상태전환/만료artwork일괄/commission환불atomic
//   - withRuleId 재사용 64번째 도메인 (신규 detector 0개, 65 Sprint 연속 정점 도전)
//   - ArtError code-in-message 패턴 (S275 표준)
//   - 53 산업 연속 0 ABSENCE 도전 (..+SM+NW+BR+ER+PC+RA+AR)
//   - 53번째 신규 산업 마일스톤 (art 추가, 디지털 콘텐츠 12-클러스터: MU+PB+AD+GM+VD+SM+NW+BR+ER+PC+RA+AR)
//   - 거울 변환 17회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports → podcast → radio → art)
//   - 🏆 세션 306 신기록 도전 (1세션 9 Sprint 신기록 직후 후속 부트스트래핑)
// ---------------------------------------------------------------------------

export interface GalleryRow {
  id: string;
  name: string;
  total_capacity: number;
  active_artworks: number;
  status: string; // active | suspended | retired
}

export interface CollectorContractRow {
  id: string;
  collector_id: string;
  gallery_id: string;
  tier_code: string; // free | bronze | silver | gold | platinum
  acquisition_limit: number;
  acquisition_used: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface ExhibitionScheduleRow {
  id: string;
  gallery_id: string;
  contract_id: string;
  artwork_id: string | null;
  commission_payment_id: string | null;
  status: string; // registered | exhibited | updated | archived | withdrawn | cancelled
  scheduled_at: string;
}

export interface ArtworkRow {
  id: string;
  gallery_id: string;
  schedule_id: string;
  artwork_no: string;
  status: string; // exhibited | updated | archived | withdrawn | cancelled | expired
  started_at: string;
}

export interface CommissionRefundRecordRow {
  id: string;
  collector_id: string;
  artwork_id: string;
  commission_cost: number;
  refund_rate: number;
  refund_amount: number;
  status: string; // pending | calculated | refunded
}

const MAX_CONCURRENT_ACTIVE_ARTWORKS_PER_GALLERY = 60; // AR-001: 갤러리별 동시 active artwork 한도 (기본값, 일반 갤러리 공간 동시 전시 가능 작품 수)

// ---------------------------------------------------------------------------
// AR-001: 갤러리 동시 active artwork 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function registerArtwork(
  db: Database.Database,
  galleryId: string,
  contractId: string,
): { scheduleId: string; galleryId: string; contractId: string; scheduledAt: string } {
  const gallery = db
    .prepare('SELECT active_artworks, total_capacity FROM galleries WHERE id = ?')
    .get(galleryId) as { active_artworks: number; total_capacity: number } | undefined;

  if (!gallery) throw new ArtError('E404-GALLERY', 'Gallery not found', 404);

  const limit = gallery.total_capacity ?? MAX_CONCURRENT_ACTIVE_ARTWORKS_PER_GALLERY;

  if (gallery.active_artworks >= limit) {
    throw new ArtError(
      'E422-GALLERY-CAPACITY-EXCEEDED',
      `Gallery is at full capacity (${gallery.active_artworks} >= ${limit})`,
      422,
    );
  }

  const scheduleId = randomUUID();
  const scheduledAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO exhibition_schedules (id, gallery_id, contract_id, artwork_id, commission_payment_id, status, scheduled_at)
    VALUES (?, ?, ?, NULL, NULL, 'registered', ?)
  `).run(scheduleId, galleryId, contractId, scheduledAt);

  db.prepare(`
    UPDATE galleries SET active_artworks = active_artworks + 1 WHERE id = ?
  `).run(galleryId);

  return { scheduleId, galleryId, contractId, scheduledAt };
}

// ---------------------------------------------------------------------------
// AR-002: 컬렉터 일일 acquisition 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, dailyAcquisitionLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyAcquisitionLimit(
  db: Database.Database,
  collectorId: string,
  contractId: string,
  acquisition: number,
): { collectorId: string; contractId: string; dailyAcquisitionLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT acquisition_used, acquisition_limit FROM collector_contracts WHERE id = ? AND collector_id = ? LIMIT 1')
    .get(contractId, collectorId) as { acquisition_used: number; acquisition_limit: number } | undefined;

  if (!contract) throw new ArtError('E404-CONTRACT', 'Collector contract not found', 404);

  // F445 Path B: var-vs-var, left=`dailyAcquisitionLimit` (`limit` keyword 매칭)
  const dailyAcquisitionLimit = contract.acquisition_limit;

  if (contract.acquisition_used + acquisition >= dailyAcquisitionLimit) {
    throw new ArtError(
      'E422-DAILY-ACQUISITION-LIMIT-EXCEEDED',
      `Daily acquisition quota exhausted (${contract.acquisition_used + acquisition} >= ${dailyAcquisitionLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE collector_contracts SET acquisition_used = acquisition_used + ? WHERE id = ?
  `).run(acquisition, contractId);

  return { collectorId, contractId, dailyAcquisitionLimit, approved: true };
}

// ---------------------------------------------------------------------------
// AR-003: artwork 거래 atomic — artworks + exhibition_schedules 상태전환 + commission_payments 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processArtworkTransaction(
  db: Database.Database,
  galleryId: string,
  scheduleId: string,
  artworkNo: string,
  amount: number,
): { artworkId: string; commissionPaymentId: string; scheduleId: string; galleryId: string; startedAt: string } {
  const schedule = db
    .prepare("SELECT status FROM exhibition_schedules WHERE id = ? AND status = 'registered'")
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new ArtError('E404-SCHEDULE', 'Registered artwork not found', 404);

  const artworkId = randomUUID();
  const commissionPaymentId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO artworks (id, gallery_id, schedule_id, artwork_no, status, started_at)
      VALUES (?, ?, ?, ?, 'exhibited', ?)
    `).run(artworkId, galleryId, scheduleId, artworkNo, startedAt);

    db.prepare(`
      UPDATE exhibition_schedules SET status = 'exhibited', artwork_id = ?, commission_payment_id = ? WHERE id = ?
    `).run(artworkId, commissionPaymentId, scheduleId);

    db.prepare(`
      INSERT INTO commission_payments (id, schedule_id, artwork_id, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(commissionPaymentId, scheduleId, artworkId, amount, startedAt);
  });
  tx();

  return { artworkId, commissionPaymentId, scheduleId, galleryId, startedAt };
}

// ---------------------------------------------------------------------------
// AR-004: artwork 상태 전환 (registered → exhibited → updated → archived / withdrawn / cancelled)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionArtworkStatus(
  db: Database.Database,
  scheduleId: string,
  newStatus: 'exhibited' | 'updated' | 'archived' | 'withdrawn' | 'cancelled',
): { scheduleId: string; previousStatus: string; newStatus: string } {
  const schedule = db
    .prepare('SELECT status FROM exhibition_schedules WHERE id = ?')
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new ArtError('E404-SCHEDULE', 'Exhibition schedule not found', 404);

  const previousStatus = schedule.status;
  const allowed =
    (schedule.status === 'registered' && newStatus === 'exhibited') ||
    (schedule.status === 'exhibited' && newStatus === 'updated') ||
    (schedule.status === 'updated' && newStatus === 'exhibited') ||
    (schedule.status === 'exhibited' && newStatus === 'archived') ||
    (schedule.status === 'updated' && newStatus === 'archived') ||
    (schedule.status === 'registered' && newStatus === 'withdrawn') ||
    (schedule.status === 'exhibited' && newStatus === 'withdrawn') ||
    (schedule.status === 'registered' && newStatus === 'cancelled') ||
    (schedule.status === 'exhibited' && newStatus === 'cancelled');

  if (!allowed) {
    throw new ArtError(
      'E409-SCHEDULE',
      `Cannot transition exhibition schedule from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE exhibition_schedules SET status = ? WHERE id = ?`).run(newStatus, scheduleId);

  return { scheduleId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// AR-005: 만료 withdrawn artwork batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, RA-005/PC-005/ER-005/BR-005/NW-005/SM-005/VD-005 53번째 재사용)
// ---------------------------------------------------------------------------
export function expireWithdrawnArtworkBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM artworks
      WHERE status = 'withdrawn'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE artworks
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// AR-006: commission 환불 atomic — withdrawn artwork 시 commission 비용 + 환불 비율 + 환불 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processCommissionRefund(
  db: Database.Database,
  collectorId: string,
  artworkId: string,
  commissionCost: number,
  refundRate: number,
): { refundRecordId: string; refundId: string; collectorId: string; refundAmount: number; refundedAt: string } {
  const artwork = db
    .prepare("SELECT status FROM artworks WHERE id = ? AND status = 'withdrawn'")
    .get(artworkId) as { status: string } | undefined;

  if (!artwork) throw new ArtError('E404-WITHDRAWN-ARTWORK', 'Withdrawn artwork not found', 404);

  const refundRecordId = randomUUID();
  const refundId = randomUUID();
  const refundAmount = Math.round(commissionCost * refundRate * 100) / 100;
  const refundedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO commission_refund_records (id, collector_id, artwork_id, commission_cost, refund_rate, refund_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(refundRecordId, collectorId, artworkId, commissionCost, refundRate, refundAmount);

    db.prepare(`
      INSERT INTO commission_refunds (id, refund_record_id, collector_id, amount, status, refunded_at)
      VALUES (?, ?, ?, ?, 'refunded', ?)
    `).run(refundId, refundRecordId, collectorId, refundAmount, refundedAt);

    db.prepare(`
      UPDATE commission_refund_records SET status = 'refunded' WHERE id = ?
    `).run(refundRecordId);
  });
  tx();

  return { refundRecordId, refundId, collectorId, refundAmount, refundedAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class ArtError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'ArtError';
  }
}
