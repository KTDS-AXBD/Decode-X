import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// FN-ED (ED-001~ED-006): Education 합성 도메인 — 17번째 도메인 (교육 산업, 6번째 신규 산업)
//   - education spec-container rules.md 기반 PoC source
//   - 합성 schema: students, courses, enrollments, terms
//   - 교육 lifecycle 패턴 — 학생등록/수강한도/수강신청/상태/학기만료/환불
//   - withRuleId 재사용 17번째 도메인 (신규 detector 0개, 15 Sprint 연속 정점)
//   - EducationError code-in-message 패턴 (S275 표준)
//   - detector 신뢰도 5 Sprint cascade(S278~S282) + 5 산업 연속 입증(S278+S283~S286) 활용
// ---------------------------------------------------------------------------

export interface StudentRow {
  id: string;
  user_id: string;
  student_age: number;
  grade_level: string;       // ELEMENTARY | MIDDLE | HIGH | UNDERGRAD | GRAD
  status: string;            // active | suspended | graduated | dropped
  enrolled_at: string;
}

export interface EnrollmentRow {
  id: string;
  student_id: string;
  course_id: string;
  term_id: string;
  credits: number;
  fee_krw: number;
  status: string;            // enrolled | completed | graded | withdrawn | failed
  enrolled_at: string;
  completed_at: string | null;
  withdrawn_at: string | null;
}

export interface CourseRow {
  id: string;
  capacity: number;
  enrolled_count: number;
  status: string;            // open | full | closed
}

const MIN_STUDENT_AGE = 6;
const MAX_STUDENT_AGE = 100;
const MAX_CREDITS_PER_TERM = 24;
const REFUND_DAYS_BEFORE_TERM = 7;

// ---------------------------------------------------------------------------
// ED-001: 학생 등록 (6 ≤ age ≤ 100)
// (ThresholdCheck detector — F445 Path A var-vs-UPPERCASE)
// ---------------------------------------------------------------------------
export function registerStudent(
  db: Database.Database,
  userId: string,
  studentAge: number,
  gradeLevel: string,
): { studentId: string; status: string } {
  if (studentAge < MIN_STUDENT_AGE) {
    throw new EducationError('E422-AGE-MIN', `Age below minimum (${studentAge} < ${MIN_STUDENT_AGE})`, 422);
  }
  if (studentAge > MAX_STUDENT_AGE) {
    throw new EducationError('E422-AGE-MAX', `Age above maximum (${studentAge} > ${MAX_STUDENT_AGE})`, 422);
  }

  const studentId = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO students (id, user_id, student_age, grade_level, status, enrolled_at)
    VALUES (?, ?, ?, ?, 'active', ?)
  `).run(studentId, userId, studentAge, gradeLevel, now);

  return { studentId, status: 'active' };
}

// ---------------------------------------------------------------------------
// ED-002: 수강 한도 검증 (totalCredits + requestedCredits ≤ MAX_CREDITS_PER_TERM)
// (ThresholdCheck detector — F445 Path B var-vs-var, creditsLimit ≥ requestedCredits)
// ---------------------------------------------------------------------------
export function checkCreditsLimit(
  db: Database.Database,
  studentId: string,
  termId: string,
  requestedCredits: number,
): { canEnroll: boolean; remainingCreditsLimit: number } {
  const student = db
    .prepare('SELECT status FROM students WHERE id = ?')
    .get(studentId) as { status: string } | undefined;

  if (!student) {
    throw new EducationError('E404-ST', 'Student not found', 404);
  }
  if (student.status !== 'active') {
    throw new EducationError('E409-ST', `Student not active (status=${student.status})`, 409);
  }

  // 현재 학기에 enrolled된 credits 합산
  const enrolledCredits = db
    .prepare(`
      SELECT COALESCE(SUM(credits), 0) AS total
      FROM enrollments
      WHERE student_id = ? AND term_id = ? AND status IN ('enrolled', 'completed')
    `)
    .get(studentId, termId) as { total: number };

  const creditsLimit = MAX_CREDITS_PER_TERM - enrolledCredits.total;
  // F445 Path B: var-vs-var, left=`creditsLimit` (`limit` keyword 매칭)
  if (creditsLimit < requestedCredits) {
    throw new EducationError('E422-LIMIT', `Credits limit exceeded (${requestedCredits} > ${creditsLimit})`, 422);
  }
  return { canEnroll: true, remainingCreditsLimit: creditsLimit - requestedCredits };
}

// ---------------------------------------------------------------------------
// ED-003: 수강 신청 atomic (enrollment INSERT + course enrolled_count UPDATE)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function enrollCourse(
  db: Database.Database,
  studentId: string,
  courseId: string,
  termId: string,
  credits: number,
  feeKrw: number,
): { enrollmentId: string; status: string; enrolledAt: string } {
  const course = db
    .prepare('SELECT capacity, enrolled_count, status FROM courses WHERE id = ?')
    .get(courseId) as { capacity: number; enrolled_count: number; status: string } | undefined;

  if (!course) throw new EducationError('E404-CO', 'Course not found', 404);
  if (course.status !== 'open') {
    throw new EducationError('E409-CO', `Course not open (status=${course.status})`, 409);
  }
  if (course.enrolled_count >= course.capacity) {
    throw new EducationError('E422-FULL', 'Course full', 422);
  }

  const enrollmentId = randomUUID();
  const enrolledAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO enrollments (id, student_id, course_id, term_id, credits, fee_krw, status, enrolled_at, completed_at, withdrawn_at)
      VALUES (?, ?, ?, ?, ?, ?, 'enrolled', ?, NULL, NULL)
    `).run(enrollmentId, studentId, courseId, termId, credits, feeKrw, enrolledAt);
    db.prepare(`UPDATE courses SET enrolled_count = enrolled_count + 1 WHERE id = ?`)
      .run(courseId);
  });
  tx();

  return { enrollmentId, status: 'enrolled', enrolledAt };
}

