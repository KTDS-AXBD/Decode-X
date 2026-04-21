# Admin Operations 가이드

> **대상**: Admin 역할  
> **목표**: 사용자 관리, 역할 설정, 감사 로그 조회

---

## 1. 사용자 관리 (S221+)

> **주의**: Admin Users CRUD UI는 Sprint 221(S221) 이후 활성화됩니다.  
> 현재 bootstrap은 `ADMIN_ALLOWLIST_EMAILS` 환경 변수로 초기 Admin 설정.

### API 직접 호출 (임시)

```bash
# 사용자 역할 변경 (admin 전용)
curl -X PATCH https://svc-skill.ktds-axbd.workers.dev/internal/admin/users/user@example.com \
  -H "Cf-Access-Jwt-Assertion: <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"primary_role": "executive"}'
```

---

## 2. 역할 체계

| 역할 | 접근 범위 | 기본 신규 사용자 |
|------|----------|:---------------:|
| `admin` | 모든 관리 기능 + 사용자 CRUD | ❌ |
| `executive` | Executive View + 읽기 전용 전체 | ❌ |
| `engineer` | Engineer Workbench + Skill 조작 | ✅ |

신규 사용자 첫 로그인 시 `engineer` 역할 자동 부여. Admin이 승격 필요.

---

## 3. 감사 로그 (S221+)

감사 로그는 `audit_log` D1 테이블에 기록됨:

- `login` — 사용자 로그인
- `skill.view` — Skill 상세 조회
- `provenance.resolve` — Provenance 역추적 호출
- `admin.user.update` — 역할/상태 변경

---

## 4. 환경 변수 (배포 담당자)

| 변수 | 용도 | 설정 방법 |
|------|------|----------|
| `ADMIN_ALLOWLIST_EMAILS` | 초기 Admin 이메일 (콤마 구분) | `wrangler secret put` |
| `CF_ACCESS_AUD` | CF Access JWT audience 검증 | `wrangler secret put` |
