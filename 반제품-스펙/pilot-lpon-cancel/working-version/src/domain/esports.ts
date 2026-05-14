import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-ER (ER-001~ER-006): Esports 합성 도메인 — 61번째 도메인 (이스포츠 산업, 50번째 신규 산업)
//   - esports spec-container rules.md 기반 PoC source
//   - 합성 schema: organizers, team_contracts, tournament_schedules, matches,
//                  prize_distributions, prize_clawback_records, prize_clawbacks
//   - 이스포츠 lifecycle 패턴 — 조직위tournament한도/팀prizedaily한도/match batchatomic/tournament상태전환/만료match일괄/prize회수atomic
//   - withRuleId 재사용 61번째 도메인 (신규 detector 0개, 62 Sprint 연속 정점 도전)
//   - EsportsError code-in-message 패턴 (S275 표준)
//   - 50 산업 연속 0 ABSENCE 도전 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS+MU+SH+PB+TX+AD+GM+VD+SM+NW+BR+ER)
//   - 50번째 신규 산업 마일스톤 (esports 추가, 디지털 콘텐츠 9-클러스터: MU+PB+AD+GM+VD+SM+NW+BR+ER)
//   - 거울 변환 14회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news → broadcast → esports)
//   - 🏆🏆 50 신규 산업 round 마일스톤 (CC부터 ER까지 50 신규 산업 0 ABSENCE 연속 부트스트래핑)
// ---------------------------------------------------------------------------

export interface OrganizerRow {
  id: string;
  name: string;
  total_capacity: number;
  active_tournaments: number;
  status: string; // active | suspended | retired
}

export interface TeamContractRow {
  id: string;
  team_id: string;
  organizer_id: string;
  tier_code: string; // amateur | semi-pro | pro | tier-1
  prize_limit: number;
  prize_earned: number;
  status: string; // active | paused | expired | cancelled
  expires_at: string;
}

export interface TournamentScheduleRow {
  id: string;
  organizer_id: string;
  contract_id: string;
  match_id: string | null;
  prize_distribution_id: string | null;
  status: string; // announced | registered | live | completed | archived | cancelled | forfeited
  announced_at: string;
}

export interface MatchRow {
  id: string;
  organizer_id: string;
  schedule_id: string;
  match_no: string;
  status: string; // live | completed | archived | forfeited | cancelled | expired
  started_at: string;
}

export interface PrizeClawbackRecordRow {
  id: string;
  team_id: string;
  match_id: string;
  prize_cost: number;
  clawback_rate: number;
  clawback_amount: number;
  status: string; // pending | calculated | clawed_back
}

const MAX_CONCURRENT_ACTIVE_TOURNAMENTS_PER_ORGANIZER = 16; // ER-001: 조직위별 동시 active tournament 한도 (기본값)

// ---------------------------------------------------------------------------
// ER-001: 조직위 동시 active tournament 한도 검증
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function registerTournament(
  db: Database.Database,
  organizerId: string,
  contractId: string,
): { scheduleId: string; organizerId: string; contractId: string; announcedAt: string } {
  const organizer = db
    .prepare('SELECT active_tournaments, total_capacity FROM organizers WHERE id = ?')
    .get(organizerId) as { active_tournaments: number; total_capacity: number } | undefined;

  if (!organizer) throw new EsportsError('E404-ORGANIZER', 'Organizer not found', 404);

  const limit = organizer.total_capacity ?? MAX_CONCURRENT_ACTIVE_TOURNAMENTS_PER_ORGANIZER;

  if (organizer.active_tournaments >= limit) {
    throw new EsportsError(
      'E422-ORGANIZER-CAPACITY-EXCEEDED',
      `Organizer is at full capacity (${organizer.active_tournaments} >= ${limit})`,
      422,
    );
  }

  const scheduleId = randomUUID();
  const announcedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO tournament_schedules (id, organizer_id, contract_id, match_id, prize_distribution_id, status, announced_at)
    VALUES (?, ?, ?, NULL, NULL, 'announced', ?)
  `).run(scheduleId, organizerId, contractId, announcedAt);

  db.prepare(`
    UPDATE organizers SET active_tournaments = active_tournaments + 1 WHERE id = ?
  `).run(organizerId);

  return { scheduleId, organizerId, contractId, announcedAt };
}

// ---------------------------------------------------------------------------
// ER-002: 팀/플레이어 일일 prize earnings 사용 한도 비교
// (ThresholdCheck detector — F445 Path B var-vs-var, dailyPrizeLimit keyword 매칭)
// ---------------------------------------------------------------------------
export function applyPrizeLimit(
  db: Database.Database,
  teamId: string,
  contractId: string,
  prize: number,
): { teamId: string; contractId: string; dailyPrizeLimit: number; approved: boolean } {
  const contract = db
    .prepare('SELECT prize_earned, prize_limit FROM team_contracts WHERE id = ? AND team_id = ? LIMIT 1')
    .get(contractId, teamId) as { prize_earned: number; prize_limit: number } | undefined;

  if (!contract) throw new EsportsError('E404-CONTRACT', 'Team contract not found', 404);

  // F445 Path B: var-vs-var, left=`dailyPrizeLimit` (`limit` keyword 매칭)
  const dailyPrizeLimit = contract.prize_limit;

  if (contract.prize_earned + prize >= dailyPrizeLimit) {
    throw new EsportsError(
      'E422-DAILY-PRIZE-LIMIT-EXCEEDED',
      `Daily prize quota exhausted (${contract.prize_earned + prize} >= ${dailyPrizeLimit})`,
      422,
    );
  }

  db.prepare(`
    UPDATE team_contracts SET prize_earned = prize_earned + ? WHERE id = ?
  `).run(prize, contractId);

  return { teamId, contractId, dailyPrizeLimit, approved: true };
}

// ---------------------------------------------------------------------------
// ER-003: match 진행 atomic — matches + tournament_schedules 상태전환 + prize_distributions 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processMatch(
  db: Database.Database,
  organizerId: string,
  scheduleId: string,
  matchNo: string,
  amount: number,
): { matchId: string; prizeDistributionId: string; scheduleId: string; organizerId: string; startedAt: string } {
  const schedule = db
    .prepare("SELECT status FROM tournament_schedules WHERE id = ? AND status = 'registered'")
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new EsportsError('E404-SCHEDULE', 'Registered tournament not found', 404);

  const matchId = randomUUID();
  const prizeDistributionId = randomUUID();
  const startedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO matches (id, organizer_id, schedule_id, match_no, status, started_at)
      VALUES (?, ?, ?, ?, 'live', ?)
    `).run(matchId, organizerId, scheduleId, matchNo, startedAt);

    db.prepare(`
      UPDATE tournament_schedules SET status = 'live', match_id = ?, prize_distribution_id = ? WHERE id = ?
    `).run(matchId, prizeDistributionId, scheduleId);

    db.prepare(`
      INSERT INTO prize_distributions (id, schedule_id, match_id, amount, status, distributed_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
    `).run(prizeDistributionId, scheduleId, matchId, amount, startedAt);
  });
  tx();

  return { matchId, prizeDistributionId, scheduleId, organizerId, startedAt };
}