// ---------------------------------------------------------------------------
// ED-004: 수강 상태 전환 (enrolled → completed → graded, enrolled → withdrawn / failed)
// (StatusTransition detector)
// ---------------------------------------------------------------------------
export function transitionEnrollmentStatus(
  db: Database.Database,
  enrollmentId: string,
  newStatus: 'completed' | 'graded' | 'withdrawn' | 'failed',
): { enrollmentId: string; previousStatus: string; newStatus: string } {
  const enrollment = db
    .prepare('SELECT status FROM enrollments WHERE id = ?')
    .get(enrollmentId) as { status: string } | undefined;

  if (!enrollment) throw new EducationError('E404-EN', 'Enrollment not found', 404);

  const previousStatus = enrollment.status;
  const allowed =
    (previousStatus === 'enrolled' && ['completed', 'withdrawn', 'failed'].includes(newStatus)) ||
    (previousStatus === 'completed' && newStatus === 'graded');

  if (!allowed) {
    throw new EducationError('E409-TR', `Cannot transition from ${previousStatus} to ${newStatus}`, 409);
  }

  const now = new Date().toISOString();
  const fieldMap: Record<string, string> = {
    completed: 'completed_at',
    graded: 'completed_at',
    withdrawn: 'withdrawn_at',
    failed: 'completed_at',
  };
  const field = fieldMap[newStatus] ?? 'completed_at';

  db.prepare(`UPDATE enrollments SET status = ?, ${field} = ? WHERE id = ?`)
    .run(newStatus, now, enrollmentId);

  return { enrollmentId, previousStatus, newStatus };
}

// ---------------------------------------------------------------------------
// ED-005: 학기 만료 시 미수료 자동 마킹 (term_end < now AND status='enrolled' → 'failed' batch)
// (StatusTransition detector — batch 패턴, CC/DV/SB/IN/HC-005 동일 형태 6번째)
// ---------------------------------------------------------------------------
export function markFailedEnrollmentsByTerm(
  db: Database.Database,
  termId: string,
  asOfDate: string = new Date().toISOString(),
): { markedCount: number; failedEnrollmentIds: string[] } {
  const term = db
    .prepare('SELECT term_end FROM terms WHERE id = ?')
    .get(termId) as { term_end: string } | undefined;

  if (!term) throw new EducationError('E404-TM', 'Term not found', 404);
  if (term.term_end > asOfDate) {
    return { markedCount: 0, failedEnrollmentIds: [] };
  }

  const candidates = db
    .prepare(`
      SELECT id FROM enrollments
      WHERE term_id = ? AND status = 'enrolled'
    `)
    .all(termId) as Array<{ id: string }>;

  const failedEnrollmentIds: string[] = [];
  for (const e of candidates) {
    db.prepare(`UPDATE enrollments SET status = 'failed', completed_at = ? WHERE id = ?`)
      .run(asOfDate, e.id);
    failedEnrollmentIds.push(e.id);
  }

  return { markedCount: failedEnrollmentIds.length, failedEnrollmentIds };
}

// ---------------------------------------------------------------------------
// ED-006: 수강 취소 + 환불 atomic (학기 시작 7일 이전 시 100% 환불)
// (AtomicTransaction detector)
// ---------------------------------------------------------------------------
export function withdrawEnrollmentWithRefund(
  db: Database.Database,
  enrollmentId: string,
  termStartDate: string,
  reason: string,
): { refundAmount: number; withdrawnAt: string; courseSpotReleased: boolean } {
  const enrollment = db
    .prepare('SELECT course_id, fee_krw, status FROM enrollments WHERE id = ?')
    .get(enrollmentId) as { course_id: string; fee_krw: number; status: string } | undefined;

  if (!enrollment) throw new EducationError('E404-EN', 'Enrollment not found', 404);
  if (enrollment.status !== 'enrolled') {
    throw new EducationError('E409-EN', `Cannot withdraw status=${enrollment.status}`, 409);
  }

  const startDate = new Date(termStartDate);
  const now = new Date();
  const daysBefore = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  // 학기 시작 7일 이전 취소 시 100% 환불, 미만 시 0원
  const refundAmount = daysBefore >= REFUND_DAYS_BEFORE_TERM ? enrollment.fee_krw : 0;
  const withdrawnAt = now.toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE enrollments SET status = 'withdrawn', withdrawn_at = ? WHERE id = ?`)
      .run(withdrawnAt, enrollmentId);
    db.prepare(`UPDATE courses SET enrolled_count = enrolled_count - 1 WHERE id = ?`)
      .run(enrollment.course_id);
  });
  tx();

  void reason;
  return { refundAmount, withdrawnAt, courseSpotReleased: true };
}

// ---------------------------------------------------------------------------
// Error class — code-in-message 패턴 (S275 표준)
// ---------------------------------------------------------------------------
export class EducationError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'EducationError';
  }
}
