# Engineer Workbench 사용 가이드

> **대상**: Analyst / Engineer 역할  
> **목표**: Skill 카탈로그 → Spec→Source 역추적 3클릭 완료

---

## 1. 시작하기

1. `https://decode-x.ktds-axbd.workers.dev` 접속
2. Cloudflare Access 화면에서 **Google로 로그인** 클릭
3. `@ktds-axbd.com` 계정으로 인증
4. 역할이 `engineer` 또는 `analyst`이면 Engineer Workbench로 자동 이동

---

## 2. Skill 카탈로그 탐색

- `/skills` 페이지에서 도메인별 필터(pension / giftvoucher) 적용
- Trust Score 기준 정렬 — **AI-Ready Score ≥ 0.80** 권장
- Skill 카드 클릭 → Skill Detail 페이지 이동

---

## 3. Spec→Source 역추적 (Split View, S221+)

> **주의**: Split View는 Sprint 221(S221) 이후 활성화됩니다. S219 현재는 Skill Detail 페이지만 제공.

1. Skill Detail 좌측: **Policy 목록** 확인
2. 우측 패널 `Provenance Inspector` 버튼 클릭 (S221+)
3. 재구성 마크다운에서 해당 section 앵커로 자동 스크롤

### Fallback 상태 해석

| 배지 | 의미 | 대응 |
|------|------|------|
| `완전 연결` | pageRef + section 모두 존재 | 정상 |
| `원본 페이지 앵커 없음` | section만 존재 (pageRef 없음) | F365 예정 |
| `원본 근거 미존재` | provenance.yaml 부재 | Issue Raise 버튼으로 신고 |

---

## 4. 레거시 모드 접근

기존 5 페르소나 화면이 필요한 경우: URL에 `?legacy=1` 추가  
예: `https://decode-x.ktds-axbd.workers.dev/skills?legacy=1`

---

## 5. 자주 묻는 질문

**Q: 로그인이 안 돼요**  
A: `@ktds-axbd.com` 계정인지 확인. 다른 도메인은 Allowlist에 없습니다. 추가가 필요하면 Admin에게 문의.

**Q: 역할이 잘못 표시돼요**  
A: Admin에게 역할 변경 요청. `/admin/users` 페이지에서 PATCH 가능.