// ---------------------------------------------------------------------------
// ER-004: tournament 상태 전환 (announced → registered → live → completed → archived / cancelled / forfeited)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionTournamentStatus(
  db: Database.Database,
  scheduleId: string,
  newStatus: 'registered' | 'live' | 'completed' | 'archived' | 'cancelled' | 'forfeited',
): { scheduleId: string; previousStatus: string; newStatus: string } {
  const schedule = db
    .prepare('SELECT status FROM tournament_schedules WHERE id = ?')
    .get(scheduleId) as { status: string } | undefined;

  if (!schedule) throw new EsportsError('E404-SCHEDULE', 'Tournament schedule not found', 404);

  const previousStatus = schedule.status;
  const allowed =
    (schedule.status === 'announced' && newStatus === 'registered') ||
    (schedule.status === 'registered' && newStatus === 'live') ||
    (schedule.status === 'live' && newStatus === 'completed') ||
    (schedule.status === 'completed' && newStatus === 'archived') ||
    (schedule.status === 'announced' && newStatus === 'cancelled') ||
    (schedule.status === 'registered' && newStatus === 'cancelled') ||
    (schedule.status === 'live' && newStatus === 'forfeited') ||
    (schedule.status === 'registered' && newStatus === 'forfeited');

  if (!allowed) {
    throw new EsportsError(
      'E409-SCHEDULE',
      `Cannot transition tournament schedule from ${previousStatus} to ${newStatus}`,
      409,
    );
  }

  db.prepare(`UPDATE tournament_schedules SET status = ? WHERE id = ?`).run(newStatus, scheduleId);

  return { scheduleId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// ER-005: 만료 forfeited match batch 일괄 만료 처리 (batch expire marking)
// (StatusTransition detector — batch 패턴, BR-005/NW-005/SM-005/VD-005/GM-005/AD-005/TX-005/PB-005 50번째 재사용)
// ---------------------------------------------------------------------------
export function expireForfeitedMatchBatch(
  db: Database.Database,
  now: string,
): { expiredCount: number; expiredIds: string[] } {
  const candidates = db
    .prepare(`
      SELECT id FROM matches
      WHERE status = 'forfeited'
        AND started_at <= ?
    `)
    .all(now) as Array<{ id: string }>;

  const expiredIds: string[] = [];

  for (const item of candidates) {
    db.prepare(`
      UPDATE matches
      SET status = 'expired'
      WHERE id = ?
    `).run(item.id);
    expiredIds.push(item.id);
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ---------------------------------------------------------------------------
// ER-006: prize 회수 atomic — forfeited match 시 prize 비용 + 회수 비율 + 회수 트랜잭션
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function processPrizeClawback(
  db: Database.Database,
  teamId: string,
  matchId: string,
  prizeCost: number,
  clawbackRate: number,
): { clawbackRecordId: string; clawbackId: string; teamId: string; clawbackAmount: number; clawedBackAt: string } {
  const match = db
    .prepare("SELECT status FROM matches WHERE id = ? AND status = 'forfeited'")
    .get(matchId) as { status: string } | undefined;

  if (!match) throw new EsportsError('E404-FORFEITED-MATCH', 'Forfeited match not found', 404);

  const clawbackRecordId = randomUUID();
  const clawbackId = randomUUID();
  const clawbackAmount = Math.round(prizeCost * clawbackRate * 100) / 100;
  const clawedBackAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO prize_clawback_records (id, team_id, match_id, prize_cost, clawback_rate, clawback_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'calculated')
    `).run(clawbackRecordId, teamId, matchId, prizeCost, clawbackRate, clawbackAmount);

    db.prepare(`
      INSERT INTO prize_clawbacks (id, clawback_record_id, team_id, amount, status, clawed_back_at)
      VALUES (?, ?, ?, ?, 'clawed_back', ?)
    `).run(clawbackId, clawbackRecordId, teamId, clawbackAmount, clawedBackAt);

    db.prepare(`
      UPDATE prize_clawback_records SET status = 'clawed_back' WHERE id = ?
    `).run(clawbackRecordId);
  });
  tx();

  return { clawbackRecordId, clawbackId, teamId, clawbackAmount, clawedBackAt };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class EsportsError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'EsportsError';
  }
}
