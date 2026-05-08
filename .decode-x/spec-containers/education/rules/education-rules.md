# Spec Container — EDUCATION-001 (교육 산업 합성 도메인)

**Skill ID**: EDUCATION-001
**Domain**: Education (교육 산업 — 학생/수강/학점/학기)
**Source**: SYNTHETIC — Sprint 287 F453, withRuleId 재사용 17번째 도메인 PoC (Healthcare 다음 산업, 6번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (ED-001 ~ ED-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| ED-001 | 학생 등록 시 | `MIN_STUDENT_AGE ≤ studentAge ≤ MAX_STUDENT_AGE` (6~100) | `students` INSERT (status='active') | `E422-AGE-MIN` 또는 `E422-AGE-MAX` |
| ED-002 | 수강 학점 한도 검증 | `student.status='active'` AND `MAX_CREDITS_PER_TERM - enrolledCredits ≥ requestedCredits` | `canEnroll=true`, remainingCreditsLimit 반환 | `E404-ST`, `E409-ST`, `E422-LIMIT` |
| ED-003 | 수강 신청 | course open + capacity 여유 | atomic transaction (`enrollments` INSERT status='enrolled' + `courses.enrolled_count++`) | `E404-CO`, `E409-CO`, `E422-FULL` |
| ED-004 | 수강 상태 전환 (enrolled → completed/withdrawn/failed, completed → graded) | 허용 매트릭스 충족 | `enrollments.status` UPDATE + completed_at/withdrawn_at | `E409-TR` |
| ED-005 | 학기 만료 시 미수료 자동 처리 (정기 batch) | `term.term_end < now` AND `enrollment.status='enrolled'` | `status='failed'`, completed_at=now, 마킹된 enrollmentIds 반환 | term 미존재 또는 term_end 미도달 시 skip |
| ED-006 | 수강 취소 + 환불 | `status='enrolled'` | atomic transaction (`status='withdrawn'` + `courses.enrolled_count--`. 학기 시작 7일 이전 시 100% 환불, 미만 시 0원) | `E404-EN`, `E409-EN` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `students` | INSERT (ED-001) | registerStudent |
| `enrollments` | INSERT (ED-003) / status 전환 (ED-004/005/006) | enrollCourse / transitionEnrollmentStatus / markFailedEnrollmentsByTerm / withdrawEnrollmentWithRefund |
| `courses` | enrolled_count++ (ED-003) / -- (ED-006) | enrollCourse / withdrawEnrollmentWithRefund |
| `terms` | (외부 관리) | (외부) |

---

## 임계값 / 상수

- `MIN_STUDENT_AGE = 6` (ED-001 최소 연령)
- `MAX_STUDENT_AGE = 100` (ED-001 최대 연령)
- `MAX_CREDITS_PER_TERM = 24` (ED-002 학기당 최대 학점)
- `REFUND_DAYS_BEFORE_TERM = 7` (ED-006 환불 가능 기간)

---

## 상태 머신

```
student: [registerStudent] → active
student: active → suspended / graduated / dropped (외부)

enrollment: [enrollCourse] → enrolled
enrollment: enrolled → completed (ED-004, 정상 수료)
enrollment: enrolled → withdrawn (ED-004 또는 ED-006)
enrollment: enrolled → failed (ED-004 또는 ED-005 batch)
enrollment: completed → graded (ED-004, 성적 입력)
```

---

## 권한

- **registerStudent**: 본인 또는 ADMIN
- **checkCreditsLimit**: 학생 본인 또는 학적 시스템
- **enrollCourse**: 학생 본인
- **transitionEnrollmentStatus**: 교수/학적팀 또는 시스템
- **markFailedEnrollmentsByTerm**: SYSTEM (학기 종료 cron)
- **withdrawEnrollmentWithRefund**: 본인 또는 ADMIN

---

## 관련 문서

- `rules/ED-001.md` ~ `rules/ED-006.md` — 개별 BL detail
- `runbooks/ED-001.md` ~ `runbooks/ED-006.md` — operational runbooks
- `tests/ED-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/education.ts` — 합성 source
